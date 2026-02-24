"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { apiFetch, apiJson } from "@/lib/api"

interface KBEntry {
  id: number
  title: string
  content: string
  created_at: string
}

export default function AgentEditorPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.id as string

  // Redirect /agents/new to the create page (handled by Next.js routing, but just in case)
  if (agentId === "new") {
    return null
  }

  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [voiceId, setVoiceId] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [greeting, setGreeting] = useState("")
  const [calApiKey, setCalApiKey] = useState("")
  const [calEventTypeId, setCalEventTypeId] = useState("")
  const [active, setActive] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Knowledge base
  const [kbEntries, setKbEntries] = useState<KBEntry[]>([])
  const [newKbTitle, setNewKbTitle] = useState("")
  const [newKbContent, setNewKbContent] = useState("")
  const [addingKb, setAddingKb] = useState(false)

  useEffect(() => {
    apiJson<any>(`/agents/${agentId}`)
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setName(data.name || "")
        setCompany(data.company || "")
        setPhoneNumber(data.phone_number || "")
        setVoiceId(data.voice_id || "")
        setSystemPrompt(data.system_prompt_template || "")
        setGreeting(data.greeting_template || "")
        setCalApiKey(data.cal_api_key || "")
        setCalEventTypeId(data.cal_event_type_id || "")
        setActive(data.active ?? true)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId])

  const loadKB = () => {
    apiJson<{ entries: KBEntry[] }>(`/agents/${agentId}/knowledge`)
      .then((d) => setKbEntries(d.entries))
      .catch(() => {})
  }

  useEffect(() => {
    loadKB()
  }, [agentId])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await apiFetch(`/agents/${agentId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          company,
          phone_number: phoneNumber,
          voice_id: voiceId,
          system_prompt_template: systemPrompt,
          greeting_template: greeting,
          cal_api_key: calApiKey,
          cal_event_type_id: calEventTypeId,
          active,
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        alert(`Save failed: ${err}`)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (e: any) {
      alert(`Save failed: ${e.message}`)
    }
    setSaving(false)
  }

  const handleAddKB = async () => {
    if (!newKbTitle || !newKbContent) return
    setAddingKb(true)
    await apiFetch(`/agents/${agentId}/knowledge`, {
      method: "POST",
      body: JSON.stringify({ title: newKbTitle, content: newKbContent }),
    })
    setNewKbTitle("")
    setNewKbContent("")
    setAddingKb(false)
    loadKB()
  }

  const handleDeleteKB = async (kbId: number) => {
    await apiFetch(`/agents/${agentId}/knowledge/${kbId}`, { method: "DELETE" })
    loadKB()
  }

  if (loading) {
    return <div className="max-w-3xl"><p className="text-sm text-muted-foreground">Loading...</p></div>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{name || "Agent Editor"}</h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">{agentId}</p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/agents")}>
          Back to Agents
        </Button>
      </div>

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1XXXXXXXXXX" className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label>Voice ID (Cartesia)</Label>
            <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="86e30c1d-..." className="font-mono text-xs" />
          </div>
          <div className="flex items-center gap-3">
            <Label>Active</Label>
            <button
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? "bg-green-600" : "bg-zinc-700"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${active ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
            </button>
            <span className="text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</span>
          </div>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">System Prompt Template</CardTitle>
          <CardDescription>
            Use {"{{current_date}}"}, {"{{current_time}}"}, {"{{first_name}}"}, {"{{address}}"} as template variables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Enter system prompt..." className="min-h-[300px] font-mono text-xs" />
        </CardContent>
      </Card>

      {/* Greeting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Greeting Template</CardTitle>
          <CardDescription>
            Spoken greeting when the call connects. Variables: {"{{first_name}}"}, {"{{address}}"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder='Hey {{first_name}}, this is...' className="min-h-[80px] text-sm" />
        </CardContent>
      </Card>

      {/* Cal.com */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cal.com Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Cal.com API Key</Label>
            <Input value={calApiKey} onChange={(e) => setCalApiKey(e.target.value)} placeholder="cal_live_..." className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label>Cal.com Event Type ID</Label>
            <Input value={calEventTypeId} onChange={(e) => setCalEventTypeId(e.target.value)} placeholder="4522154" />
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Base */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
          <CardDescription>Documents injected into the system prompt as context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {kbEntries.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Title</th>
                  <th className="pb-2 font-medium text-muted-foreground">Size</th>
                  <th className="pb-2 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {kbEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="py-2">{entry.title}</td>
                    <td className="py-2 text-muted-foreground">{(entry.content?.length || 0).toLocaleString()} chars</td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteKB(entry.id)} className="text-muted-foreground hover:text-destructive">
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="border border-border p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase">Add Entry</p>
            <Input value={newKbTitle} onChange={(e) => setNewKbTitle(e.target.value)} placeholder="Title" />
            <Textarea value={newKbContent} onChange={(e) => setNewKbContent(e.target.value)} placeholder="Paste content here..." className="min-h-[100px] text-xs" />
            <Button variant="outline" size="sm" onClick={handleAddKB} disabled={addingKb || !newKbTitle || !newKbContent}>
              {addingKb ? "Adding..." : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3 pb-8">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Agent"}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved</span>}
      </div>
    </div>
  )
}
