const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5050"

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })
  return res
}

export async function apiJson<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options)
  return res.json()
}
