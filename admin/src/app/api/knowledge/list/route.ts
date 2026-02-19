import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const agentId = searchParams.get("agentId")

  let knowledgeDir: string
  if (agentId) {
    // Read agent's knowledgeFolder from agents.json
    try {
      const agentsData = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "..", "agents.json"), "utf-8")
      )
      const agent = agentsData.agents?.[agentId]
      if (agent?.knowledgeFolder) {
        knowledgeDir = path.join(process.cwd(), "..", agent.knowledgeFolder)
      } else {
        knowledgeDir = path.join(process.cwd(), "..", "knowledge")
      }
    } catch {
      knowledgeDir = path.join(process.cwd(), "..", "knowledge")
    }
  } else {
    knowledgeDir = path.join(process.cwd(), "..", "knowledge")
  }

  if (!fs.existsSync(knowledgeDir)) {
    return NextResponse.json([])
  }

  const files = fs.readdirSync(knowledgeDir).map((name) => {
    const filePath = path.join(knowledgeDir, name)
    const stats = fs.statSync(filePath)
    return {
      name,
      size: stats.size,
      modified: stats.mtime.toISOString(),
    }
  })

  return NextResponse.json(files)
}
