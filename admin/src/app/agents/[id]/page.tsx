"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface KnowledgeFile {
  name: string
  size: number
  modified: string
}

export default function AgentEditorPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.id as string

  const [name, setName] = useState("")
  const [fromNumber, setFromNumber] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [greeting, setGreeting] = useState("")
  const [cartesiaVoiceId, setCartesiaVoiceId] = useState("")
  const [cartesiaVoiceName, setCartesiaVoiceName] = useState("")
  const [temperature, setTemperature] = useState(0.8)
  const [ttsSpeed, setTtsSpeed] = useState(1.1)
  const [endpointingMs, setEndpointingMs] = useState(300)
  const [utteranceEndMs, setUtteranceEndMs] = useState(1000)
  const [knowledgeFolder, setKnowledgeFolder] = useState("")
  const [calcomEventTypeId, setCalcomEventTypeId] = useState<number | "">("")
  const [active, setActive] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Knowledge base
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found")
        return r.json()
      })
      .then((data) => {
        setName(data.name || "")
        setFromNumber(data.fromNumber || "")
        setSystemPrompt(data.systemPrompt || "")
        setGreeting(data.greeting || "")
        setCartesiaVoiceId(data.cartesiaVoiceId || "")
        setCartesiaVoiceName(data.cartesiaVoiceName || "")
        setTemperature(data.temperature ?? 0.8)
        setTtsSpeed(data.ttsSpeed ?? 1.1)
        setEndpointingMs(data.endpointingMs ?? 300)
        setUtteranceEndMs(data.utteranceEndMs ?? 1000)
        setKnowledgeFolder(data.knowledgeFolder || "")
        setCalcomEventTypeId(data.calcomEventTypeId ?? "")
        setActive(data.active ?? true)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [agentId])

  // Load knowledge files
  const loadKnowledgeFiles = () => {
    fetch(`/api/knowledge/list?agentId=${agentId}`)
      .then((r) => r.json())
      .then(setKnowledgeFiles)
      .catch(() => {})
  }

  useEffect(() => {
    loadKnowledgeFiles()
  }, [agentId])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await fetch(`/api/agents/${agentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        fromNumber,
        systemPrompt,
        greeting,
        cartesiaVoiceId,
        cartesiaVoiceName,
        temperature,
        ttsSpeed,
        endpointingMs,
        utteranceEndMs,
        knowledgeFolder,
        calcomEventTypeId: calcomEventTypeId === "" ? null : Number(calcomEventTypeId),
        active,
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("agentId", agentId)
    await fetch("/api/knowledge/upload", { method: "POST", body: formData })
    setUploading(false)
    loadKnowledgeFiles()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDeleteFile = async (filename: string) => {
    await fetch("/api/knowledge/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, agentId }),
    })
    loadKnowledgeFiles()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
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
            <Label>From Number</Label>
            <Input
              value={fromNumber}
              onChange={(e) => setFromNumber(e.target.value)}
              placeholder="+1XXXXXXXXXX"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Twilio phone number in E.164 format</p>
          </div>
          <div className="flex items-center gap-3">
            <Label>Active</Label>
            <button
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                active ? "bg-green-600" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  active ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>
            <span className="text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</span>
          </div>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">System Prompt</CardTitle>
          <CardDescription>
            Full system prompt for this agent. Use {"{{current_date}}"}, {"{{current_time}}"}, {"{{caller_timezone}}"}, {"{{first_name}}"}, {"{{address}}"} as template variables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter system prompt..."
            className="min-h-[300px] font-mono text-xs"
          />
        </CardContent>
      </Card>

      {/* Greeting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Greeting Template</CardTitle>
          <CardDescription>
            Spoken greeting when the call connects. Available variables: {"{{first_name}}"}, {"{{address}}"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hey {{first_name}}, this is..."
            className="min-h-[80px] text-sm"
          />
        </CardContent>
      </Card>

      {/* Voice Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Cartesia TTS</CardTitle>
          <CardDescription>Text-to-speech voice configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Voice Name</Label>
            <Input
              value={cartesiaVoiceName}
              onChange={(e) => setCartesiaVoiceName(e.target.value)}
              placeholder="Carson"
            />
            <p className="text-xs text-muted-foreground">Display name for reference</p>
          </div>
          <div className="space-y-2">
            <Label>Voice ID</Label>
            <Input
              value={cartesiaVoiceId}
              onChange={(e) => setCartesiaVoiceId(e.target.value)}
              placeholder="86e30c1d-714b-4074-a1f2-1cb6b552fb49"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Cartesia voice UUID</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Speech Speed</Label>
              <span className="text-sm text-muted-foreground">{ttsSpeed.toFixed(1)}x</span>
            </div>
            <Slider
              value={[ttsSpeed]}
              onValueChange={([v]) => setTtsSpeed(v)}
              min={0.5}
              max={2.0}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">1.0 = normal, 1.1 = slightly faster</p>
          </div>
        </CardContent>
      </Card>

      {/* LLM Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">GPT-4o (LLM)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([v]) => setTemperature(v)}
              min={0.0}
              max={1.5}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">Lower = more focused, higher = more creative</p>
          </div>
        </CardContent>
      </Card>

      {/* STT Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Deepgram STT</CardTitle>
          <CardDescription>Speech-to-text detection settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Endpointing</Label>
              <span className="text-sm text-muted-foreground">{endpointingMs}ms</span>
            </div>
            <Slider
              value={[endpointingMs]}
              onValueChange={([v]) => setEndpointingMs(v)}
              min={300}
              max={1000}
              step={50}
            />
            <p className="text-xs text-muted-foreground">Silence before finalizing speech</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Utterance End</Label>
              <span className="text-sm text-muted-foreground">{utteranceEndMs}ms</span>
            </div>
            <Slider
              value={[utteranceEndMs]}
              onValueChange={([v]) => setUtteranceEndMs(v)}
              min={1000}
              max={3000}
              step={100}
            />
            <p className="text-xs text-muted-foreground">Time after last word to trigger end of utterance</p>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge & Booking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Knowledge & Booking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Knowledge Folder</Label>
            <Input
              value={knowledgeFolder}
              onChange={(e) => setKnowledgeFolder(e.target.value)}
              placeholder="knowledge/agent-name"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Relative path from project root</p>
          </div>
          <div className="space-y-2">
            <Label>Cal.com Event Type ID</Label>
            <Input
              type="number"
              value={calcomEventTypeId}
              onChange={(e) =>
                setCalcomEventTypeId(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="4522154"
            />
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Base Files */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Knowledge Base Documents</CardTitle>
          <CardDescription>Upload .txt or .md files for this agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              onChange={handleUpload}
              className="text-sm text-muted-foreground file:mr-3 file:border file:border-border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground file:cursor-pointer"
            />
            {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
          </div>
          {knowledgeFiles.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Name</th>
                  <th className="pb-2 font-medium text-muted-foreground">Size</th>
                  <th className="pb-2 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {knowledgeFiles.map((file) => (
                  <tr key={file.name} className="border-b border-border last:border-0">
                    <td className="py-2">{file.name}</td>
                    <td className="py-2 text-muted-foreground">{formatSize(file.size)}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFile(file.name)}
                        className="text-muted-foreground hover:text-destructive"
                      >
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
