import { head, put } from '@vercel/blob'

export type JsonRead<T> = { data: T; etag: string }

export async function readJson<T>(url: string): Promise<JsonRead<T>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to read blob: ${res.status}`)
  const etag = res.headers.get('etag') || ''
  const data = (await res.json()) as T
  return { data, etag }
}

export async function putJson(key: string, data: unknown, opts?: { ifMatch?: string }) {
  // Vercel Blob supports conditional requests via headers.
  const headers: Record<string, string> = {}
  if (opts?.ifMatch) headers['if-match'] = opts.ifMatch

  const res = await put(key, JSON.stringify(data, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    headers,
  })
  return res
}

export async function getEtagByUrl(blobUrl: string): Promise<string> {
  const h = await head(blobUrl)
  return h?.etag || ''
}

