"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Agent {
  id: string
  name: string
  fromNumber: string
  cartesiaVoiceName: string
  active: boolean
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const router = useRouter()

  const loadAgents = () => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const list = Object.entries(data).map(([id, agent]) => ({
          id,
          ...(agent as Omit<Agent, "id">),
        }))
        setAgents(list)
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    await fetch(`/api/agents/${id}`, { method: "DELETE" })
    setDeleting(null)
    loadAgents()
  }

  const handleCreate = async () => {
    const resp = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Agent" }),
    })
    const data = await resp.json()
    router.push(`/agents/${data.id}`)
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Agents</h1>
        <Button variant="outline" onClick={handleCreate}>
          Create Agent
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">All Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents configured yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Name</th>
                  <th className="pb-2 font-medium text-muted-foreground">Phone Number</th>
                  <th className="pb-2 font-medium text-muted-foreground">Voice</th>
                  <th className="pb-2 font-medium text-muted-foreground">Status</th>
                  <th className="pb-2 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b border-border last:border-0">
                    <td className="py-2">
                      <button
                        onClick={() => router.push(`/agents/${agent.id}`)}
                        className="text-foreground hover:underline text-left"
                      >
                        {agent.name}
                      </button>
                    </td>
                    <td className="py-2 text-muted-foreground font-mono text-xs">
                      {agent.fromNumber || "---"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {agent.cartesiaVoiceName || "---"}
                    </td>
                    <td className="py-2">
                      <span
                        className={
                          agent.active
                            ? "text-green-500"
                            : "text-muted-foreground"
                        }
                      >
                        {agent.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/agents/${agent.id}`)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(agent.id, agent.name)}
                        disabled={deleting === agent.id}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deleting === agent.id ? "Deleting..." : "Delete"}
                      </Button>
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
