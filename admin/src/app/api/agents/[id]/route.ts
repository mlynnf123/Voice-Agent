import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const agents = readAgents()
  const agent = agents[params.id]
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  }
  return NextResponse.json({ id: params.id, ...agent })
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json()
  const agents = readAgents()
  if (!agents[params.id]) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  }
  agents[params.id] = {
    ...agents[params.id],
    ...body,
    updatedAt: new Date().toISOString(),
  }
  writeAgents(agents)
  return NextResponse.json({ id: params.id, ...agents[params.id] })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const agents = readAgents()
  if (!agents[params.id]) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 })
  }
  delete agents[params.id]
  writeAgents(agents)
  return NextResponse.json({ success: true })
}
