import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  fetchStatsOverview,
  isAllowedEventType,
  trackAnalyticsEvent,
  type StatsRangeDays,
} from '../shared/analyticsCore'

export const config = { maxDuration: 30 }

function bootstrapPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || 'admin1234'
}
function adminSecret() {
  return process.env.ADMIN_SECRET?.trim() || `sm-admin:${bootstrapPassword()}`
}
function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
function bearerToken(authorization: string | string[] | undefined) {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization
  if (!raw) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m?.[1]?.trim()
}
function requireAuth(req: VercelRequest) {
  const token = bearerToken(req.headers.authorization)
  if (!token) return false
  const parts = token.split('.')
  if (parts.length < 4) return false
  const exp = parts[0]
  const nonce = parts[1]
  const sig = parts[parts.length - 1]
  const username = parts.slice(2, -1).join('.')
  if (!exp || !nonce || !username || !sig) return false
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return false
  const payload = `${exp}.${nonce}.${username}`
  const expected = createHmac('sha256', adminSecret())
    .update(payload)
    .digest('hex')
  return safeEqual(sig, expected)
}

function clientIp(req: VercelRequest): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim()
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0]!.trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    if (req.method === 'GET') {
      if (!requireAuth(req)) {
        res.status(401).json({ error: 'Niet ingelogd' })
        return
      }
      const daysRaw = Number(req.query.days)
      const days = (
        daysRaw === 7 || daysRaw === 90 ? daysRaw : 30
      ) as StatsRangeDays
      const overview = await fetchStatsOverview(days)
      res.status(200).json(overview)
      return
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        eventType?: string
        productId?: string
        productNaam?: string
        montagetype?: string
        kleur?: string
        beslagKleur?: string
        bron?: string
        prijsindicatie?: boolean
        fromCache?: boolean
        isRetry?: boolean
        isMock?: boolean
        errorMessage?: string
        sessionId?: string
        meta?: Record<string, unknown>
      }

      const eventType = String(body.eventType ?? '').trim()
      if (!isAllowedEventType(eventType)) {
        res.status(400).json({ error: 'Ongeldig eventType' })
        return
      }

      // Geen await-blocking voor snelle response? Wel await zodat serverless
      // niet afkapt vóór insert — maar kort houden.
      await trackAnalyticsEvent({
        eventType,
        productId: body.productId,
        productNaam: body.productNaam,
        montagetype: body.montagetype,
        kleur: body.kleur,
        beslagKleur: body.beslagKleur,
        bron: body.bron,
        prijsindicatie: body.prijsindicatie,
        fromCache: body.fromCache,
        isRetry: body.isRetry,
        isMock: body.isMock,
        errorMessage: body.errorMessage,
        sessionId: body.sessionId,
        ip: clientIp(req),
        meta: body.meta,
      })

      res.status(204).end()
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/analytics]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Analytics mislukt',
    })
  }
}
