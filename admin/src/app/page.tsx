"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiJson } from "@/lib/api"

interface Agent {
  id: string
  name: string
  company: string
  phone_number: string
  active: boolean
}

interface CallLog {
  id: number
  agent_id: string
  call_sid: string
  to_number: string
  from_number: string
  first_name: string
  status: string
  created_at: string
}

interface Stats {
  total_agents: number
  total_calls: number
  calls_today: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ total_agents: 0, total_calls: 0, calls_today: 0 })
  const [agents, setAgents] = useState<Agent[]>([])
  const [recentCalls, setRecentCalls] = useState<CallLog[]>([])

  useEffect(() => {
    apiJson<Stats>("/stats").then(setStats).catch(() => {})
    apiJson<{ agents: Agent[] }>("/agents").then((d) => setAgents(d.agents)).catch(() => {})
    apiJson<{ logs: CallLog[] }>("/call-logs?limit=10").then((d) => setRecentCalls(d.logs)).catch(() => {})
  }, [])

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]))

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
            <p className="text-2xl font-semibold">{stats.total_calls}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.total_agents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Calls Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.calls_today}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
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
                {recentCalls.map((call) => (
                  <tr key={call.id} className="border-b border-border last:border-0">
                    <td className="py-2 text-muted-foreground">
                      {new Date(call.created_at).toLocaleString()}
                    </td>
                    <td className="py-2">{call.to_number || "---"}</td>
                    <td className="py-2">{call.first_name || "---"}</td>
                    <td className="py-2 text-muted-foreground">
                      {agentMap[call.agent_id]?.name || call.agent_id || "---"}
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
