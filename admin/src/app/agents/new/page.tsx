"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { apiFetch } from "@/lib/api"

export default function CreateAgentPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [voiceId, setVoiceId] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [greeting, setGreeting] = useState("")
  const [calApiKey, setCalApiKey] = useState("")
  const [calEventTypeId, setCalEventTypeId] = useState("")

  const handleCreate = async () => {
    if (!id || !name || !company) {
      setError("ID, Name, and Company are required")
      return
    }
    setSaving(true)
    setError("")

    const res = await apiFetch("/agents", {
      method: "POST",
      body: JSON.stringify({
        id,
        name,
        company,
        phone_number: phoneNumber,
        voice_id: voiceId,
        system_prompt_template: systemPrompt,
        greeting_template: greeting,
        cal_api_key: calApiKey,
        cal_event_type_id: calEventTypeId,
        active: true,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || "Failed to create agent")
      setSaving(false)
      return
    }

    router.push(`/agents/${id}`)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Create Agent</h1>
        <Button variant="ghost" onClick={() => router.push("/agents")}>
          Back to Agents
        </Button>
      </div>

      {error && (
        <div className="p-3 border border-destructive text-destructive text-sm">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Agent ID</Label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="jamie-jjroofing" className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">Unique slug identifier (lowercase, hyphens)</p>
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jamie" />
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="JJ Roofing Pros" />
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1XXXXXXXXXX" className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label>Voice ID (Cartesia)</Label>
            <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="86e30c1d-714b-4074-a1f2-1cb6b552fb49" className="font-mono text-xs" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">System Prompt Template</CardTitle>
          <CardDescription>
            Use {"{{current_date}}"}, {"{{first_name}}"}, {"{{address}}"} as template variables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Enter system prompt..." className="min-h-[200px] font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Greeting Template</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder='Hey {{first_name}}, this is...' className="min-h-[80px] text-sm" />
        </CardContent>
      </Card>

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

      <div className="pb-8">
        <Button onClick={handleCreate} disabled={saving}>
          {saving ? "Creating..." : "Create Agent"}
        </Button>
      </div>
    </div>
  )
}
