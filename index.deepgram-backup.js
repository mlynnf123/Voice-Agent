import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import twilio from 'twilio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const {
    OPENAI_API_KEY,
    DEEPGRAM_API_KEY,
    CARTESIA_API_KEY,
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    SERVER_URL,
    CALCOM_API_KEY,
} = process.env;

if (!OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }
if (!DEEPGRAM_API_KEY) { console.error('Missing DEEPGRAM_API_KEY'); process.exit(1); }
if (!CARTESIA_API_KEY) { console.error('Missing CARTESIA_API_KEY'); process.exit(1); }
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) { console.error('Missing Twilio creds'); process.exit(1); }
if (!SERVER_URL) { console.error('Missing SERVER_URL'); process.exit(1); }
if (!CALCOM_API_KEY) { console.warn('⚠️  Missing CALCOM_API_KEY — booking tool will fail'); }

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// ── Agents from agents.json ─────────────────────────────────────────────────
function loadAgents() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'agents.json'), 'utf-8');
        return JSON.parse(data).agents || {};
    } catch {
        return {};
    }
}

function loadAgent(agentId) {
    const agents = loadAgents();
    return agents[agentId] || null;
}

function loadKnowledgeBase(knowledgeFolder) {
    const knowledgeDir = path.join(__dirname, knowledgeFolder || 'knowledge');
    if (!fs.existsSync(knowledgeDir)) return '';
    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
    if (files.length === 0) return '';
    let content = '\n\n# Knowledge Base\n\n';
    for (const file of files) {
        const text = fs.readFileSync(path.join(knowledgeDir, file), 'utf-8');
        content += `## ${file}\n${text}\n\n`;
    }
    return content;
}

function logCall(callData) {
    const callsPath = path.join(__dirname, 'calls.json');
    let calls = [];
    try { calls = JSON.parse(fs.readFileSync(callsPath, 'utf-8')); } catch {}
    calls.unshift({ id: Date.now().toString(), timestamp: new Date().toISOString(), ...callData });
    fs.writeFileSync(callsPath, JSON.stringify(calls, null, 2));
}

const PORT = process.env.PORT || 5050;
const callVariables = new Map();

// ── Cal.com Booking Tool Definition (OpenAI function calling format) ────────
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'book_meeting',
            description: 'Books a free roofing inspection appointment on the Cal.com calendar. Call this when the homeowner agrees to schedule an inspection and you have collected their name, email, preferred date/time, and timezone.',
            parameters: {
                type: 'object',
                properties: {
                    attendee_name: {
                        type: 'string',
                        description: 'Full name of the person booking (e.g. "John Smith")',
                    },
                    attendee_email: {
                        type: 'string',
                        description: 'Email address of the person booking',
                    },
                    attendee_timezone: {
                        type: 'string',
                        description: 'Timezone in IANA format like "America/Chicago" or "America/New_York". Default to America/Chicago for Austin TX area.',
                    },
                    start_time: {
                        type: 'string',
                        description: 'Start time in ISO 8601 UTC format, e.g. "2026-02-20T15:00:00Z". Convert from the caller\'s preferred time.',
                    },
                },
                required: ['attendee_name', 'attendee_email', 'start_time'],
            },
        },
    },
];

// ── Execute Cal.com booking ─────────────────────────────────────────────────
async function executeBookMeeting({ attendee_name, attendee_email, attendee_timezone, start_time }, calcomEventTypeId) {
    const tz = attendee_timezone || 'America/Chicago';
    const eventTypeId = calcomEventTypeId || 4522154;

    const body = {
        eventTypeId,
        start: start_time,
        attendee: {
            name: attendee_name,
            email: attendee_email,
            timeZone: tz,
        },
    };

    console.log('📅 Booking Cal.com meeting:', JSON.stringify(body, null, 2));

    try {
        const resp = await fetch('https://api.cal.com/v2/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CALCOM_API_KEY}`,
                'cal-api-version': '2024-08-13',
            },
            body: JSON.stringify(body),
        });

        const data = await resp.json();
        console.log('📅 Cal.com response:', resp.status, JSON.stringify(data, null, 2));

        if (resp.ok && data.status === 'ACCEPTED') {
            return {
                success: true,
                message: `Booking confirmed! Inspection scheduled for ${start_time}. A confirmation email has been sent to ${attendee_email}.`,
                booking_id: data.data?.id || data.id,
            };
        } else {
            return {
                success: false,
                message: `Booking failed: ${data.message || data.error || JSON.stringify(data)}. Let the caller know you'll have the office follow up to schedule manually.`,
            };
        }
    } catch (err) {
        console.error('📅 Cal.com booking error:', err);
        return {
            success: false,
            message: `Booking system error: ${err.message}. Apologize and let them know the office will call to confirm.`,
        };
    }
}

// ── System Prompt ───────────────────────────────────────────────────────────
function buildSystemPrompt({ first_name, address }) {
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
    const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

    return `# Personality

You are Jamie, an outbound calling agent at J&J Roofing Pros in Austin, Texas. You're a real person on the team — friendly, helpful, and good at your job. Never mention AI, bots, or anything like that.

# Environment

You are making outbound phone calls to businesses in the Austin, Texas area, on behalf of JJ Roofing. You're calling to inquire about their properties and assess their potential need for roofing services. You have access to company information, property data, and scheduling tools. When making the first call, Wait for the prospect to say 'Hello' or answer the phone before you start speaking. SYSTEM CONTEXT: Today's date is ${currentDate} and the current time is ${currentTime}. The caller's timezone is America/Chicago.

# Tone

Your tone is highly professional, authoritative yet consultative, and empathetic. You do not sound like a high-pressure salesperson; you sound like an elite structural diagnostician.

Sound like a real person:
- Speak at a natural pace, especially in the greeting.
- Short responses. 1-2 sentences max, then pause or ask a question.
- Use filler words naturally: "yeah," "gotcha," "for sure," "oh nice," "ah okay"
- Contractions always: "we're," "you'll," "that's," "I'll"
- Acknowledge before responding: "Oh gotcha..." "Ah, okay..." "Mm-hmm..."
- Do not interrupt the user ever, wait till they are finished speaking. Don't interrupt with filler words either.
- If there is no quick response after asking a question or saying something, please wait until the user says or replies back before you say anything again.
- NEVER repeat yourself. If you already said your greeting, do NOT say it again. Move the conversation forward naturally.
- If there's silence after you speak, wait patiently. Do NOT fill silence by repeating what you just said.

Conversation rhythm:
- Listen → Acknowledge → Respond briefly → Ask a question
- Don't interrupt the user. Allow them to finish speaking before responding.
- Pause after asking something. Let them talk.

Opening:
- Start every call the same way: "Hey, this is Jamie calling from J&J Roofing. I was hoping to ask a quick question about the property at ${address}."
- Short. Friendly. Direct. Sound natural!
- Say this opening ONLY ONCE. After that, never repeat it.

# Lead Information
- Contact first name: ${first_name}
- Property address: ${address}

# Goal

Your primary goal is to qualify leads and schedule roofing inspections for J&J Roofing Pros.

1. **Initial Contact and Property Confirmation:**
   - Start the call with the standard opening.
   - Confirm you're speaking with the property owner or manager.
   - Verify the property address.

2. **Lead Qualification:**
   - Determine the current condition of the roof (age, visible issues).
   - Ask about any recent roofing work or inspections.
   - Identify the type of roof (flat, shingle, metal, etc.).
   - Gauge their interest in a free roofing inspection.
   - During the conversation, do not ask more than 3 questions.

3. **Scheduling (If Qualified):**
   - Collect all necessary information:
     - Name (first and last)
     - Phone (repeat back to confirm)
     - Address (full address with city)
     - Email (repeat back to them to confirm you have spelling correct) - this is needed for booking the appointment
     - What they need (inspection, repair, storm damage, etc.)
     - Preferred date
     - Preferred time (morning/afternoon, or specific)
     - Notes (optional — anything else helpful)
   - Confirm the appointment details with the contact.
   - Use the book_meeting tool with the collected information.
   - If successful, confirm the appointment and explain that someone will call 30 minutes prior.
   - If unsuccessful, apologize and offer to have the office call them back.

4. **Handling Objections:**
   - "We're not interested": Politely thank them for their time and end the call.
   - "We just had our roof inspected": Ask when the inspection was and if they have any concerns. If recent and no concerns, thank them. If old or concerns, proceed with qualification.
   - "Send me some information": Offer to email information and follow up with a call.
   - "We use another roofing company": Acknowledge and ask if they're happy with their current service. If not, proceed with qualification.

5. **Answering Potential Questions (Anticipate):**
   - Who is J&J Roofing?: Briefly explain J&J Roofing Pros is a local, reputable roofing company.
   - Why are you calling?: Explain you're offering free roofing inspections to businesses who have been impacted by hail damage this year.

6. **Call to Action (Booking the Audit):** Once the prospect is qualified, transition to booking.
   - "Based on everything you've mentioned, I'd love to get you scheduled with a free inspection to start. From there we'll assess the damage and get you the best price possible. When is a good time this week for someone from our team to come by? You do not have to be there, but you can if you'd like."
   - If they agree: "What does your calendar look like for later this week?"
   - Use the book_meeting tool to lock in the appointment, confirm their best email address to send the invite, and politely end the call.`;
}

// ── GPT-4o Chat Completion (non-streaming, for tool calls) ──────────────────
async function callGPT4o(messages, temperature) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature,
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`GPT-4o API error ${resp.status}: ${errText}`);
    }

    return resp.json();
}

// ── GPT-4o Streaming Chat Completion ────────────────────────────────────────
async function streamGPT4o(messages, temperature, onSentence, onToolCall, onDone) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature,
            stream: true,
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`GPT-4o stream error ${resp.status}: ${errText}`);
    }

    let buffer = '';
    let fullText = '';
    let toolCalls = {};
    const sentenceSplitter = /(?<=[.!?])\s+/;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let partial = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop(); // keep incomplete line

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                // Handle tool calls
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index;
                        if (!toolCalls[idx]) {
                            toolCalls[idx] = { id: tc.id || '', function: { name: tc.function?.name || '', arguments: '' } };
                        }
                        if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                        if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                    continue;
                }

                // Handle text content
                if (delta.content) {
                    buffer += delta.content;
                    fullText += delta.content;

                    // Check for sentence boundary — send complete sentences to TTS immediately
                    const parts = buffer.split(sentenceSplitter);
                    if (parts.length > 1) {
                        // Send all complete sentences
                        for (let i = 0; i < parts.length - 1; i++) {
                            const sentence = parts[i].trim();
                            if (sentence) onSentence(sentence);
                        }
                        buffer = parts[parts.length - 1]; // keep remainder
                    }
                }
            } catch {}
        }
    }

    // Flush remaining buffer
    if (buffer.trim()) onSentence(buffer.trim());

    // Handle tool calls if any
    const toolCallArray = Object.values(toolCalls);
    if (toolCallArray.length > 0) {
        onToolCall(toolCallArray, fullText);
    }

    onDone(fullText, toolCallArray);
}

// ── Cartesia TTS WebSocket helper ───────────────────────────────────────────
function connectCartesia() {
    const url = `wss://api.cartesia.ai/tts/websocket?api_key=${CARTESIA_API_KEY}&cartesia_version=2025-04-16`;
    const ws = new WebSocket(url);
    return ws;
}

function sendCartesiaTTS(cartesiaWs, text, contextId, config = {}, emotion = null) {
    const voiceId = config.cartesiaVoiceId;
    const speed = config.ttsSpeed ?? 1.1;
    const generationConfig = { speed };
    if (emotion) generationConfig.emotion = emotion;
    const msg = {
        context_id: contextId,
        model_id: 'sonic-3',
        transcript: text,
        voice: {
            mode: 'id',
            id: voiceId,
        },
        output_format: {
            container: 'raw',
            encoding: 'pcm_mulaw',
            sample_rate: 8000,
        },
        generation_config: generationConfig,
    };
    cartesiaWs.send(JSON.stringify(msg));
}

// ── Routes ──────────────────────────────────────────────────────────────────

fastify.get('/', async (req, reply) => {
    reply.send({ message: 'Voice Agent is running!', tools: ['book_meeting'], pipeline: 'Deepgram STT → GPT-4o → Cartesia TTS' });
});

fastify.post('/make-call', async (request, reply) => {
    const { to_number, first_name, address, agent_id } = request.body || {};
    if (!to_number || !first_name || !address || !agent_id) {
        return reply.status(400).send({ error: 'Missing: to_number, first_name, address, agent_id' });
    }

    const agent = loadAgent(agent_id);
    if (!agent) {
        return reply.status(404).send({ error: `Agent not found: ${agent_id}` });
    }
    if (!agent.active) {
        return reply.status(400).send({ error: `Agent is inactive: ${agent.name}` });
    }

    try {
        const call = await twilioClient.calls.create({
            to: to_number,
            from: agent.fromNumber,
            url: `${SERVER_URL}/outbound-call-twiml?first_name=${encodeURIComponent(first_name)}&address=${encodeURIComponent(address)}&agent_id=${encodeURIComponent(agent_id)}`,
            statusCallback: `${SERVER_URL}/call-status-webhook`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallbackMethod: 'POST',
        });
        console.log(`📞 Outbound call: ${call.sid} → ${to_number} (agent: ${agent.name})`);
        logCall({ to: to_number, firstName: first_name, address, status: 'initiated', callSid: call.sid, agentId: agent_id });
        reply.send({ success: true, callSid: call.sid, to: to_number });
    } catch (err) {
        console.error('❌ Call failed:', err);
        reply.status(500).send({ error: err.message });
    }
});

fastify.all('/outbound-call-twiml', async (request, reply) => {
    console.log('📋 TwiML requested:', request.method, request.url);
    const first_name = request.query.first_name || 'there';
    const address = request.query.address || 'your property';
    const agent_id = request.query.agent_id || '';
    const callSid = (request.body && request.body.CallSid) || request.query.CallSid || 'unknown';
    callVariables.set(callSid, { first_name, address, agent_id });

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://${new URL(SERVER_URL).host}/media-stream">
            <Parameter name="first_name" value="${first_name}" />
            <Parameter name="address" value="${address}" />
            <Parameter name="agent_id" value="${agent_id}" />
        </Stream>
    </Connect>
</Response>`;
    reply.type('text/xml').send(twimlResponse);
});

fastify.post('/call-status-webhook', async (request, reply) => {
    const { CallSid, CallStatus, Duration } = request.body || {};
    console.log(`📊 Status: ${CallSid} → ${CallStatus}${Duration ? ` (${Duration}s)` : ''}`);
    reply.send({ received: true });
});

fastify.get('/call-status/:callSid', async (request, reply) => {
    try {
        const call = await twilioClient.calls(request.params.callSid).fetch();
        reply.send({ callSid: call.sid, status: call.status, to: call.to, duration: call.duration });
    } catch (err) {
        reply.status(404).send({ error: `Call not found: ${request.params.callSid}` });
    }
});

// ── WebSocket media-stream ──────────────────────────────────────────────────

fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log('🔌 Client connected to media-stream');

        let agent = null;
        let agentId = '';

        let streamSid = null;
        let firstName = 'there';
        let address = 'your property';

        // Conversation history for GPT-4o
        let messages = [];
        let systemPromptText = '';

        // Transcript accumulator (collects partial finals into a full utterance)
        let transcriptBuffer = '';
        let finalTimer = null;

        // TTS state
        let cartesiaWs = null;
        let cartesiaReady = false;
        let isSpeaking = false;         // true while TTS audio is being sent to Twilio
        let lastAudioSentAt = 0;        // timestamp of last audio chunk sent to Twilio
        let currentContextId = null;     // Cartesia context_id for current TTS
        let ttsAborted = false;          // flag to stop sending audio after interruption

        // Deepgram WebSocket
        let deepgramWs = null;

        let deepgramReady = false;
        let pendingAudioChunks = []; // buffer audio until Deepgram is ready

        // ── Connect to Deepgram STT ──────────────────────────────────────
        function connectDeepgram() {
            const dgEndpointing = agent?.endpointingMs ?? 300;
            const dgUtteranceEnd = agent?.utteranceEndMs ?? 1000;
            const dgUrl = `wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1&model=nova-2&punctuate=true&interim_results=true&endpointing=${dgEndpointing}&utterance_end_ms=${dgUtteranceEnd}`;
            deepgramWs = new WebSocket(dgUrl, {
                headers: { 'Authorization': `Token ${DEEPGRAM_API_KEY}` },
            });

            deepgramWs.on('open', () => {
                console.log('✅ Connected to Deepgram STT');
                deepgramReady = true;
                // Flush any audio that arrived before Deepgram was ready
                for (const chunk of pendingAudioChunks) {
                    deepgramWs.send(chunk);
                }
                pendingAudioChunks = [];
            });

            deepgramWs.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);

                    // Handle speech_started — interrupt TTS
                    if (msg.type === 'Metadata' && msg.speech_final !== undefined) {
                        // Not a speech_started event, ignore
                    }

                    // Deepgram sends speech_started events
                    if (msg.type === 'SpeechStarted') {
                        handleSpeechStarted();
                        return;
                    }

                    // Utterance end — finalize whatever we've accumulated
                    if (msg.type === 'UtteranceEnd') {
                        clearTimeout(finalTimer); // cancel fast-flush, utterance_end wins
                        if (transcriptBuffer.trim()) {
                            const utterance = transcriptBuffer.trim();
                            transcriptBuffer = '';
                            console.log(`🗣️ User (utterance_end): "${utterance}"`);
                            handleUserUtterance(utterance);
                        }
                        return;
                    }

                    // Transcript results
                    if (msg.channel && msg.channel.alternatives && msg.channel.alternatives.length > 0) {
                        const transcript = msg.channel.alternatives[0].transcript;
                        if (!transcript) return;

                        if (msg.is_final) {
                            transcriptBuffer += (transcriptBuffer ? ' ' : '') + transcript;
                            console.log(`📝 Deepgram (final): "${transcript}"`);

                            if (msg.speech_final) {
                                // speech_final = Deepgram is confident they stopped talking
                                // Act immediately for any length
                                clearTimeout(finalTimer);
                                if (transcriptBuffer.trim()) {
                                    const utterance = transcriptBuffer.trim();
                                    transcriptBuffer = '';
                                    console.log(`🗣️ User (speech_final): "${utterance}"`);
                                    handleUserUtterance(utterance);
                                }
                            } else {
                                // is_final but NOT speech_final — they might still be talking
                                // Set a 600ms timer as fallback
                                clearTimeout(finalTimer);
                                finalTimer = setTimeout(() => {
                                    if (transcriptBuffer.trim()) {
                                        const utterance = transcriptBuffer.trim();
                                        transcriptBuffer = '';
                                        console.log(`🗣️ User (timer): "${utterance}"`);
                                        handleUserUtterance(utterance);
                                    }
                                }, 600);
                            }
                        }
                    }
                } catch (err) {
                    console.error('❌ Deepgram message parse error:', err);
                }
            });

            deepgramWs.on('close', () => console.log('🔌 Deepgram disconnected'));
            deepgramWs.on('error', (err) => console.error('❌ Deepgram error:', err));
        }

        // ── Connect to Cartesia TTS ──────────────────────────────────────
        function connectCartesiaTTS() {
            cartesiaWs = connectCartesia();

            cartesiaWs.on('open', () => {
                cartesiaReady = true;
                console.log('✅ Connected to Cartesia TTS');
            });

            cartesiaWs.on('message', (data) => {
                try {
                    // Cartesia sends JSON messages with audio data or status
                    const msg = JSON.parse(data.toString());

                    if (msg.type === 'chunk' && msg.data) {
                        // msg.data is base64-encoded raw mulaw audio
                        if (ttsAborted) return; // interrupted — discard

                        if (streamSid) {
                            connection.send(JSON.stringify({
                                event: 'media',
                                streamSid,
                                media: { payload: msg.data },
                            }));
                            lastAudioSentAt = Date.now();
                        }
                    } else if (msg.type === 'done' || msg.done) {
                        console.log('🔊 Cartesia TTS chunk complete');
                        if (!greetingDone) {
                            // Greeting finished — wait for echo to clear then start listening
                            setTimeout(() => {
                                isSpeaking = false;
                                ttsPlaying = false;
                                greetingDone = true;
                                console.log('✅ Greeting done, now listening');
                                if (ttsQueue.length > 0) playNextTTS();
                            }, 1200);
                        } else {
                            // Normal sentence — delay for echo, then next
                            if (ttsQueue.length > 0) {
                                // More sentences queued — short gap between sentences
                                setTimeout(() => {
                                    isSpeaking = false;
                                    playNextTTS();
                                }, 150);
                            } else {
                                // Last sentence — longer echo guard before listening
                                setTimeout(() => {
                                    isSpeaking = false;
                                    ttsPlaying = false;
                                }, 800);
                            }
                        }
                    }
                } catch {
                    // Binary frame — shouldn't happen with raw container, but handle gracefully
                    if (ttsAborted) return;
                    if (streamSid && Buffer.isBuffer(data)) {
                        const payload = data.toString('base64');
                        connection.send(JSON.stringify({
                            event: 'media',
                            streamSid,
                            media: { payload },
                        }));
                    }
                }
            });

            cartesiaWs.on('close', () => {
                console.log('🔌 Cartesia disconnected');
                cartesiaReady = false;
            });
            cartesiaWs.on('error', (err) => {
                console.error('❌ Cartesia error:', err);
                cartesiaReady = false;
            });
        }

        // ── Handle user speech detected (interruption) ───────────────────
        function handleSpeechStarted() {
            if (isSpeaking) {
                console.log('🛑 Interruption detected — stopping TTS playback');
                ttsAborted = true;
                isSpeaking = false;

                // Clear Twilio's audio buffer
                if (streamSid) {
                    connection.send(JSON.stringify({ event: 'clear', streamSid }));
                }

                // Cancel Cartesia generation by sending a cancel for the current context
                if (cartesiaWs && cartesiaReady && currentContextId) {
                    cartesiaWs.send(JSON.stringify({
                        context_id: currentContextId,
                        cancel: true,
                    }));
                }
            }
        }

        // ── Handle a complete user utterance ─────────────────────────────
                let lastAgentText = '';  // track last agent response for echo detection
        let greetingDone = false; // don't listen until greeting + echo clears

        // Keep a rolling buffer of all recent agent text for echo detection
        let recentAgentTexts = [];

        function isEcho(text) {
            if (recentAgentTexts.length === 0) return false;
            const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
            const userNorm = normalize(text);
            if (userNorm.length < 3) return false; // very short responses like "yes" are real

            // Combine all recent agent text into one string for matching
            const allAgentText = normalize(recentAgentTexts.join(' '));

            // Check if user text is a substring of agent text or vice versa
            if (allAgentText.includes(userNorm) || userNorm.includes(allAgentText)) return true;

            // Check word overlap — if >50% of user words appear in recent agent text, it's echo
            const userWords = userNorm.split(' ').filter(w => w.length > 2); // skip tiny words
            if (userWords.length === 0) return false;
            const agentWords = new Set(allAgentText.split(' '));
            const overlap = userWords.filter(w => agentWords.has(w)).length;
            return overlap / userWords.length > 0.5;
        }

        // Queue for sequential TTS — sentences are queued and played one at a time
        let ttsQueue = [];
        let ttsPlaying = false;

        function queueTTS(text) {
            ttsQueue.push(text);
            if (!ttsPlaying) playNextTTS();
        }

        function playNextTTS() {
            if (ttsQueue.length === 0) {
                ttsPlaying = false;
                return;
            }
            if (isSpeaking) {
                // Still speaking — done handler will call us again
                return;
            }
            ttsPlaying = true;
            const text = ttsQueue.shift();
            speakText(text);
        }

        // Override the done handler to play next sentence
        // We'll hook into the Cartesia 'done' event for this

        async function handleUserUtterance(text) {
            // Echo detection — skip if this is the agent's own voice
            if (isEcho(text)) {
                console.log(`🔇 Echo detected, ignoring: "${text}"`);
                return;
            }

            // Noise filter — ignore single filler/noise words within 3s of agent speaking
            const normalized = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
            const timeSinceSpeech = Date.now() - (lastAudioSentAt || 0);
            if (timeSinceSpeech < 3000 && normalized.split(' ').length <= 1) {
                console.log(`🔇 Noise filtered: "${text}" (${timeSinceSpeech}ms after speech)`);
                return;
            }

            // Add user message to conversation history
            messages.push({ role: 'user', content: text });

            // Clear any pending TTS queue (user interrupted) and echo buffer
            ttsQueue = [];
            recentAgentTexts = [];

            const temperature = agent?.temperature ?? 0.8;

            try {
                let sentenceCount = 0;
                let firstSentenceSent = false;
                let remainingSentences = [];
                const utteranceStart = Date.now();

                await streamGPT4o(
                    messages,
                    temperature,
                    // onSentence — send first sentence immediately, batch the rest
                    (sentence) => {
                        sentenceCount++;
                        console.log(`🤖 Agent [${sentenceCount}]: "${sentence}" (${Date.now() - utteranceStart}ms)`);
                        if (!firstSentenceSent) {
                            firstSentenceSent = true;
                            queueTTS(sentence);
                        } else {
                            remainingSentences.push(sentence);
                        }
                    },
                    // onToolCall — handle tool calls
                    async (toolCallArray, partialText) => {
                        // Add assistant message with tool calls
                        const assistantMsg = { role: 'assistant', content: partialText || null, tool_calls: toolCallArray };
                        messages.push(assistantMsg);

                        for (const toolCall of toolCallArray) {
                            const fnName = toolCall.function.name;
                            let args;
                            try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }

                            console.log(`🔧 Tool call: ${fnName}`, args);

                            let result;
                            if (fnName === 'book_meeting') {
                                result = await executeBookMeeting(args, agent?.calcomEventTypeId);
                            } else {
                                result = { success: false, message: `Unknown function: ${fnName}` };
                            }

                            console.log(`🔧 Tool result:`, result);
                            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
                        }

                        // Follow-up response after tool execution (non-streaming is fine here)
                        const followUp = await callGPT4o(messages, temperature);
                        const responseText = followUp.choices[0].message.content;
                        if (responseText) {
                            messages.push({ role: 'assistant', content: responseText });
                            console.log(`🤖 Agent (after tool): "${responseText}"`);
                            queueTTS(responseText);
                        }
                    },
                    // onDone — batch remaining sentences into one TTS chunk
                    (fullText, toolCallArray) => {
                        if (toolCallArray.length === 0 && fullText) {
                            messages.push({ role: 'assistant', content: fullText });
                        }
                        // Send remaining sentences as one natural chunk
                        if (remainingSentences.length > 0) {
                            const batch = remainingSentences.join(' ');
                            console.log(`🤖 Agent [batch]: "${batch}"`);
                            queueTTS(batch);
                            remainingSentences = [];
                        }
                        console.log(`⏱️ Total response time: ${Date.now() - utteranceStart}ms`);
                    }
                );
            } catch (err) {
                console.error('❌ GPT-4o error:', err);
            }
        }

        // ── Send text to Cartesia TTS ────────────────────────────────────
        function speakText(text, emotion = null) {
            lastAgentText = text;
            recentAgentTexts.push(text);
            if (recentAgentTexts.length > 5) recentAgentTexts.shift();
            if (!cartesiaWs || !cartesiaReady) {
                console.error('❌ Cartesia not connected, cannot speak');
                return;
            }

            ttsAborted = false;
            isSpeaking = true;
            currentContextId = `ctx-${Date.now()}`;

            sendCartesiaTTS(cartesiaWs, text, currentContextId, agent || {}, emotion);
        }

        // ── Initialize session ───────────────────────────────────────────
        function initializeSession() {
            // Build system prompt — use agent's systemPrompt if it exists, otherwise fall back to built-in
            if (agent && agent.systemPrompt) {
                // Replace template variables in the agent's system prompt
                const now = new Date();
                const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
                const currentTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
                systemPromptText = agent.systemPrompt
                    .replace(/\{\{current_date\}\}/g, currentDate)
                    .replace(/\{\{current_time\}\}/g, currentTime)
                    .replace(/\{\{caller_timezone\}\}/g, 'America/Chicago')
                    .replace(/\{\{first_name\}\}/g, firstName)
                    .replace(/\{\{address\}\}/g, address);
            } else {
                systemPromptText = buildSystemPrompt({ first_name: firstName, address });
            }

            const knowledgeBase = loadKnowledgeBase(agent?.knowledgeFolder);
            if (knowledgeBase) systemPromptText += knowledgeBase;

            // Add a hard constraint on response length
            const responseConstraint = '\n\nCRITICAL: You are on a PHONE CALL. Respond with MAX 1-2 SHORT sentences. Never give 3+ sentences in one turn. Keep every response under 20 words if possible. This is a conversation, not a monologue.';
            messages = [{ role: 'system', content: systemPromptText + responseConstraint }];
            console.log(`🤖 Session configured for agent: ${agent?.name || 'default'}`);

            // Build greeting from agent's greeting template or use default
            let greetingFull;
            if (agent && agent.greeting) {
                greetingFull = agent.greeting
                    .replace(/\{\{first_name\}\}/g, firstName)
                    .replace(/\{\{address\}\}/g, address);
            } else {
                greetingFull = `Hey ${firstName}, this is Jamie calling from J&J Roofing Pros. I was hoping to ask a quick question about the property at ${address}. Are you the owner?`;
            }

            // Send greeting as one chunk with enthusiastic emotion
            const greetingCheck = setInterval(() => {
                if (deepgramReady && cartesiaReady) {
                    clearInterval(greetingCheck);
                    setTimeout(() => {
                        if (messages.length > 1) return;
                        console.log(`👋 Greeting: "${greetingFull}"`);
                        messages.push({ role: 'assistant', content: greetingFull });
                        speakText(greetingFull, 'enthusiastic');
                    }, 800);
                }
            }, 200);
            setTimeout(() => clearInterval(greetingCheck), 10000);
        }

        // ── Twilio WebSocket handlers ────────────────────────────────────
        connection.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                switch (data.event) {
                    case 'media':
                        // Forward audio to Deepgram — but NOT while agent is speaking (prevents echo feedback)
                        const audioBuffer = Buffer.from(data.media.payload, 'base64');
                        if (!greetingDone || isSpeaking) {
                            // Greeting hasn't finished + echo cleared, or agent is talking — skip
                            break;
                        }
                        if (deepgramReady && deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                            deepgramWs.send(audioBuffer);
                        } else {
                            // Buffer until Deepgram connects (keep last 2s ~ 16000 bytes at 8kHz)
                            pendingAudioChunks.push(audioBuffer);
                            if (pendingAudioChunks.length > 100) pendingAudioChunks.shift();
                        }
                        break;
                    case 'start':
                        streamSid = data.start.streamSid;
                        console.log('🎙️ Stream started:', streamSid);
                        if (data.start.customParameters) {
                            firstName = data.start.customParameters.first_name || firstName;
                            address = data.start.customParameters.address || address;
                            agentId = data.start.customParameters.agent_id || agentId;
                            console.log(`📋 Call variables — Name: ${firstName}, Address: ${address}, Agent: ${agentId}`);
                        }

                        // Load the agent config
                        if (agentId) {
                            agent = loadAgent(agentId);
                            if (agent) {
                                console.log(`🤖 Loaded agent: ${agent.name}`);
                            } else {
                                console.warn(`⚠️ Agent not found: ${agentId}, using defaults`);
                            }
                        }

                        // Initialize everything now that we have call params
                        initializeSession();
                        connectDeepgram();
                        connectCartesiaTTS();
                        break;
                    case 'mark':
                        break;
                    case 'stop':
                        console.log('📡 Stream stopped');
                        break;
                    default:
                        break;
                }
            } catch (error) {
                console.error('Error parsing Twilio message:', error);
            }
        });

        connection.on('close', () => {
            console.log('🔌 Client disconnected.');
            if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                // Send close frame to Deepgram to finalize
                deepgramWs.send(JSON.stringify({ type: 'CloseStream' }));
                deepgramWs.close();
            }
            if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
                cartesiaWs.close();
            }
        });
    });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`\n🏠 Voice Agent listening on port ${PORT}`);
    console.log(`🔊 Pipeline: Deepgram STT → GPT-4o → Cartesia TTS`);
    console.log(`📞 Make calls: POST ${SERVER_URL}/make-call`);
    console.log(`🤖 Multi-agent: agents loaded from agents.json`);
    console.log(`🔧 Tools: book_meeting (Cal.com)\n`);
});
