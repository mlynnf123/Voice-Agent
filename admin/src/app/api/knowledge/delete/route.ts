import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

function getKnowledgeDir(agentId?: string | null): string {
  if (agentId) {
    try {
      const agentsData = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "..", "agents.json"), "utf-8")
      )
      const agent = agentsData.agents?.[agentId]
      if (agent?.knowledgeFolder) {
        return path.join(process.cwd(), "..", agent.knowledgeFolder)
      }
    } catch {}
  }
  return path.join(process.cwd(), "..", "knowledge")
}

export async function POST(request: Request) {
  const { filename, agentId } = await request.json()

  if (!filename) {
    return NextResponse.json({ error: "No filename provided" }, { status: 400 })
  }

  const knowledgeDir = getKnowledgeDir(agentId)
  const safeName = path.basename(filename)
  const filePath = path.join(knowledgeDir, safeName)

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  fs.unlinkSync(filePath)
  return NextResponse.json({ success: true })
}
