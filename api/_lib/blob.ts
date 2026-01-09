import { put } from '@vercel/blob'

export type JsonRead<T> = { data: T }

function getBlobAuthHeaders(): HeadersInit | undefined {
  // In production, blob URLs might not be publicly readable. When a read/write token is
  // available, use it to authorize reads.
  // Note: This is server-side code (Vercel Functions / Edge). Never expose this token to the client.
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return undefined
  return { Authorization: `Bearer ${token}` }
}

async function fetchWithRetry(url: string, init?: RequestInit) {
  let lastErr: unknown
  // Small retry helps with occasional edge network/runtime hiccups.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res

      // If forbidden, surface a more actionable message.
      if (res.status === 403) {
        throw new Error(
          `Failed to read blob: 403 (Forbidden). If you're running on Vercel production, the blob may be private. Ensure BLOB_READ_WRITE_TOKEN is set for server-side reads, or upload with access: 'public'.`,
        )
      }

      // Retry once for transient server errors.
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 75))
        continue
      }

      throw new Error(`Failed to read blob: ${res.status}`)
    } catch (e) {
      lastErr = e
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 75))
        continue
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to read blob')
}

export async function readJson<T>(url: string): Promise<JsonRead<T>> {
  const res = await fetchWithRetry(url, {
    headers: getBlobAuthHeaders(),
  })
  const data = (await res.json()) as T
  return { data }
}

export async function readJsonOrNull<T>(url: string): Promise<JsonRead<T> | null> {
  const res = await fetchWithRetry(url, {
    headers: getBlobAuthHeaders(),
  })
  if (res.status === 404) return null
  const data = (await res.json()) as T
  return { data }
}

export async function putJson(key: string, data: unknown) {
  return put(key, JSON.stringify(data, null, 2), {
    // Default to private for production safety. Reads are still supported server-side via BLOB_READ_WRITE_TOKEN.
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
}
