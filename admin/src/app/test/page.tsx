"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Agent {
  name: string
  fromNumber: string
  active: boolean
}

export default function TestPage() {
  const [agents, setAgents] = useState<Record<string, Agent>>({})
  const [agentId, setAgentId] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [firstName, setFirstName] = useState("")
  const [address, setAddress] = useState("")
  const [calling, setCalling] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; error?: string; callSid?: string } | null>(null)

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data)
        const activeIds = Object.entries(data)
          .filter(([, a]) => (a as Agent).active)
          .map(([id]) => id)
        if (activeIds.length === 1) setAgentId(activeIds[0])
      })
      .catch(() => {})
  }, [])

  const handleCall = async () => {
    setCalling(true)
    setResult(null)

    try {
      const resp = await fetch("/api/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, firstName, address, agentId }),
      })
      const data = await resp.json()
      setResult(data)
    } catch (err) {
      setResult({ error: (err as Error).message })
    }

    setCalling(false)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-6">Test Call</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Trigger Outbound Call</CardTitle>
          <CardDescription>
            Send a test call via the voice server running on localhost:5050.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(agents).map(([id, agent]) => (
                  <SelectItem key={id} value={id}>
                    {agent.name} {!agent.active && "(inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+15125551234"
            />
          </div>
          <div className="space-y-2">
            <Label>First Name</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Austin TX"
            />
          </div>

          <Button
            onClick={handleCall}
            disabled={calling || !phoneNumber || !firstName || !address || !agentId}
          >
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
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      SID: {result.callSid}
                    </p>
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
