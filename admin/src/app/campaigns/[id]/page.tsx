"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { apiJson } from "@/lib/api"

interface Campaign {
  id: number; name: string; agent_id: string; total_contacts: number
  called: number; status: string; created_at: string
}

interface Contact {
  id: number; first_name: string; last_name: string; phone1: string; phone2: string
  address: string; email: string; status: string; outcome: string
  call_sid: string; called_at: string; call_status: string; duration: number
  call_outcome: string; transcript: string
}

interface Summary {
  total: number; called: number; pending: number; completed: number
  scheduled: number; not_interested: number; no_answer: number; failed: number
}

interface TranscriptTurn { role: string; text: string }

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    called: "bg-blue-100 text-blue-800",
    pending: "bg-gray-100 text-gray-500",
    failed: "bg-red-100 text-red-800",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (!outcome) return <span className="text-xs text-muted-foreground">—</span>
  const colors: Record<string, string> = {
    scheduled: "bg-green-100 text-green-800",
    "not-interested": "bg-orange-100 text-orange-800",
    voicemail: "bg-yellow-100 text-yellow-800",
    "no-answer": "bg-gray-100 text-gray-500",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[outcome] || "bg-gray-100 text-gray-600"}`}>
      {outcome}
    </span>
  )
}

function TranscriptView({ transcript }: { transcript: string }) {
  let turns: TranscriptTurn[] = []
  try { turns = JSON.parse(transcript) } catch { return null }
  if (!turns?.length) return null

  const merged: TranscriptTurn[] = []
  for (const turn of turns) {
    if (merged.length > 0 && merged[merged.length - 1].role === turn.role) {
      merged[merged.length - 1].text += " " + turn.text
    } else {
      merged.push({ ...turn })
    }
  }

  return (
    <div className="space-y-2 mt-2 max-h-[400px] overflow-y-auto">
      {merged.map((t, i) => (
        <div key={i} className={`flex ${t.role === "assistant" ? "justify-start" : "justify-end"}`}>
          <div className={`max-w-[85%] px-3 py-1.5 rounded-lg text-xs ${
            t.role === "assistant" ? "bg-blue-50 text-blue-900 border border-blue-100" : "bg-gray-100 text-gray-900 border border-gray-200"
          }`}>
            <div className="text-[9px] font-medium uppercase tracking-wider mb-0.5 opacity-50">
              {t.role === "assistant" ? "Agent" : "Caller"}
            </div>
            {t.text}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CampaignReportPage() {
  const { id } = useParams()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [expandedContact, setExpandedContact] = useState<number | null>(null)

  const loadReport = () => {
    apiJson<{ campaign: Campaign; summary: Summary; contacts: Contact[] }>(`/campaigns/${id}/report`)
      .then(d => {
        setCampaign(d.campaign)
        setSummary(d.summary)
        setContacts(d.contacts)
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadReport()
    const iv = setInterval(loadReport, 5000)
    return () => clearInterval(iv)
  }, [id])

  if (!campaign || !summary) {
    return <div className="text-muted-foreground text-sm p-8">Loading...</div>
  }

  const conversionRate = summary.called > 0 ? ((summary.scheduled / summary.called) * 100).toFixed(1) : "0.0"

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            Campaign Report · {campaign.agent_id} · Created {new Date(campaign.created_at + "Z").toLocaleDateString()}
          </p>
        </div>
        <a href="/campaigns" className="text-sm text-blue-500 hover:underline">← Back to Campaigns</a>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-2xl font-bold">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.called}</div>
            <div className="text-xs text-muted-foreground">Called</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-2xl font-bold text-green-600">{summary.scheduled}</div>
            <div className="text-xs text-muted-foreground">Scheduled</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{summary.not_interested}</div>
            <div className="text-xs text-muted-foreground">Not Interested</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{conversionRate}%</div>
            <div className="text-xs text-muted-foreground">Conversion</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{summary.called} of {summary.total} called</span>
          <span>{summary.pending} remaining</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${summary.total > 0 ? (summary.called / summary.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Contact List */}
      <div className="space-y-2">
        {contacts.map(c => (
          <Card
            key={c.id}
            className={`cursor-pointer transition-all hover:shadow-sm ${expandedContact === c.id ? "ring-1 ring-blue-200" : ""}`}
          >
            <CardContent className="py-3 px-4">
              <div
                className="flex items-center justify-between"
                onClick={() => setExpandedContact(expandedContact === c.id ? null : c.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="min-w-[150px]">
                    <span className="font-medium">{c.first_name} {c.last_name}</span>
                    <div className="text-xs text-muted-foreground">{c.phone1}</div>
                  </div>
                  <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {c.address || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <OutcomeBadge outcome={c.call_outcome} />
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {c.duration ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s` : "—"}
                  </span>
                  <svg
                    className={`w-4 h-4 text-muted-foreground transition-transform ${expandedContact === c.id ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {expandedContact === c.id && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="grid grid-cols-4 gap-3 text-xs mb-2">
                    <div><span className="text-muted-foreground">Phone 2</span><div>{c.phone2 || "—"}</div></div>
                    <div><span className="text-muted-foreground">Email</span><div>{c.email || "—"}</div></div>
                    <div><span className="text-muted-foreground">Call SID</span><div className="font-mono truncate">{c.call_sid || "—"}</div></div>
                    <div><span className="text-muted-foreground">Called At</span><div>{c.called_at ? new Date(c.called_at + "Z").toLocaleString() : "—"}</div></div>
                  </div>
                  {c.transcript && <TranscriptView transcript={c.transcript} />}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
