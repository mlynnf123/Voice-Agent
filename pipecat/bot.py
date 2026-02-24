"""Pipecat outbound roofing voice agent bot.

Pipeline: Twilio Audio → Deepgram STT → OpenAI GPT-4o-mini → OpenAI TTS → Twilio Audio
Multi-agent: all config loaded from SQLite database.
"""

import os
import sys
import json
import asyncio
from datetime import datetime

import httpx
from dotenv import load_dotenv
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.sentence import SentenceAggregator
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.cartesia.tts import CartesiaTTSService, GenerationConfig
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.cerebras.llm import CerebrasLLMService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.services.llm_service import FunctionCallParams
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema

from pipecat.frames.frames import (
    TTSSpeakFrame,
    TranscriptionFrame,
    TextFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

load_dotenv(override=True)

logger.remove(0)
logger.add(sys.stderr, level="DEBUG")

# ── Voicemail detection ──
VOICEMAIL_PHRASES = [
    "voice message system",
    "voicemail",
    "leave a message",
    "record your message",
    "at the tone",
    "after the beep",
    "not available",
    "please leave",
    "mailbox is full",
    "press pound",
    "press one for",
    "forwarded to an automatic",
    "the person you are calling",
    "is not available right now",
]


# ── Tool definitions ──

tools = ToolsSchema(standard_tools=[
    FunctionSchema(
        name="book_meeting",
        description="Book a roof inspection or site audit appointment. Use the EXACT information the customer provided — their real name, real email, and real preferred time. Never use placeholder data.",
        properties={
            "name": {
                "type": "string",
                "description": "The customer's full name exactly as they provided it"
            },
            "email": {
                "type": "string",
                "description": "The customer's email address exactly as they provided it"
            },
            "preferred_time": {
                "type": "string",
                "description": "ISO 8601 datetime for the appointment. Convert relative times to absolute format based on today's date."
            },
            "phone": {
                "type": "string",
                "description": "The customer's phone number if they provided it"
            },
        },
        required=["name", "email", "preferred_time"],
    ),
    FunctionSchema(
        name="end_call",
        description="End the phone call. Use when the conversation is naturally complete — after booking, after they decline, or when they want to hang up.",
        properties={
            "reason": {
                "type": "string",
                "description": "Brief reason for ending the call"
            },
        },
        required=["reason"],
    ),
])


async def handle_book_meeting(args: dict, cal_api_key: str, cal_event_type_id: str) -> str:
    """Handle the book_meeting function call."""
    name = args.get("name", "")
    email = args.get("email", "").strip().lower().replace(" ", "")
    preferred_time = args.get("preferred_time", "")
    phone = args.get("phone", "")

    logger.info(f"📅 book_meeting: name={name}, email={email}, time={preferred_time}, phone={phone}")

    # Validate email has @ and a domain with a dot
    if "@" not in email or "." not in email.split("@")[-1]:
        logger.warning(f"📅 Invalid email format: {email}")
        return f"ERROR: The email '{email}' doesn't look complete — it's missing the domain (like .com or .net). Ask the customer to confirm the full email address including the dot-com part."

    if not cal_api_key:
        logger.warning("No CAL_API_KEY for this agent")
        return f"Inspection noted for {name} at {preferred_time}. Confirmation will be sent to {email}."

    try:
        async with httpx.AsyncClient() as client:
            # Ensure time has timezone offset
            start_time = preferred_time
            if "T" in start_time and "+" not in start_time and "Z" not in start_time and "-" not in start_time.split("T")[1]:
                start_time = start_time + "-06:00"  # Default to CST

            booking_data = {
                "eventTypeId": int(cal_event_type_id),
                "start": start_time,
                "responses": {"name": name, "email": email},
                "timeZone": "America/Chicago",
                "language": "en",
                "metadata": {"source": "voice_agent", "phone": phone},
            }
            logger.info(f"📅 Cal.com request: {json.dumps(booking_data)}")

            resp = await client.post(
                "https://api.cal.com/v1/bookings",
                params={"apiKey": cal_api_key},
                json=booking_data,
            )
            logger.info(f"📅 Cal.com response: {resp.status_code} — {resp.text[:500]}")

            if resp.status_code in (200, 201):
                return f"Successfully booked for {name} at {preferred_time}. Confirmation sent to {email}."
            else:
                error_msg = resp.text[:200]
                logger.error(f"Cal.com booking failed: {resp.status_code} — {error_msg}")
                if "past" in error_msg.lower():
                    return f"ERROR: That time ({preferred_time}) has already passed. Ask the customer for a future date and time, then try again."
                elif "email" in error_msg.lower():
                    return f"ERROR: The email address '{email}' is not valid. Ask the customer to spell out their full email address again (it needs to be a real email like name@example.com)."
                else:
                    return f"ERROR: Could not book the appointment. There was a scheduling conflict or error. Ask the customer for a different time and try again."
    except Exception as e:
        logger.error(f"Cal.com error: {e}")
        return f"ERROR: Could not connect to the booking system. Apologize and let the customer know someone will call back to confirm their appointment."


async def run_bot(
    transport,
    handle_sigint: bool,
    system_prompt: str,
    greeting: str,
    voice_id: str,
    cal_api_key: str,
    cal_event_type_id: str,
    call_sid: str = "",
    agent_id: str = "",
):
    """Run the voice agent pipeline with agent-specific config."""

    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="gpt-4o-mini",
        params=OpenAILLMService.InputParams(
            temperature=0.4,
            max_completion_tokens=100,
        ),
    )

    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
    )

    tts = CartesiaTTSService(
        api_key=os.getenv("CARTESIA_API_KEY"),
        voice_id=voice_id,
        params=CartesiaTTSService.InputParams(
            generation_config=GenerationConfig(
                speed=1.0,
                emotion="content",
            ),
        ),
    )

    # Pre-seed greeting so LLM knows what it already said
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "assistant", "content": greeting},
    ]

    context = LLMContext(messages, tools)
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.85,
                    min_volume=0.6,
                    start_secs=0.4,
                    stop_secs=0.3,
                ),
            ),
        ),
    )

    # ── Greeting & voicemail detection state ──
    voicemail_detected = False
    greeting_sent = False
    transcript_buffer = ""  # accumulate early transcripts for VM detection
    call_transcript = []  # list of {"role": "user"|"assistant", "text": "..."} for saving
    user_spoke_event = asyncio.Event()  # signals that user said something before greeting

    # Register function call handlers
    async def on_book_meeting(params: FunctionCallParams):
        result = await handle_book_meeting(params.arguments, cal_api_key, cal_event_type_id)
        await params.result_callback(result)

    async def on_end_call(params: FunctionCallParams):
        await params.result_callback("Ending call now.")
        await task.cancel()

    llm.register_function("book_meeting", on_book_meeting)
    llm.register_function("end_call", on_end_call)

    # ── Voicemail detection + greeting gate processor ──
    greeting_playing = True  # Block transcriptions during greeting

    class VoicemailDetector(FrameProcessor):
        """Watches transcription frames for voicemail phrases.
        Blocks transcriptions from reaching LLM during greeting."""

        async def process_frame(self, frame, direction):
            nonlocal voicemail_detected, transcript_buffer, greeting_playing
            await super().process_frame(frame, direction)

            if isinstance(frame, TranscriptionFrame):
                if not voicemail_detected:
                    text_lower = frame.text.lower()
                    transcript_buffer += " " + text_lower
                    logger.debug(f"🎤 Transcript: {frame.text}")
                    if frame.text.strip():
                        call_transcript.append({"role": "user", "text": frame.text.strip()})

                    for phrase in VOICEMAIL_PHRASES:
                        if phrase in transcript_buffer:
                            voicemail_detected = True
                            logger.warning(f"📵 VOICEMAIL DETECTED: '{phrase}' — hanging up")
                            if call_sid:
                                try:
                                    from db import update_call_log
                                    update_call_log(call_sid, status="no-answer", outcome="voicemail")
                                except Exception as e:
                                    logger.error(f"Failed to update call log: {e}")
                            await task.cancel()
                            return

                # Signal that user spoke (triggers immediate greeting if still waiting)
                if not greeting_sent and frame.text.strip():
                    user_spoke_event.set()

                # During greeting, drop transcription frames so LLM isn't triggered
                if greeting_playing:
                    logger.debug(f"🔇 Dropping transcript during greeting: {frame.text}")
                    return  # Don't push frame downstream

            await self.push_frame(frame, direction)

    vm_detector = VoicemailDetector()

    # ── Bot response transcript collector ──
    class BotTranscriptCollector(FrameProcessor):
        """Captures bot text output for transcript logging."""
        def __init__(self):
            super().__init__()
            self._current_response = []

        async def process_frame(self, frame, direction):
            await super().process_frame(frame, direction)
            if isinstance(frame, TextFrame) and frame.text.strip():
                text = frame.text.strip()
                # Filter out pure ellipsis, internal thoughts, and stage directions
                if text in ("...", "…", ".", ".."):
                    return  # Don't push to TTS or transcript
                text_lower = text.lower()
                # Catch internal thoughts / stage directions / self-talk
                if any(p in text_lower for p in (
                    "we need to", "we wait", "user hasn't", "user hasn't",
                    "there's no action", "waiting for user", "no action",
                    "note:", "internal:", "[action", "(action",
                    "wait for user", "wait for response",
                    "(waiting", "waiting for response", "whenever you're ready",
                    "just need your", "got it—just need",
                )):
                    logger.debug(f"🚫 Filtering internal thought: {text}")
                    return  # Don't push internal thoughts to TTS
                self._current_response.append(frame.text)
            # When we get a non-text frame after collecting text, flush
            elif self._current_response:
                full_text = "".join(self._current_response).strip()
                if full_text:
                    call_transcript.append({"role": "assistant", "text": full_text})
                self._current_response = []
            await self.push_frame(frame, direction)

    bot_collector = BotTranscriptCollector()

    class GreetingGate(FrameProcessor):
        """Drops TextFrames heading to assistant_aggregator during greeting
        to prevent the pre-seeded greeting from being duplicated in LLM context."""
        async def process_frame(self, frame, direction):
            await super().process_frame(frame, direction)
            if greeting_playing and isinstance(frame, TextFrame):
                return  # Drop — greeting is already pre-seeded in context
            await self.push_frame(frame, direction)

    greeting_gate = GreetingGate()

    # Aggregate LLM token stream into full sentences before TTS
    sentence_aggregator = SentenceAggregator()

    # Rebuild pipeline with VM detector, bot collector, sentence aggregator, and greeting gate
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            vm_detector,
            user_aggregator,
            llm,
            sentence_aggregator,
            bot_collector,
            tts,
            transport.output(),
            greeting_gate,
            assistant_aggregator,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            allow_interruptions=False,  # Disabled during greeting to prevent TTS cutoff
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    warmup_task = None

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport_ref, client):
        nonlocal warmup_task
        logger.info("✅ Transport client connected — starting LLM cache warmup")
        warmup_task = asyncio.create_task(_warmup_llm_cache())

    async def _warmup_llm_cache():
        """Pre-warm the LLM prompt cache in background."""
        try:
            import httpx as _httpx
            warmup_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "assistant", "content": greeting},
                {"role": "user", "content": "Hello?"},
            ]
            async with _httpx.AsyncClient() as _client:
                resp = await _client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": warmup_messages,
                        "max_tokens": 1,
                    },
                    timeout=5.0,
                )
                logger.info(f"🔥 LLM cache pre-warmed (status={resp.status_code})")
        except Exception as e:
            logger.warning(f"⚠️ LLM cache warmup failed: {e}")

    @task.event_handler("on_pipeline_started")
    async def on_pipeline_started(task_ref, frame):
        nonlocal greeting_sent
        logger.info("🚀 Pipeline started — sending greeting in 0.5s")

        # Brief stabilization delay, then greet immediately
        await asyncio.sleep(0.5)

        if voicemail_detected:
            return

        if not greeting_sent:
            greeting_sent = True
            await task_ref.queue_frame(TTSSpeakFrame(text=greeting))

            # Ungate STT + enable interruptions after greeting finishes
            async def _ungate_stt():
                nonlocal greeting_playing
                await asyncio.sleep(8.0)  # greeting is ~7s of audio (includes pause)
                greeting_playing = False
                # Re-enable interruptions for normal conversation
                transport.input()._allow_interruptions = True
                transport.output()._allow_interruptions = True
                logger.info("🔓 STT ungated + interruptions enabled — conversation open")
            asyncio.create_task(_ungate_stt())

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport_ref, client):
        logger.info("📞 Call disconnected")
        # Flush any remaining bot text
        if bot_collector._current_response:
            full_text = "".join(bot_collector._current_response).strip()
            if full_text:
                call_transcript.append({"role": "assistant", "text": full_text})
            bot_collector._current_response = []

        # Save transcript to database
        if call_sid and call_transcript:
            try:
                # Add greeting as first entry
                transcript_with_greeting = [{"role": "assistant", "text": greeting}] + call_transcript
                transcript_json = json.dumps(transcript_with_greeting)
                from db import update_call_log
                update_call_log(call_sid, transcript=transcript_json)
                logger.info(f"💾 Saved transcript ({len(transcript_with_greeting)} turns) for {call_sid}")
            except Exception as e:
                logger.error(f"Failed to save transcript: {e}")

        await task.cancel()

    runner = PipelineRunner(handle_sigint=handle_sigint)
    await runner.run(task)


async def bot(runner_args: RunnerArguments):
    """Main bot entry point — receives agent config via runner_args or stream params."""
    transport_type, call_data = await parse_telephony_websocket(runner_args.websocket)
    logger.info(f"📞 Transport: {transport_type}")

    body_data = call_data.get("body", {})
    call_sid = body_data.get("call_sid", "")

    # Agent config is passed as stream parameters from server.py
    system_prompt = body_data.get("system_prompt", "You are a helpful assistant.")
    greeting = body_data.get("greeting", "Hello, how can I help you?")
    voice_id = body_data.get("voice_id", "86e30c1d-714b-4074-a1f2-1cb6b552fb49")
    cal_api_key = body_data.get("cal_api_key", "")
    cal_event_type_id = body_data.get("cal_event_type_id", "")

    agent_id = body_data.get("agent_id", "")

    logger.info(f"📋 Call {call_sid}: agent={agent_id}, voice={voice_id}, greeting_len={len(greeting)}")

    serializer = TwilioFrameSerializer(
        stream_sid=call_data["stream_id"],
        call_sid=call_data["call_id"],
        account_sid=os.getenv("TWILIO_ACCOUNT_SID", ""),
        auth_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
    )

    transport = FastAPIWebsocketTransport(
        websocket=runner_args.websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    await run_bot(
        transport,
        runner_args.handle_sigint,
        system_prompt,
        greeting,
        voice_id,
        cal_api_key,
        cal_event_type_id,
        call_sid=call_sid,
        agent_id=agent_id,
    )
