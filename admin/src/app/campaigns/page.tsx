"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiJson, apiFetch } from "@/lib/api"

interface Agent { id: string; name: string; company: string }
interface Campaign {
  id: number; name: string; agent_id: string; total_contacts: number
  called: number; scheduled: number; status: string; created_at: string
}

export default function CampaignsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedAgent, setSelectedAgent] = useState("")
  const [campaignName, setCampaignName] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<string[][]>([])
  const [uploading, setUploading] = useState(false)
  const [batchSize, setBatchSize] = useState("10")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiJson<{ agents: Agent[] }>("/agents").then(d => setAgents(d.agents)).catch(() => {})
    loadCampaigns()
  }, [])

  const loadCampaigns = () => {
    apiJson<{ campaigns: Campaign[] }>("/campaigns").then(d => setCampaigns(d.campaigns)).catch(() => {})
  }

  // Auto-refresh campaigns
  useEffect(() => {
    const iv = setInterval(loadCampaigns, 5000)
    return () => clearInterval(iv)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split("\n").filter(l => l.trim())
      const parsed = lines.slice(0, 6).map(l => {
        // Simple CSV parse (handles quoted fields)
        const result: string[] = []
        let current = ""
        let inQuotes = false
        for (const ch of l) {
          if (ch === '"') { inQuotes = !inQuotes }
          else if (ch === "," && !inQuotes) { result.push(current.trim()); current = "" }
          else { current += ch }
        }
        result.push(current.trim())
        return result
      })
      setCsvPreview(parsed)
    }
    reader.readAsText(file)
  }

  const handleUpload = async () => {
    if (!csvFile || !selectedAgent) return
    setUploading(true)

    const text = await csvFile.text()

    try {
      const res = await apiJson<{ campaign_id: number; contacts_added: number }>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: campaignName || csvFile.name.replace(".csv", ""),
          agent_id: selectedAgent,
          csv_data: text,
        }),
      })
      alert(`Campaign created! ${res.contacts_added} contacts loaded.`)
      setCsvFile(null)
      setCsvPreview([])
      setCampaignName("")
      if (fileRef.current) fileRef.current.value = ""
      loadCampaigns()
    } catch (e) {
      alert("Failed to create campaign")
    }
    setUploading(false)
  }

  const startCampaign = async (campaignId: number) => {
    if (!confirm(`Start calling ${batchSize} contacts?`)) return
    try {
      await apiFetch(`/campaigns/${campaignId}/start`, {
        method: "POST",
        body: JSON.stringify({ batch_size: parseInt(batchSize) }),
      })
      loadCampaigns()
    } catch (e) {
      alert("Failed to start campaign")
    }
  }

  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]))

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold mb-6">Campaigns</h1>

      {/* Upload CSV */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">New Campaign — Upload CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input
                placeholder="e.g. Austin Batch 1"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} — {a.company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>CSV File</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">
              CSV should have columns: first_name, last_name, phone (or phone1), phone2 (optional), address, email (optional)
            </p>
          </div>

          {csvPreview.length > 0 && (
            <div className="border border-border rounded-lg overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    {csvPreview[0].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.slice(1).map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 text-muted-foreground">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30">
                Showing first 5 rows preview
              </div>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!csvFile || !selectedAgent || uploading}
          >
            {uploading ? "Uploading..." : "Create Campaign"}
          </Button>
        </CardContent>
      </Card>

      {/* Campaign List */}
      <div className="space-y-3">
        {campaigns.map(c => (
          <Card key={c.id}>
            <CardContent className="py-4 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {agentMap[c.agent_id]?.name || c.agent_id} · {c.total_contacts} contacts · Created {new Date(c.created_at + "Z").toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <div>{c.called}/{c.total_contacts} called</div>
                    <div className="text-muted-foreground">{c.scheduled} scheduled</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.status === "running" ? "bg-blue-100 text-blue-800 animate-pulse" :
                    c.status === "completed" ? "bg-green-100 text-green-800" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {c.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-16 h-8 text-xs"
                      value={batchSize}
                      onChange={e => setBatchSize(e.target.value)}
                      min="1"
                      max="50"
                    />
                    <Button
                      size="sm"
                      variant={c.status === "running" ? "secondary" : "default"}
                      disabled={c.status === "running" || c.called >= c.total_contacts}
                      onClick={() => startCampaign(c.id)}
                    >
                      {c.status === "running" ? "Running..." : c.called >= c.total_contacts ? "Done" : "Start Batch"}
                    </Button>
                  </div>
                  <a href={`/campaigns/${c.id}`} className="text-xs text-blue-500 hover:underline ml-2">
                    Report →
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {campaigns.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No campaigns yet. Upload a CSV above to get started.</div>
        )}
      </div>
    </div>
  )
}
