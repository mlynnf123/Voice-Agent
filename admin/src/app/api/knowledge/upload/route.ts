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
  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const agentId = formData.get("agentId") as string | null

  const knowledgeDir = getKnowledgeDir(agentId)

  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true })
  }

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const allowedExtensions = [".txt", ".md"]
  const ext = path.extname(file.name).toLowerCase()
  if (!allowedExtensions.includes(ext)) {
    return NextResponse.json(
      { error: "Only .txt and .md files are allowed" },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const filePath = path.join(knowledgeDir, file.name)
  fs.writeFileSync(filePath, buffer)

  return NextResponse.json({ success: true, filename: file.name })
}
