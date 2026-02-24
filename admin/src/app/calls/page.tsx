"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { apiJson } from "@/lib/api"

interface Agent {
  id: string
  name: string
}

interface CallLog {
  id: number
  agent_id: string
  call_sid: string
  to_number: string
  from_number: string
  first_name: string
  address: string
  status: string
  outcome: string
  duration: number
  transcript: string
  created_at: string
}

interface TranscriptTurn {
  role: string
  text: string
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    "in-progress": "bg-blue-100 text-blue-800",
    initiated: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
    "no-answer": "bg-gray-100 text-gray-600",
    busy: "bg-orange-100 text-orange-800",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status || "initiated"}
    </span>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (!outcome) return <span className="text-xs text-muted-foreground">—</span>
  const colors: Record<string, string> = {
    scheduled: "bg-green-100 text-green-800",
    interested: "bg-blue-100 text-blue-800",
    "not-interested": "bg-gray-100 text-gray-600",
    voicemail: "bg-yellow-100 text-yellow-800",
    "no-answer": "bg-gray-100 text-gray-600",
    callback: "bg-purple-100 text-purple-800",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[outcome] || "bg-gray-100 text-gray-600"}`}>
      {outcome}
    </span>
  )
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatTime(dateStr: string): string {
  // DB stores UTC — append Z if no timezone info
  const d = new Date(dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z")
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatPhone(phone: string): string {
  if (!phone) return "—"
  const clean = phone.replace(/\D/g, "")
  if (clean.length === 11 && clean.startsWith("1")) {
    return `(${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`
  }
  return phone
}

function TranscriptView({ transcript }: { transcript: string }) {
  let turns: TranscriptTurn[] = []
  try {
    turns = JSON.parse(transcript)
  } catch {
    return <p className="text-sm text-muted-foreground italic">No transcript available</p>
  }

  if (!turns || turns.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No transcript available</p>
  }

  // Merge consecutive same-role turns
  const merged: TranscriptTurn[] = []
  for (const turn of turns) {
    if (merged.length > 0 && merged[merged.length - 1].role === turn.role) {
      merged[merged.length - 1].text += " " + turn.text
    } else {
      merged.push({ ...turn })
    }
  }

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto">
      {merged.map((turn, i) => (
        <div key={i} className={`flex ${turn.role === "assistant" ? "justify-start" : "justify-end"}`}>
          <div
            className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
              turn.role === "assistant"
                ? "bg-blue-50 text-blue-900 border border-blue-100"
                : "bg-gray-100 text-gray-900 border border-gray-200"
            }`}
          >
            <div className="text-[10px] font-medium uppercase tracking-wider mb-0.5 opacity-60">
              {turn.role === "assistant" ? "Jamie" : "Caller"}
            </div>
            {turn.text}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLog[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [filterAgent, setFilterAgent] = useState("all")
  const [expandedCall, setExpandedCall] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    apiJson<{ agents: Agent[] }>("/agents").then((d) => setAgents(d.agents)).catch(() => {})
  }, [])

  const fetchCalls = () => {
    const q = filterAgent && filterAgent !== "all" ? `?agent_id=${filterAgent}&limit=200` : "?limit=200"
    apiJson<{ logs: CallLog[] }>(`/call-logs${q}`).then((d) => setCalls(d.logs)).catch(() => {})
  }

  useEffect(() => {
    fetchCalls()
  }, [filterAgent])

  // Auto-refresh every 3 seconds
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchCalls, 3000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, filterAgent])

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]))

  const activeCalls = calls.filter((c) => c.status === "initiated" || c.status === "in-progress" || c.status === "ringing")
  const completedCalls = calls.filter((c) => c.status !== "initiated" && c.status !== "in-progress" && c.status !== "ringing")

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Call History</h1>
          <p className="text-sm text-muted-foreground">{calls.length} calls total</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {autoRefresh ? "Live" : "Paused"}
            </button>
          </div>
          <div>
            <Select value={filterAgent} onValueChange={setFilterAgent}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Active Calls */}
      {activeCalls.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-blue-600 mb-2 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Active Calls ({activeCalls.length})
          </h2>
          <div className="space-y-2">
            {activeCalls.map((call) => (
              <Card key={call.id} className="border-blue-200 bg-blue-50/50">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="font-medium">{call.first_name || "Unknown"}</span>
                        <span className="text-muted-foreground text-sm ml-2">{formatPhone(call.to_number)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{call.address}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {agentMap[call.agent_id]?.name || call.agent_id}
                      </span>
                      <StatusBadge status={call.status} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed Calls */}
      <div className="space-y-2">
        {completedCalls.map((call) => (
          <Card
            key={call.id}
            className={`cursor-pointer transition-all hover:shadow-sm ${expandedCall === call.id ? "ring-1 ring-blue-200" : ""}`}
          >
            <CardContent className="py-3 px-4">
              <div
                className="flex items-center justify-between"
                onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="min-w-[140px]">
                    <span className="font-medium">{call.first_name || "Unknown"}</span>
                    <div className="text-xs text-muted-foreground">{formatPhone(call.to_number)}</div>
                  </div>
                  <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {call.address || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {agentMap[call.agent_id]?.name || call.agent_id}
                  </span>
                  <OutcomeBadge outcome={call.outcome} />
                  <StatusBadge status={call.status} />
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {formatDuration(call.duration)}
                  </span>
                  <span className="text-xs text-muted-foreground w-[100px] text-right">
                    {formatTime(call.created_at)}
                  </span>
                  <svg
                    className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCall === call.id ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {expandedCall === call.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="grid grid-cols-4 gap-4 mb-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Call SID</span>
                      <div className="font-mono mt-0.5 truncate">{call.call_sid}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">From</span>
                      <div className="mt-0.5">{formatPhone(call.from_number)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duration</span>
                      <div className="mt-0.5">{formatDuration(call.duration)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Outcome</span>
                      <div className="mt-0.5">{call.outcome || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">Transcript</span>
                    <div className="mt-2">
                      <TranscriptView transcript={call.transcript} />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {completedCalls.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No completed calls yet
          </div>
        )}
      </div>
    </div>
  )
}
