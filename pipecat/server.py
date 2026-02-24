"""Pipecat multi-agent outbound voice server.

Endpoints:
- POST /make-call — initiate outbound call with agent_id
- POST /twiml — TwiML for Twilio WebSocket connection
- WS /ws — WebSocket for Twilio Media Streams
- POST /call-status — Twilio status callback
- GET /agents — list all agents
- GET /agents/{agent_id} — get agent details
"""

import os
import json
from typing import Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from loguru import logger
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import Connect, Stream, VoiceResponse

load_dotenv(override=True)

# Import db module (auto-inits and seeds on import)
from db import (
    get_db,
    get_agent,
    get_agent_by_phone,
    list_agents,
    build_system_prompt,
    build_greeting,
    log_call,
    update_call_log,
)

app = FastAPI()

# CORS for Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active call metadata for lookup by stream
active_calls = {}


@app.get("/agents")
async def get_agents():
    """List all active agents."""
    agents = list_agents()
    return JSONResponse(content={"agents": agents})


@app.get("/agents/{agent_id}")
async def get_agent_detail(agent_id: str):
    """Get full agent details by ID."""
    agent = get_agent(agent_id)
    if not agent:
        return JSONResponse(status_code=404, content={"error": "Agent not found"})
    return JSONResponse(content={
        "id": agent["id"],
        "name": agent["name"],
        "company": agent["company"],
        "phone_number": agent["phone_number"],
        "voice_id": agent["voice_id"],
        "system_prompt_template": agent["system_prompt_template"],
        "greeting_template": agent["greeting_template"],
        "cal_api_key": agent["cal_api_key"] or "",
        "cal_event_type_id": agent["cal_event_type_id"] or "",
        "active": bool(agent["active"]),
        "created_at": agent["created_at"],
    })


@app.post("/agents")
async def create_agent(request: Request):
    """Create a new agent."""
    data = await request.json()
    agent_id = data.get("id")
    if not agent_id:
        return JSONResponse(status_code=400, content={"error": "id is required"})

    # Check if already exists
    if get_agent(agent_id):
        return JSONResponse(status_code=409, content={"error": "Agent with this ID already exists"})

    conn = get_db()
    conn.execute(
        """INSERT INTO agents (id, name, company, phone_number, voice_id, system_prompt_template, greeting_template, cal_api_key, cal_event_type_id, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            agent_id,
            data.get("name", ""),
            data.get("company", ""),
            data.get("phone_number", ""),
            data.get("voice_id", ""),
            data.get("system_prompt_template", ""),
            data.get("greeting_template", ""),
            data.get("cal_api_key", ""),
            data.get("cal_event_type_id", ""),
            1 if data.get("active", True) else 0,
        ),
    )
    conn.commit()
    conn.close()
    return JSONResponse(content={"id": agent_id, "success": True})


@app.put("/agents/{agent_id}")
async def update_agent(agent_id: str, request: Request):
    """Update an existing agent."""
    agent = get_agent(agent_id)
    if not agent:
        return JSONResponse(status_code=404, content={"error": "Agent not found"})

    data = await request.json()
    conn = get_db()
    conn.execute(
        """UPDATE agents SET name=?, company=?, phone_number=?, voice_id=?,
           system_prompt_template=?, greeting_template=?, cal_api_key=?,
           cal_event_type_id=?, active=? WHERE id=?""",
        (
            data.get("name", agent["name"]),
            data.get("company", agent["company"]),
            data.get("phone_number", agent["phone_number"]),
            data.get("voice_id", agent["voice_id"]),
            data.get("system_prompt_template", agent["system_prompt_template"]),
            data.get("greeting_template", agent["greeting_template"]),
            data.get("cal_api_key", agent["cal_api_key"]),
            data.get("cal_event_type_id", agent["cal_event_type_id"]),
            1 if data.get("active", agent["active"]) else 0,
            agent_id,
        ),
    )
    conn.commit()
    conn.close()
    return JSONResponse(content={"success": True})


@app.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete an agent (soft delete — sets active=0)."""
    agent = get_agent(agent_id)
    if not agent:
        return JSONResponse(status_code=404, content={"error": "Agent not found"})

    conn = get_db()
    conn.execute("UPDATE agents SET active = 0 WHERE id = ?", (agent_id,))
    conn.commit()
    conn.close()
    return JSONResponse(content={"success": True})


# ── Knowledge Base CRUD ──

@app.get("/agents/{agent_id}/knowledge")
async def get_agent_knowledge(agent_id: str):
    """Get all knowledge base entries for an agent."""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, agent_id, title, content, created_at FROM knowledge_base WHERE agent_id = ? ORDER BY id",
        (agent_id,),
    ).fetchall()
    conn.close()
    return JSONResponse(content={"entries": [dict(r) for r in rows]})


@app.post("/agents/{agent_id}/knowledge")
async def create_knowledge(agent_id: str, request: Request):
    """Add a knowledge base entry."""
    data = await request.json()
    title = data.get("title", "")
    content = data.get("content", "")
    if not title or not content:
        return JSONResponse(status_code=400, content={"error": "title and content required"})

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO knowledge_base (agent_id, title, content) VALUES (?, ?, ?)",
        (agent_id, title, content),
    )
    conn.commit()
    kb_id = c.lastrowid
    conn.close()
    return JSONResponse(content={"id": kb_id, "success": True})


@app.put("/agents/{agent_id}/knowledge/{kb_id}")
async def update_knowledge(agent_id: str, kb_id: int, request: Request):
    """Update a knowledge base entry."""
    data = await request.json()
    conn = get_db()
    conn.execute(
        "UPDATE knowledge_base SET title=?, content=? WHERE id=? AND agent_id=?",
        (data.get("title", ""), data.get("content", ""), kb_id, agent_id),
    )
    conn.commit()
    conn.close()
    return JSONResponse(content={"success": True})


@app.delete("/agents/{agent_id}/knowledge/{kb_id}")
async def delete_knowledge(agent_id: str, kb_id: int):
    """Delete a knowledge base entry."""
    conn = get_db()
    conn.execute("DELETE FROM knowledge_base WHERE id=? AND agent_id=?", (kb_id, agent_id))
    conn.commit()
    conn.close()
    return JSONResponse(content={"success": True})


# ── Call Logs ──

@app.get("/call-logs")
async def get_call_logs(agent_id: Optional[str] = Query(None), limit: int = Query(100), offset: int = Query(0)):
    """List call logs with optional agent_id filter and pagination."""
    conn = get_db()
    if agent_id:
        rows = conn.execute(
            "SELECT * FROM call_logs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (agent_id, limit, offset),
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM call_logs WHERE agent_id = ?", (agent_id,)).fetchone()[0]
    else:
        rows = conn.execute(
            "SELECT * FROM call_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM call_logs").fetchone()[0]
    conn.close()
    return JSONResponse(content={"logs": [dict(r) for r in rows], "total": total})


@app.get("/call-logs/{call_sid}")
async def get_call_log_detail(call_sid: str):
    """Get a single call log by call SID."""
    conn = get_db()
    row = conn.execute("SELECT * FROM call_logs WHERE call_sid = ?", (call_sid,)).fetchone()
    conn.close()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Call log not found"})
    return JSONResponse(content=dict(row))


# ── Stats ──

@app.get("/stats")
async def get_stats():
    """Dashboard statistics."""
    conn = get_db()
    total_agents = conn.execute("SELECT COUNT(*) FROM agents WHERE active = 1").fetchone()[0]
    total_calls = conn.execute("SELECT COUNT(*) FROM call_logs").fetchone()[0]
    calls_today = conn.execute(
        "SELECT COUNT(*) FROM call_logs WHERE date(created_at) = date('now')"
    ).fetchone()[0]
    conn.close()
    return JSONResponse(content={
        "total_agents": total_agents,
        "total_calls": total_calls,
        "calls_today": calls_today,
    })


# ── Campaigns & Contacts ──

@app.get("/campaigns")
async def list_campaigns(agent_id: Optional[str] = Query(None)):
    conn = get_db()
    if agent_id:
        rows = conn.execute("SELECT * FROM campaigns WHERE agent_id = ? ORDER BY created_at DESC", (agent_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM campaigns ORDER BY created_at DESC").fetchall()
    conn.close()
    return JSONResponse(content={"campaigns": [dict(r) for r in rows]})


@app.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: int):
    conn = get_db()
    campaign = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    if not campaign:
        conn.close()
        return JSONResponse(content={"error": "Campaign not found"}, status_code=404)
    contacts = conn.execute(
        "SELECT * FROM contacts WHERE campaign_id = ? ORDER BY id", (campaign_id,)
    ).fetchall()
    conn.close()
    return JSONResponse(content={
        "campaign": dict(campaign),
        "contacts": [dict(c) for c in contacts],
    })


@app.post("/campaigns")
async def create_campaign(request: Request):
    """Create a campaign and upload contacts from CSV data."""
    import csv
    import io

    body = await request.json()
    name = body.get("name", "Untitled Campaign")
    agent_id = body.get("agent_id")
    csv_data = body.get("csv_data", "")

    if not agent_id:
        return JSONResponse(content={"error": "agent_id required"}, status_code=400)
    if not csv_data:
        return JSONResponse(content={"error": "csv_data required"}, status_code=400)

    conn = get_db()

    # Create campaign
    c = conn.cursor()
    c.execute(
        "INSERT INTO campaigns (name, agent_id, status) VALUES (?, ?, 'ready')",
        (name, agent_id),
    )
    campaign_id = c.lastrowid

    # Parse CSV
    reader = csv.DictReader(io.StringIO(csv_data))
    contacts_added = 0

    # Map common CSV header variations
    def get_field(row, *names):
        for n in names:
            for key in row:
                if key.strip().lower().replace("_", " ").replace("-", " ") == n.lower():
                    return row[key].strip() if row[key] else ""
        return ""

    for row in reader:
        first_name = get_field(row, "first name", "first_name", "firstname", "name", "first")
        last_name = get_field(row, "last name", "last_name", "lastname", "last")
        phone1 = get_field(row, "phone", "phone1", "phone 1", "phone number", "mobile", "cell")
        phone2 = get_field(row, "phone2", "phone 2", "alt phone", "alternate phone", "secondary phone")
        address = get_field(row, "address", "property address", "street", "property")
        email = get_field(row, "email", "email address", "e-mail")

        if not phone1:
            continue  # Skip rows without a phone number

        c.execute(
            """INSERT INTO contacts (agent_id, first_name, last_name, phone1, phone2, address, email, campaign_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (agent_id, first_name, last_name, phone1, phone2, address, email, campaign_id),
        )
        contacts_added += 1

    c.execute("UPDATE campaigns SET total_contacts = ? WHERE id = ?", (contacts_added, campaign_id))
    conn.commit()
    conn.close()

    return JSONResponse(content={
        "campaign_id": campaign_id,
        "contacts_added": contacts_added,
    })


@app.post("/campaigns/{campaign_id}/start")
async def start_campaign(campaign_id: int, request: Request):
    """Start calling contacts in a campaign. Calls `batch_size` contacts."""
    import asyncio as _asyncio

    body = await request.json() if await request.body() else {}
    batch_size = body.get("batch_size", 10)

    conn = get_db()
    campaign = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    if not campaign:
        conn.close()
        return JSONResponse(content={"error": "Campaign not found"}, status_code=404)

    agent_id = campaign["agent_id"]
    agent = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if not agent:
        conn.close()
        return JSONResponse(content={"error": "Agent not found"}, status_code=404)

    # Get pending contacts
    contacts = conn.execute(
        "SELECT * FROM contacts WHERE campaign_id = ? AND status = 'pending' ORDER BY id LIMIT ?",
        (campaign_id, batch_size),
    ).fetchall()

    if not contacts:
        conn.close()
        return JSONResponse(content={"error": "No pending contacts", "called": 0})

    conn.execute("UPDATE campaigns SET status = 'running' WHERE id = ?", (campaign_id,))
    conn.commit()
    conn.close()

    # Kick off calls in background
    async def _run_batch():
        from db import get_db as _get_db, build_system_prompt, build_greeting, get_agent, log_call
        for contact in contacts:
            contact = dict(contact)
            phone = contact["phone1"]
            if not phone:
                continue

            # Normalize phone
            if not phone.startswith("+"):
                phone = "+1" + phone.replace("-", "").replace("(", "").replace(")", "").replace(" ", "")

            try:
                from twilio.rest import Client
                twilio_client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))

                local_url = os.getenv("LOCAL_SERVER_URL", "http://localhost:5050")
                agent_data = get_agent(agent_id)
                system_prompt = build_system_prompt(agent_data, contact["first_name"], contact["address"])
                greeting = build_greeting(agent_data, contact["first_name"], contact["address"])

                twiml_url = f"{local_url}/twiml"
                params = {
                    "agent_id": agent_id,
                    "system_prompt": system_prompt,
                    "greeting": greeting,
                    "voice_id": agent_data["voice_id"],
                    "to_number": phone,
                    "from_number": agent_data["phone_number"],
                    "cal_api_key": agent_data.get("cal_api_key", ""),
                    "cal_event_type_id": agent_data.get("cal_event_type_id", ""),
                }

                call = twilio_client.calls.create(
                    to=phone,
                    from_=agent_data["phone_number"],
                    url=twiml_url + "?" + "&".join(f"{k}={v}" for k, v in {"agent_id": agent_id}.items()),
                    status_callback=f"{local_url}/call-status",
                    status_callback_event=["completed", "busy", "no-answer", "failed"],
                    machine_detection="Enable",
                )

                call_sid = call.sid
                log_call(agent_id, call_sid, phone, agent_data["phone_number"], contact["first_name"], contact["address"])

                # Update contact
                _conn = _get_db()
                _conn.execute(
                    "UPDATE contacts SET status = 'called', call_sid = ?, called_at = datetime('now') WHERE id = ?",
                    (call_sid, contact["id"]),
                )
                _conn.commit()
                _conn.close()

                logger.info(f"📞 Campaign {campaign_id}: Called {contact['first_name']} at {phone} (SID: {call_sid})")

                # Wait between calls
                await _asyncio.sleep(2)

            except Exception as e:
                logger.error(f"❌ Campaign {campaign_id}: Failed to call {phone}: {e}")
                _conn = _get_db()
                _conn.execute("UPDATE contacts SET status = 'failed', notes = ? WHERE id = ?", (str(e), contact["id"]))
                _conn.commit()
                _conn.close()

        # Update campaign stats
        _conn = _get_db()
        called = _conn.execute("SELECT COUNT(*) FROM contacts WHERE campaign_id = ? AND status != 'pending'", (campaign_id,)).fetchone()[0]
        pending = _conn.execute("SELECT COUNT(*) FROM contacts WHERE campaign_id = ? AND status = 'pending'", (campaign_id,)).fetchone()[0]
        status = "ready" if pending > 0 else "completed"
        _conn.execute("UPDATE campaigns SET called = ?, status = ? WHERE id = ?", (called, status, campaign_id))
        _conn.commit()
        _conn.close()

    _asyncio.create_task(_run_batch())

    return JSONResponse(content={
        "status": "started",
        "batch_size": len(contacts),
        "campaign_id": campaign_id,
    })


@app.get("/campaigns/{campaign_id}/report")
async def campaign_report(campaign_id: int):
    """Get campaign report with call outcomes."""
    conn = get_db()
    campaign = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    if not campaign:
        conn.close()
        return JSONResponse(content={"error": "Campaign not found"}, status_code=404)

    contacts = conn.execute(
        "SELECT c.*, cl.status as call_status, cl.duration, cl.outcome as call_outcome, cl.transcript FROM contacts c LEFT JOIN call_logs cl ON c.call_sid = cl.call_sid WHERE c.campaign_id = ? ORDER BY c.id",
        (campaign_id,),
    ).fetchall()

    summary = {
        "total": len(contacts),
        "called": sum(1 for c in contacts if c["status"] != "pending"),
        "pending": sum(1 for c in contacts if c["status"] == "pending"),
        "completed": sum(1 for c in contacts if c["call_status"] == "completed"),
        "scheduled": sum(1 for c in contacts if c["call_outcome"] == "scheduled"),
        "not_interested": sum(1 for c in contacts if c["call_outcome"] == "not-interested"),
        "no_answer": sum(1 for c in contacts if c["call_outcome"] in ("no-answer", "voicemail")),
        "failed": sum(1 for c in contacts if c["status"] == "failed"),
    }

    conn.close()
    return JSONResponse(content={
        "campaign": dict(campaign),
        "summary": summary,
        "contacts": [dict(c) for c in contacts],
    })


@app.post("/make-call")
async def make_call(request: Request):
    """Initiate an outbound call.

    POST /make-call
    {
        "to_number": "+1234567890",
        "first_name": "John",
        "address": "123 Main St",
        "agent_id": "jamie-jjroofing"  (required)
    }
    """
    data = await request.json()
    to_number = data.get("to_number")
    first_name = data.get("first_name", "")
    address = data.get("address", "")
    agent_id = data.get("agent_id")

    if not to_number:
        return JSONResponse(status_code=400, content={"error": "to_number required"})
    if not agent_id:
        return JSONResponse(status_code=400, content={"error": "agent_id required"})

    # Load agent from database
    agent = get_agent(agent_id)
    if not agent:
        return JSONResponse(status_code=404, content={"error": f"Agent '{agent_id}' not found"})

    local_server_url = os.getenv("LOCAL_SERVER_URL")
    if not local_server_url:
        return JSONResponse(status_code=500, content={"error": "LOCAL_SERVER_URL not set"})

    # Build agent-specific prompt and greeting
    system_prompt = build_system_prompt(agent, first_name, address)
    greeting = build_greeting(agent, first_name, address)

    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = agent["phone_number"]

    client = TwilioClient(account_sid, auth_token)

    call = client.calls.create(
        to=to_number,
        from_=from_number,
        url=f"{local_server_url}/twiml",
        method="POST",
        status_callback=f"{local_server_url}/call-status",
        status_callback_event=["completed"],
    )

    # Store metadata for this call
    active_calls[call.sid] = {
        "to_number": to_number,
        "from_number": from_number,
        "first_name": first_name,
        "address": address,
        "agent_id": agent_id,
        "system_prompt": system_prompt,
        "greeting": greeting,
        "voice_id": agent["voice_id"],
        "cal_api_key": agent["cal_api_key"] or "",
        "cal_event_type_id": agent["cal_event_type_id"] or "",
    }

    # Log call to database
    log_call(agent_id, call.sid, to_number, from_number, first_name, address)

    logger.info(f"📞 Outbound call: {call.sid} → {to_number} (agent={agent_id}, name={first_name})")

    return JSONResponse(content={
        "success": True,
        "callSid": call.sid,
        "to": to_number,
        "agent": agent_id,
    })


@app.post("/twiml")
async def get_twiml(request: Request):
    """Return TwiML that connects the call to our WebSocket."""
    form_data = await request.form()
    to_number = form_data.get("To", "")
    from_number = form_data.get("From", "")
    call_sid = form_data.get("CallSid", "")

    logger.info(f"📋 TwiML request: {call_sid} ({from_number} → {to_number})")

    local_server_url = os.getenv("LOCAL_SERVER_URL")
    ws_url = local_server_url.replace("https://", "wss://") + "/ws"

    response = VoiceResponse()
    connect = Connect()
    stream = Stream(url=ws_url)

    # Pass metadata as stream parameters
    stream.parameter(name="to_number", value=to_number)
    stream.parameter(name="from_number", value=from_number)
    stream.parameter(name="call_sid", value=call_sid)

    # Pass agent config from active_calls
    call_meta = active_calls.get(call_sid, {})
    stream.parameter(name="agent_id", value=call_meta.get("agent_id", ""))
    stream.parameter(name="system_prompt", value=call_meta.get("system_prompt", ""))
    stream.parameter(name="greeting", value=call_meta.get("greeting", ""))
    stream.parameter(name="voice_id", value=call_meta.get("voice_id", ""))
    stream.parameter(name="cal_api_key", value=call_meta.get("cal_api_key", ""))
    stream.parameter(name="cal_event_type_id", value=call_meta.get("cal_event_type_id", ""))

    connect.append(stream)
    response.append(connect)

    return HTMLResponse(content=str(response), media_type="application/xml")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handle WebSocket connection from Twilio Media Streams."""
    from bot import bot
    from pipecat.runner.types import WebSocketRunnerArguments

    await websocket.accept()
    logger.info("🔌 WebSocket connection accepted")

    try:
        runner_args = WebSocketRunnerArguments(websocket=websocket)
        await bot(runner_args)
    except Exception as e:
        logger.error(f"❌ Error in WebSocket: {e}")
        import traceback
        traceback.print_exc()
        await websocket.close()


@app.post("/call-status")
async def call_status(request: Request):
    """Handle Twilio call status callbacks."""
    form_data = await request.form()
    call_sid = form_data.get("CallSid", "")
    status = form_data.get("CallStatus", "")
    duration = form_data.get("CallDuration", "0")

    logger.info(f"📊 Call {call_sid}: {status} ({duration}s)")

    # Update call log in database
    update_call_log(call_sid, status=status, duration=int(duration))

    # Clean up active call metadata
    active_calls.pop(call_sid, None)

    return JSONResponse(content={"ok": True})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5050"))
    logger.info(f"🚀 Starting Pipecat multi-agent voice server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
