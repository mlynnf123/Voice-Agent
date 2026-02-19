import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import crypto from "crypto"

const AGENTS_PATH = path.join(process.cwd(), "..", "agents.json")

function readAgents(): Record<string, Record<string, unknown>> {
  try {
    const data = fs.readFileSync(AGENTS_PATH, "utf-8")
    return JSON.parse(data).agents || {}
  } catch {
    return {}
  }
}

function writeAgents(agents: Record<string, Record<string, unknown>>) {
  fs.writeFileSync(AGENTS_PATH, JSON.stringify({ agents }, null, 2))
}

export async function GET() {
  const agents = readAgents()
  return NextResponse.json(agents)
}

export async function POST(request: Request) {
  const body = await request.json()
  const agents = readAgents()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  agents[id] = {
    name: body.name || "New Agent",
    fromNumber: body.fromNumber || "",
    systemPrompt: body.systemPrompt || "",
    greeting: body.greeting || "",
    cartesiaVoiceId: body.cartesiaVoiceId || "",
    cartesiaVoiceName: body.cartesiaVoiceName || "",
    temperature: body.temperature ?? 0.8,
    ttsSpeed: body.ttsSpeed ?? 1.1,
    endpointingMs: body.endpointingMs ?? 300,
    utteranceEndMs: body.utteranceEndMs ?? 1000,
    knowledgeFolder: body.knowledgeFolder || "",
    calcomEventTypeId: body.calcomEventTypeId || null,
    active: body.active ?? true,
    createdAt: now,
    updatedAt: now,
  }
  writeAgents(agents)
  return NextResponse.json({ id, ...agents[id] })
}
