export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`API error ${status}`)
    this.status = status
    this.body = body
  }
}

type CacheEntry = { at: number; value: unknown }
const getCache = new Map<string, CacheEntry>()
const DEFAULT_GET_TTL_MS = 5_000

function cacheKey(path: string, init?: RequestInit) {
  // Only cache simple GETs without custom headers (besides defaults)
  return `${path}`
}

export async function apiFetch<T>(path: string, init?: RequestInit & { cacheTtlMs?: number; noCache?: boolean }): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase()

  if (method === 'GET' && !init?.noCache) {
    const ttl = init?.cacheTtlMs ?? DEFAULT_GET_TTL_MS
    const key = cacheKey(path, init)
    const cached = getCache.get(key)
    if (cached && Date.now() - cached.at < ttl) return cached.value as T
  }

  const res = await fetch(path, {
    ...init,
    // Keep TCP connections warm (helps a bit on some hosts/browsers)
    keepalive: true,
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

  if ((init?.method || 'GET').toUpperCase() === 'GET' && !init?.noCache) {
    const key = cacheKey(path, init)
    getCache.set(key, { at: Date.now(), value: body })
  }

  return body as T
}
