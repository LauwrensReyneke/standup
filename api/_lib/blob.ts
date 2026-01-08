import { put } from '@vercel/blob'
import https from 'node:https'

export type JsonRead<T> = { data: T }

// Reuse connections across blob reads in the same lambda instance.
const keepAliveAgent = new https.Agent({ keepAlive: true })

// Tiny in-memory cache (best effort): helps when listing history and fetching multiple blobs.
const cache = new Map<string, { at: number; data: any }>()
const CACHE_TTL_MS = 5_000

export async function readJson<T>(url: string): Promise<JsonRead<T>> {
  const now = Date.now()
  const cached = cache.get(url)
  if (cached && now - cached.at < CACHE_TTL_MS) return { data: cached.data as T }

  // Node's fetch types don't expose the agent property (implementation-dependent).
  // We still pass it through for runtimes that honor it.
  const res = await fetch(url, { agent: keepAliveAgent as any } as any)
  if (!res.ok) throw new Error(`Failed to read blob: ${res.status}`)
  const data = (await res.json()) as T

  cache.set(url, { at: now, data })
  return { data }
}

export async function putJson(key: string, data: unknown) {
  return put(key, JSON.stringify(data, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
}
