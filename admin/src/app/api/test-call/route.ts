import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const body = await request.json()
  const { phoneNumber, firstName, address, agentId } = body

  if (!phoneNumber || !firstName || !address || !agentId) {
    return NextResponse.json(
      { error: "Missing: phoneNumber, firstName, address, agentId" },
      { status: 400 }
    )
  }

  try {
    const resp = await fetch("http://localhost:5050/make-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_number: phoneNumber,
        first_name: firstName,
        address: address,
        agent_id: agentId,
      }),
    })

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to connect to voice server: ${(err as Error).message}` },
      { status: 500 }
    )
  }
}
