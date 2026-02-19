"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Call {
  id: string
  timestamp: string
  to?: string
  firstName?: string
  status?: string
  agentId?: string
}

interface Agent {
  name: string
  active: boolean
}

export default function DashboardPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [agents, setAgents] = useState<Record<string, Agent>>({})

  useEffect(() => {
    fetch("/api/calls").then((r) => r.json()).then(setCalls).catch(() => {})
    fetch("/api/agents").then((r) => r.json()).then(setAgents).catch(() => {})
  }, [])

  const agentCount = Object.keys(agents).length
  const activeCount = Object.values(agents).filter((a) => a.active).length

  // Per-agent call counts
  const agentCallCounts: Record<string, number> = {}
  for (const call of calls) {
    const aid = call.agentId || "unknown"
    agentCallCounts[aid] = (agentCallCounts[aid] || 0) + 1
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{calls.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{agentCount}</p>
            <p className="text-xs text-muted-foreground mt-1">{activeCount} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{activeCount > 0 ? "Online" : "No Agents"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-agent call stats */}
      {agentCount > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Calls by Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Agent</th>
                  <th className="pb-2 font-medium text-muted-foreground">Calls</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(agents).map(([id, agent]) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="py-2">{agent.name}</td>
                    <td className="py-2 text-muted-foreground">{agentCallCounts[id] || 0}</td>
                  </tr>
                ))}
                {agentCallCounts["unknown"] && (
                  <tr className="border-b border-border last:border-0">
                    <td className="py-2 text-muted-foreground">Unassigned</td>
                    <td className="py-2 text-muted-foreground">{agentCallCounts["unknown"]}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Calls</CardTitle>
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
                  <th className="pb-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {calls.slice(0, 10).map((call) => (
                  <tr key={call.id} className="border-b border-border last:border-0">
                    <td className="py-2 text-muted-foreground">
                      {new Date(call.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2">{call.to || "---"}</td>
                    <td className="py-2">{call.firstName || "---"}</td>
                    <td className="py-2 text-muted-foreground">
                      {call.agentId && agents[call.agentId]
                        ? agents[call.agentId].name
                        : "---"}
                    </td>
                    <td className="py-2">{call.status || "initiated"}</td>
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
