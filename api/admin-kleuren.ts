import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { createHmac, timingSafeEqual } from 'crypto'

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
  if (parts.length !== 4) return false
  const [exp, nonce, username, sig] = parts
  if (!exp || !nonce || !username || !sig) return false
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return false
  const payload = `${exp}.${nonce}.${username}`
  const expected = createHmac('sha256', adminSecret()).update(payload).digest('hex')
  return safeEqual(sig, expected)
}

function slugify(id: string) {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function mapRow(row: {
  id: string
  naam: string
  categorie: string
  hex: string | null
  staaltje_url: string | null
  actief: boolean
  sort_order: number
}) {
  return {
    id: row.id,
    naam: row.naam,
    categorie: row.categorie,
    hex: row.hex,
    staaltjeUrl: row.staaltje_url,
    actief: row.actief !== false,
    sortOrder: row.sort_order,
  }
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
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, naam, categorie, hex, staaltje_url, actief, sort_order
        FROM kleuren_catalogus
        ORDER BY categorie ASC, sort_order ASC, naam ASC
      `
      res.status(200).json({
        kleuren: (rows as Array<Parameters<typeof mapRow>[0]>).map(mapRow),
      })
      return
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        id?: string
        naam?: string
        categorie?: string
        hex?: string | null
        staaltjeUrl?: string | null
        actief?: boolean
        sortOrder?: number
      }
      const id = slugify(String(body.id || body.naam || ''))
      if (!id || !body.naam?.trim()) {
        res.status(400).json({ error: 'id en naam zijn verplicht' })
        return
      }
      const categorie =
        body.categorie === 'eiken' || body.categorie === 'ral'
          ? body.categorie
          : /eiken|hout/i.test(body.naam)
            ? 'eiken'
            : 'ral'

      if (req.method === 'POST') {
        await sql`
          INSERT INTO kleuren_catalogus (id, naam, categorie, hex, staaltje_url, actief, sort_order, updated_at)
          VALUES (
            ${id},
            ${body.naam.trim()},
            ${categorie},
            ${body.hex ?? null},
            ${body.staaltjeUrl ?? null},
            ${body.actief !== false},
            ${body.sortOrder ?? 100},
            now()
          )
          ON CONFLICT (id) DO UPDATE SET
            naam = EXCLUDED.naam,
            categorie = EXCLUDED.categorie,
            hex = EXCLUDED.hex,
            staaltje_url = EXCLUDED.staaltje_url,
            actief = EXCLUDED.actief,
            sort_order = EXCLUDED.sort_order,
            updated_at = now()
        `
      } else {
        const existing = await sql`
          SELECT id FROM kleuren_catalogus WHERE id = ${id} LIMIT 1
        `
        if ((existing as Array<{ id: string }>).length === 0) {
          res.status(404).json({ error: 'Kleur niet gevonden' })
          return
        }
        await sql`
          UPDATE kleuren_catalogus SET
            naam = ${body.naam.trim()},
            categorie = ${categorie},
            hex = ${body.hex ?? null},
            staaltje_url = ${body.staaltjeUrl ?? null},
            actief = ${body.actief !== false},
            sort_order = ${body.sortOrder ?? 100},
            updated_at = now()
          WHERE id = ${id}
        `
      }

      const rows = await sql`
        SELECT id, naam, categorie, hex, staaltje_url, actief, sort_order
        FROM kleuren_catalogus WHERE id = ${id} LIMIT 1
      `
      res.status(200).json({
        kleur: mapRow((rows as Array<Parameters<typeof mapRow>[0]>)[0]!),
      })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-kleuren]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Kleuren laden mislukt',
    })
  }
}
