export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`API error ${status}`)
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  })

  const contentType = res.headers.get('content-type') || ''
  const raw = await res.text()

  const tryJson = () => {
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return { error: raw }
    }
  }

  const body = contentType.includes('application/json') ? tryJson() : tryJson()

  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}
