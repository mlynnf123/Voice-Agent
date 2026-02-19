"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Agent {
  name: string
}

interface Call {
  id: string
  timestamp: string
  to?: string
  firstName?: string
  address?: string
  status?: string
  duration?: string
  callSid?: string
  agentId?: string
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [agents, setAgents] = useState<Record<string, Agent>>({})

  useEffect(() => {
    fetch("/api/calls").then((r) => r.json()).then(setCalls).catch(() => {})
    fetch("/api/agents").then((r) => r.json()).then(setAgents).catch(() => {})
  }, [])

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-6">Call History</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">All Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Time</th>
                  <th className="pb-2 font-medium text-muted-foreground">To</th>
                  <th className="pb-2 font-medium text-muted-foreground">Name</th>
                  <th className="pb-2 font-medium text-muted-foreground">Agent</th>
                  <th className="pb-2 font-medium text-muted-foreground">Address</th>
                  <th className="pb-2 font-medium text-muted-foreground">Status</th>
                  <th className="pb-2 font-medium text-muted-foreground">Duration</th>
                  <th className="pb-2 font-medium text-muted-foreground">Call SID</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id} className="border-b border-border last:border-0">
                    <td className="py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(call.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 whitespace-nowrap">{call.to || "---"}</td>
                    <td className="py-2">{call.firstName || "---"}</td>
                    <td className="py-2 text-muted-foreground">
                      {call.agentId && agents[call.agentId]
                        ? agents[call.agentId].name
                        : "---"}
                    </td>
                    <td className="py-2 text-muted-foreground max-w-[200px] truncate">
                      {call.address || "---"}
                    </td>
                    <td className="py-2">{call.status || "initiated"}</td>
                    <td className="py-2 text-muted-foreground">{call.duration || "---"}</td>
                    <td className="py-2 text-muted-foreground text-xs font-mono max-w-[120px] truncate">
                      {call.callSid || "---"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
