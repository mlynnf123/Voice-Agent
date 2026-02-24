"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { apiFetch, apiJson } from "@/lib/api"

interface Agent {
  id: string
  name: string
}

interface KBEntry {
  id: number
  agent_id: string
  title: string
  content: string
  created_at: string
}

export default function KnowledgePage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState("")
  const [entries, setEntries] = useState<KBEntry[]>([])
  const [newTitle, setNewTitle] = useState("")
  const [newContent, setNewContent] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    apiJson<{ agents: Agent[] }>("/agents")
      .then((d) => {
        setAgents(d.agents)
        if (d.agents.length === 1) setAgentId(d.agents[0].id)
      })
      .catch(() => {})
  }, [])

  const loadEntries = () => {
    if (!agentId) return
    apiJson<{ entries: KBEntry[] }>(`/agents/${agentId}/knowledge`)
      .then((d) => setEntries(d.entries))
      .catch(() => {})
  }

  useEffect(() => {
    loadEntries()
  }, [agentId])

  const handleAdd = async () => {
    if (!newTitle || !newContent || !agentId) return
    setAdding(true)
    await apiFetch(`/agents/${agentId}/knowledge`, {
      method: "POST",
      body: JSON.stringify({ title: newTitle, content: newContent }),
    })
    setNewTitle("")
    setNewContent("")
    setAdding(false)
    loadEntries()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !agentId) return
    const text = await file.text()
    const title = file.name.replace(/\.(txt|md)$/, "")
    await apiFetch(`/agents/${agentId}/knowledge`, {
      method: "POST",
      body: JSON.stringify({ title, content: text }),
    })
    loadEntries()
    e.target.value = ""
  }

  const handleDelete = async (kbId: number) => {
    await apiFetch(`/agents/${agentId}/knowledge/${kbId}`, { method: "DELETE" })
    loadEntries()
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-6">Knowledge Base</h1>

      <div className="mb-6 space-y-2">
        <Label>Agent</Label>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select an agent" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {agentId && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Add Entry</CardTitle>
              <CardDescription>Paste text or upload a .txt/.md file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title" />
              <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Paste content..." className="min-h-[100px] text-xs" />
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleAdd} disabled={adding || !newTitle || !newContent}>
                  {adding ? "Adding..." : "Add Entry"}
                </Button>
                <span className="text-xs text-muted-foreground">or</span>
                <input type="file" accept=".txt,.md" onChange={handleUpload} className="text-sm text-muted-foreground file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground file:cursor-pointer" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Entries ({entries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No entries yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Title</th>
                      <th className="pb-2 font-medium text-muted-foreground">Size</th>
                      <th className="pb-2 font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-border last:border-0">
                        <td className="py-2">{entry.title}</td>
                        <td className="py-2 text-muted-foreground">{(entry.content?.length || 0).toLocaleString()} chars</td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(entry.id)} className="text-muted-foreground hover:text-destructive">
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
