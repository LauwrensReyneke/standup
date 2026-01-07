import { put } from '@vercel/blob'

export type JsonRead<T> = { data: T }

export async function readJson<T>(url: string): Promise<JsonRead<T>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to read blob: ${res.status}`)
  const data = (await res.json()) as T
  return { data }
}

export async function putJson(key: string, data: unknown) {
  return put(key, JSON.stringify(data, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
}
