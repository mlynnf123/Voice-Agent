import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const CALLS_PATH = path.join(process.cwd(), "..", "calls.json")

function readCalls() {
  try {
    const data = fs.readFileSync(CALLS_PATH, "utf-8")
    return JSON.parse(data)
  } catch {
    return []
  }
}

export async function GET() {
  return NextResponse.json(readCalls())
}

export async function POST(request: Request) {
  const body = await request.json()
  const calls = readCalls()
  calls.unshift({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...body,
  })
  fs.writeFileSync(CALLS_PATH, JSON.stringify(calls, null, 2))
  return NextResponse.json(calls)
}
