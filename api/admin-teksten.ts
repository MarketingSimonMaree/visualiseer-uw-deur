import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { createHmac, timingSafeEqual } from 'crypto'

export const config = { maxDuration: 30 }

export type SituatieTekst = {
  titelGold: string
  titel: string
  lead: string
  tips: string[]
  tipsExtraTitel: string
  tipsExtra: string[]
}

export const DEFAULT_SITUATIE: SituatieTekst = {
  titelGold: 'Huidige',
  titel: 'situatie',
  lead:
    'Upload een foto van de deuropening zoals die nu is. Zo ziet u straks precies hoe de nieuwe deur past.',
  tips: [
    'Houd de deur recht en in het midden',
    'Breng de volledige deur en het kozijn in beeld',
    'Zorg voor voldoende ruimte rondom',
  ],
  tipsExtraTitel: 'Let daarnaast op:',
  tipsExtra: [
    'Zorg dat de deur gesloten is',
    'Maak de foto bij voldoende licht en zonder obstakels',
  ],
}

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

function parseSituatie(raw: unknown): SituatieTekst {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const tips = Array.isArray(o.tips)
    ? o.tips.map(String).filter(Boolean)
    : DEFAULT_SITUATIE.tips
  const tipsExtra = Array.isArray(o.tipsExtra)
    ? o.tipsExtra.map(String).filter(Boolean)
    : DEFAULT_SITUATIE.tipsExtra
  return {
    titelGold: String(o.titelGold ?? DEFAULT_SITUATIE.titelGold),
    titel: String(o.titel ?? DEFAULT_SITUATIE.titel),
    lead: String(o.lead ?? DEFAULT_SITUATIE.lead),
    tips: tips.length ? tips : DEFAULT_SITUATIE.tips,
    tipsExtraTitel: String(o.tipsExtraTitel ?? DEFAULT_SITUATIE.tipsExtraTitel),
    tipsExtra: tipsExtra.length ? tipsExtra : DEFAULT_SITUATIE.tipsExtra,
  }
}

async function ensure(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS site_teksten (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    INSERT INTO site_teksten (id, payload, updated_at)
    VALUES ('situatie', ${JSON.stringify(DEFAULT_SITUATIE)}::jsonb, now())
    ON CONFLICT (id) DO NOTHING
  `
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req)) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    res.status(500).json({ error: 'DATABASE_URL ontbreekt' })
    return
  }
  const sql = neon(databaseUrl)

  try {
    await ensure(sql)

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1
      `
      const payload = (rows as Array<{ payload: unknown }>)[0]?.payload
      res.status(200).json({ situatie: parseSituatie(payload) })
      return
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as { situatie?: Partial<SituatieTekst> }
      const existing = await sql`
        SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1
      `
      const cur = parseSituatie(
        (existing as Array<{ payload: unknown }>)[0]?.payload,
      )
      const next = parseSituatie({ ...cur, ...(body.situatie ?? {}) })
      await sql`
        INSERT INTO site_teksten (id, payload, updated_at)
        VALUES ('situatie', ${JSON.stringify(next)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = now()
      `
      res.status(200).json({ situatie: next })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-teksten]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Teksten laden mislukt',
    })
  }
}
