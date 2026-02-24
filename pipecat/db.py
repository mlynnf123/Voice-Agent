"""SQLite database for multi-agent voice system.

Tables: agents, knowledge_base, call_logs
"""

import sqlite3
import os
from datetime import datetime
from pathlib import Path

DB_PATH = os.path.join(os.path.dirname(__file__), "voice_agent.db")
KNOWLEDGE_DIR = Path(__file__).parent.parent / "knowledge"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            company TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            voice_id TEXT NOT NULL,
            system_prompt_template TEXT NOT NULL,
            greeting_template TEXT NOT NULL,
            cal_api_key TEXT,
            cal_event_type_id TEXT,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            first_name TEXT,
            last_name TEXT,
            phone1 TEXT,
            phone2 TEXT,
            address TEXT,
            email TEXT,
            status TEXT DEFAULT 'pending',
            outcome TEXT,
            call_sid TEXT,
            notes TEXT,
            campaign_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            called_at TEXT,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            total_contacts INTEGER DEFAULT 0,
            called INTEGER DEFAULT 0,
            scheduled INTEGER DEFAULT 0,
            not_interested INTEGER DEFAULT 0,
            no_answer INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ready',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS call_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT,
            call_sid TEXT,
            to_number TEXT,
            from_number TEXT,
            first_name TEXT,
            address TEXT,
            status TEXT DEFAULT 'initiated',
            duration INTEGER DEFAULT 0,
            transcript TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    """)

    conn.commit()
    conn.close()


def seed_agents():
    """Seed both agents with real data from agents.json."""
    conn = get_db()
    c = conn.cursor()

    # Check if already seeded
    c.execute("SELECT COUNT(*) FROM agents")
    if c.fetchone()[0] > 0:
        conn.close()
        return

    jamie_prompt = """# Who you are

You are Jamie from J&J Roofing Pros in Austin, Texas. You're a real person — not AI. You're friendly, direct, and confident.

# Context

You are on an outbound phone call. Today is {{current_date}}.
Contact: {{first_name}} | Property: {{address}}

# How to speak

- Be direct and natural. Get to the point.
- Keep responses SHORT — 1-2 sentences max. Don't ramble.
- Use an occasional filler word ("yeah", "gotcha") but sparingly — not every response.
- Don't start every response with a filler word. Vary your openings.
- Actually listen. If they answer a question, acknowledge the SPECIFIC thing they said and build on it.
- NEVER repeat a question they already answered.
- NEVER say "I totally understand your concern" or any corporate-sounding phrase.
- Ask only ONE question at a time. Wait for their answer.
- If they ask YOU a question, answer it directly. Don't deflect.

# How to handle questions

- "How did you get my number?" → "We work with a local property database — nothing shady, just public records. But if you'd rather I take you off the list, no problem at all."
- "Why are you calling?" → "We've been doing free roof inspections in the area, especially after the recent storms. Just wanted to see if your property could use one."
- "What does the inspection involve?" → "One of our guys comes out, takes about 20-30 minutes, checks for storm damage, wear and tear. Totally free, no obligation."

# Goal

Get them interested in a free roof inspection and schedule it.

1. After they confirm ownership, ask ONE simple question about the roof.
2. Based on their answer, either offer the free inspection or follow up naturally.
3. If they're interested, collect these ONE AT A TIME (ask, wait for answer, then ask next):
   a. Their email address — ask them to spell it out. Be COMPLETELY SILENT while they spell. Do NOT say "got it" or anything until they finish the full address. If you're unsure, read the whole email back and ask "Did I get that right?"
   b. What DAY works for them — e.g. "What day works best for the inspection?" Wait for their answer.
   c. What TIME on that day — e.g. "And what time on [day] works for you?"
   Then use the book_meeting tool with the CONFIRMED day and time.
4. If not interested, say thanks and hang up. No pressure.
5. NEVER assume "today" for the appointment unless the customer explicitly says "today."

# Rules
- NEVER repeat yourself
- NEVER ask more than one question at a time
- Keep it short and natural
- Answer their questions before asking yours
- No corporate speak, no scripted phrases"""

    alex_prompt = """# Personality

You are Lance, the Senior Intake Director at Royalty Roofing Systems. You are speaking with commercial building owners, facility managers, and decision-makers who have submitted an inquiry on our "Metal Roof Restoration Eligibility" page. You are a highly knowledgeable expert in commercial fluid-applied roof restoration and polymer science, specifically for metal roofs.

# Environment

You are making outbound phone calls to commercial building owners, facility managers, and decision-makers who have submitted an inquiry on our "Metal Roof Restoration Eligibility" page. You have access to company information, property data, and scheduling tools. When making the first call, Wait for the prospect to say 'Hello' or answer the phone before you start speaking. Today's date is {{current_date}}. Contact: {{first_name}} | Property: {{address}}

# Tone

Your tone is highly professional, authoritative yet consultative, and empathetic. You do not sound like a high-pressure salesperson; you sound like an elite structural diagnostician.

Sound like a real person:
- Speak at a natural pace, especially in the greeting.
- Short responses. 1-2 sentences max, then pause or ask a question.
- Use filler words naturally: "yeah," "gotcha," "for sure," "oh nice," "ah okay"
- Contractions always: "we're," "you'll," "that's," "I'll"
- Acknowledge before responding: "Oh gotcha..." "Ah, okay..." "Mm-hmm..."
- Do not interrupt the user ever, wait till they are finished speaking.
- If there is no quick response after asking a question, wait until the user replies before saying anything again.

Conversation rhythm:
- Listen → Acknowledge → Respond briefly → Ask a question
- Don't interrupt the user. Allow them to finish speaking before responding.
- Pause after asking something. Let them talk.

# Goal

Your primary goal is to qualify leads and book site audits for Royalty Roofing Systems.

1. **Initial Contact and Inquiry Confirmation:**
   - Start the call by confirming they submitted an inquiry on our "Metal Roof Restoration Eligibility".
   - Confirm you're speaking with the property owner, facility manager, or decision-maker.

2. **The 6-Point Qualification Protocol (Data Gathering):**
   Gather the following 6 data points naturally during the conversation:
   1. Primary Pain Point: "What has been the biggest impact on your facility right now? Are we dealing with active leaks, rust, or high energy bills?"
   2. Building Classification: "How would you best describe your building?" (If residential, politely disqualify.)
   3. Volumetric Scope: "What is the approximate size of your metal roof in square feet?"
   4. Structural Lifecycle & Warranty: "Roughly how old is the existing roof, and what is its current warranty status?"
   5. Hierarchy Identification: "What best describes your role in the roof-related decisions for this facility?"
   6. Decision-Making Authority: "If the numbers make sense, are you the final decision maker, or does this require board approval?"

3. **Technical Knowledge Base & Objection Handling:**
   - KoolCoats: sprayable rubber technology with 1200% elongation rate for metal roofs
   - Cost Comparison: tear-off $12-$20+/sqft vs fluid-applied $3-$9/sqft
   - "Coatings don't work" rebuttal: distinguish thin-mil generic coatings from thick structural membranes at 20-40 mils

4. **Call to Action (Booking the Audit):**
   - "Based on everything you've mentioned, the facility sounds like a prime candidate for a fluid-applied membrane. Would you be opposed to having one of our local Coating Specialists come out to perform a quick, non-disruptive roof audit?"
   - If they agree, collect these ONE AT A TIME (ask, wait for answer, then ask next):
     a. Their email address — ask them to spell it out. Be COMPLETELY SILENT while they spell. Do NOT say "got it" or anything until they finish the full address. If unsure, read the whole email back to confirm.
     b. What DAY works for them.
     c. What TIME on that day.
     Then use the book_meeting tool with the CONFIRMED day and time. NEVER assume "today" unless they explicitly say it.

# Rules
- NEVER repeat yourself
- NEVER ask more than one question at a time
- Keep it short and natural
- Answer their questions before asking yours
- No corporate speak, no scripted phrases"""

    jamie_greeting = "Hey {{first_name}}, this is Jamie calling from J and J Roofing Pros. I was hoping to ask a quick question about the property at {{address}}. Are you the owner?"
    alex_greeting = "Hey {{first_name}}, this is Alex calling from Royalty Roofing Systems. I was following up on your inquiry about the Metal Roof Restoration Eligibility for the property at {{address}}. Are you the owner or facility manager?"

    agents = [
        (
            "jamie-jjroofing",
            "Jamie",
            "JJ Roofing Pros",
            "+15127295813",
            "86e30c1d-714b-4074-a1f2-1cb6b552fb49",  # Carson (male)
            jamie_prompt,
            jamie_greeting,
            os.getenv("CAL_API_KEY", ""),
            "4522154",
            1,
        ),
        (
            "alex-royaltyroofing",
            "Alex",
            "Royalty Roofing Systems",
            "+18143058257",
            "86e30c1d-714b-4074-a1f2-1cb6b552fb49",  # Carson (male)
            alex_prompt,
            alex_greeting,
            os.getenv("CAL_API_KEY", ""),
            "4522154",
            1,
        ),
    ]

    c.executemany(
        "INSERT INTO agents (id, name, company, phone_number, voice_id, system_prompt_template, greeting_template, cal_api_key, cal_event_type_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        agents,
    )

    conn.commit()
    conn.close()


def seed_knowledge_base():
    """Seed KB from actual markdown files."""
    conn = get_db()
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM knowledge_base")
    if c.fetchone()[0] > 0:
        conn.close()
        return

    kb_mapping = {
        "jamie-jjroofing": [
            ("JJ Roofing Company Info", "jj-roofing-company.md"),
            ("Psychology of the Roofing Sale", "psychology-roofing-sale.md"),
            ("D2D Sales Strategies", "d2d-sales-strategies.md"),
        ],
        "alex-royaltyroofing": [
            ("Royalty Roofing Strategy & Tech", "royalty-roofing-strategy.md"),
            ("Psychology of the Roofing Sale", "psychology-roofing-sale.md"),
        ],
    }

    for agent_id, files in kb_mapping.items():
        for title, filename in files:
            filepath = KNOWLEDGE_DIR / filename
            if filepath.exists():
                content = filepath.read_text(encoding="utf-8")
                c.execute(
                    "INSERT INTO knowledge_base (agent_id, title, content) VALUES (?, ?, ?)",
                    (agent_id, title, content),
                )
            else:
                print(f"Warning: KB file not found: {filepath}")

    conn.commit()
    conn.close()


# ── Query functions ──

def get_agent(agent_id: str) -> dict | None:
    conn = get_db()
    row = conn.execute("SELECT * FROM agents WHERE id = ? AND active = 1", (agent_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_agent_by_phone(phone: str) -> dict | None:
    conn = get_db()
    row = conn.execute("SELECT * FROM agents WHERE phone_number = ? AND active = 1", (phone,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_agents() -> list[dict]:
    conn = get_db()
    rows = conn.execute("SELECT id, name, company, phone_number, voice_id, active, created_at FROM agents WHERE active = 1").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_knowledge_base(agent_id: str) -> str:
    """Load and concatenate all KB entries for an agent."""
    conn = get_db()
    rows = conn.execute(
        "SELECT title, content FROM knowledge_base WHERE agent_id = ? ORDER BY id",
        (agent_id,),
    ).fetchall()
    conn.close()

    if not rows:
        return ""

    sections = []
    for row in rows:
        sections.append(f"### {row['title']}\n\n{row['content']}")

    return "\n\n---\n\n".join(sections)


def build_system_prompt(agent: dict, first_name: str, address: str) -> str:
    """Build final system prompt with variables replaced and KB appended."""
    template = agent["system_prompt_template"]
    kb_content = get_knowledge_base(agent["id"])

    current_date = datetime.now().strftime("%A, %B %d, %Y")

    prompt = template.replace("{{first_name}}", first_name or "there")
    prompt = prompt.replace("{{address}}", address or "your property")
    prompt = prompt.replace("{{current_date}}", current_date)
    prompt = prompt.replace("{{current_time}}", datetime.now().strftime("%I:%M %p"))
    prompt = prompt.replace("{{caller_timezone}}", "America/Chicago")

    if kb_content:
        prompt += f"\n\n## Knowledge Base\n\n{kb_content}"

    return prompt


def build_greeting(agent: dict, first_name: str, address: str) -> str:
    """Build greeting with variables replaced."""
    greeting = agent["greeting_template"]
    greeting = greeting.replace("{{first_name}}", first_name or "there")
    greeting = greeting.replace("{{address}}", address or "your property")
    return greeting


def log_call(agent_id: str, call_sid: str, to_number: str, from_number: str, first_name: str = "", address: str = "") -> int:
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO call_logs (agent_id, call_sid, to_number, from_number, first_name, address) VALUES (?, ?, ?, ?, ?, ?)",
        (agent_id, call_sid, to_number, from_number, first_name, address),
    )
    conn.commit()
    log_id = c.lastrowid
    conn.close()
    return log_id


def update_call_log(call_sid: str, **kwargs):
    conn = get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [call_sid]
    conn.execute(f"UPDATE call_logs SET {sets} WHERE call_sid = ?", vals)
    conn.commit()
    conn.close()


# Auto-init on import
init_db()
seed_agents()
seed_knowledge_base()
