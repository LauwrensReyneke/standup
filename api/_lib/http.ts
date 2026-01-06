import type { VercelRequest, VercelResponse } from '@vercel/node'

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status)
  res.setHeader('content-type', 'application/json')
  res.send(JSON.stringify(body))
}

export function badMethod(req: VercelRequest, res: VercelResponse, allowed: string[]) {
  res.setHeader('allow', allowed.join(', '))
  return json(res, 405, { error: `Method ${req.method} not allowed` })
}
