"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiFetch, apiJson } from "@/lib/api"

interface Agent {
  id: string
  name: string
  company: string
  phone_number: string
  active: boolean
}

export default function MakeCallPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [firstName, setFirstName] = useState("")
  const [address, setAddress] = useState("")
  const [calling, setCalling] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; error?: string; callSid?: string } | null>(null)

  useEffect(() => {
    apiJson<{ agents: Agent[] }>("/agents")
      .then((d) => {
        setAgents(d.agents)
        const active = d.agents.filter((a) => a.active)
        if (active.length === 1) setAgentId(active[0].id)
      })
      .catch(() => {})
  }, [])

  const handleCall = async () => {
    setCalling(true)
    setResult(null)

    try {
      const res = await apiFetch("/make-call", {
        method: "POST",
        body: JSON.stringify({
          to_number: phoneNumber,
          first_name: firstName,
          address: address,
          agent_id: agentId,
        }),
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: (err as Error).message })
    }

    setCalling(false)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-6">Make a Call</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Outbound Call</CardTitle>
          <CardDescription>Initiate a call via the Pipecat voice server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} — {a.company} {!a.active && "(inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+15125551234" />
          </div>
          <div className="space-y-2">
            <Label>First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Austin TX" />
          </div>

          <Button onClick={handleCall} disabled={calling || !phoneNumber || !firstName || !address || !agentId}>
            {calling ? "Calling..." : "Make Call"}
          </Button>

          {result && (
            <div className="mt-4 p-3 border border-border text-sm">
              {result.error ? (
                <p className="text-destructive">{result.error}</p>
              ) : (
                <div>
                  <p>Call initiated successfully.</p>
                  {result.callSid && (
                    <p className="text-muted-foreground mt-1 font-mono text-xs">SID: {result.callSid}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
