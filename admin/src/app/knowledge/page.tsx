"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface KnowledgeFile {
  name: string
  size: number
  modified: string
}

interface Agent {
  name: string
  knowledgeFolder: string
}

export default function KnowledgePage() {
  const [agents, setAgents] = useState<Record<string, Agent>>({})
  const [agentId, setAgentId] = useState("")
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data)
        const ids = Object.keys(data)
        if (ids.length === 1) setAgentId(ids[0])
      })
      .catch(() => {})
  }, [])

  const loadFiles = () => {
    if (!agentId) return
    fetch(`/api/knowledge/list?agentId=${agentId}`)
      .then((r) => r.json())
      .then(setFiles)
      .catch(() => {})
  }

  useEffect(() => {
    loadFiles()
  }, [agentId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !agentId) return

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("agentId", agentId)

    await fetch("/api/knowledge/upload", {
      method: "POST",
      body: formData,
    })

    setUploading(false)
    loadFiles()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDelete = async (filename: string) => {
    await fetch("/api/knowledge/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, agentId }),
    })
    loadFiles()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
            {Object.entries(agents).map(([id, agent]) => (
              <SelectItem key={id} value={id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {agentId && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Upload Document</CardTitle>
              <CardDescription>
                Upload .txt or .md files. Content will be injected into the system prompt as context.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Name</th>
                      <th className="pb-2 font-medium text-muted-foreground">Size</th>
                      <th className="pb-2 font-medium text-muted-foreground">Modified</th>
                      <th className="pb-2 font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.name} className="border-b border-border last:border-0">
                        <td className="py-2">{file.name}</td>
                        <td className="py-2 text-muted-foreground">{formatSize(file.size)}</td>
                        <td className="py-2 text-muted-foreground">
                          {new Date(file.modified).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(file.name)}
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
        </>
      )}
    </div>
  )
}
