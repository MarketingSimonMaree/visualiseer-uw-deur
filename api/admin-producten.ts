import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { neon } from '@neondatabase/serverless'

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

type DbRow = {
  id: string
  naam: string
  afbeelding_url: string
  pagina_url: string | null
  montagetype: string
  montagetypes: unknown
  materiaal: string
  collectie: string
  kleuren: unknown
  kleur_ids: unknown
  actief: boolean
  updated_at: string | Date | null
}

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

function slugifyId(id: string) {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function mapAdmin(row: DbRow) {
  const montagetypes = parseArray(row.montagetypes)
  const types =
    montagetypes.length > 0
      ? montagetypes
      : row.montagetype
        ? [row.montagetype]
        : []
  const kleurIds = parseArray(row.kleur_ids)
  const legacy = parseArray(row.kleuren)
  return {
    id: row.id,
    naam: row.naam,
    afbeeldingUrl: row.afbeelding_url,
    paginaUrl: row.pagina_url ?? '',
    montagetype: types[0] || row.montagetype,
    montagetypes: types,
    materiaal: row.materiaal,
    collectie: row.collectie,
    kleuren: legacy,
    kleurIds: kleurIds.length > 0 ? kleurIds : legacy,
    actief: row.actief !== false,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req)) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    res.status(500).json({ error: 'DATABASE_URL ontbreekt' })
    return
  }

  const sql = neon(databaseUrl)

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, naam, afbeelding_url, pagina_url, montagetype, montagetypes,
               materiaal, collectie, kleuren, kleur_ids, actief, updated_at
        FROM producten
        ORDER BY actief DESC, collectie ASC, naam ASC
      `
      res.status(200).json({ producten: (rows as DbRow[]).map(mapAdmin) })
      return
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = (typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body ?? {}) as Record<string, unknown>
      const id = slugifyId(String(body.id ?? ''))
      if (!id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }

      if (req.method === 'PATCH') {
        const existing = await sql`
          SELECT id, naam, afbeelding_url, pagina_url, montagetype, montagetypes,
                 materiaal, collectie, kleuren, kleur_ids, actief, updated_at
          FROM producten WHERE id = ${id} LIMIT 1
        `
        const row = (existing as DbRow[])[0]
        if (!row) {
          res.status(404).json({ error: 'Product niet gevonden' })
          return
        }
        const mapped = mapAdmin(row)
        body.naam = body.naam ?? mapped.naam
        body.afbeeldingUrl = body.afbeeldingUrl ?? mapped.afbeeldingUrl
        body.paginaUrl = body.paginaUrl ?? mapped.paginaUrl
        body.montagetypes = body.montagetypes ?? mapped.montagetypes
        body.materiaal = body.materiaal ?? mapped.materiaal
        body.collectie = body.collectie ?? mapped.collectie
        body.kleurIds = body.kleurIds ?? mapped.kleurIds
        body.actief = body.actief ?? mapped.actief
      }

      const naam = String(body.naam ?? '').trim()
      const afbeeldingUrl = String(body.afbeeldingUrl ?? '').trim()
      if (!naam || !afbeeldingUrl) {
        res.status(400).json({ error: 'Naam en afbeelding-URL zijn verplicht' })
        return
      }

      const paginaUrl =
        String(body.paginaUrl ?? '').trim() ||
        `https://www.simonmaree.nl/producten/${id}/`
      const montagetypes = Array.isArray(body.montagetypes)
        ? body.montagetypes.map(String)
        : [String(body.montagetype ?? 'deur-bestaand-kozijn')]
      if (montagetypes.length === 0) {
        res.status(400).json({ error: 'Kies minstens één montagetype' })
        return
      }
      const materiaal = String(body.materiaal ?? 'hout')
      const collectie = String(body.collectie ?? 'Overig').trim() || 'Overig'
      const kleurIds = Array.isArray(body.kleurIds)
        ? body.kleurIds.map(String)
        : Array.isArray(body.kleuren)
          ? body.kleuren.map(String)
          : []
      const actief = body.actief !== false
      const primary = montagetypes[0]!

      await sql`
        INSERT INTO producten (
          id, naam, afbeelding_url, pagina_url,
          montagetype, montagetypes, materiaal, collectie, kleuren, kleur_ids, actief, updated_at
        ) VALUES (
          ${id}, ${naam}, ${afbeeldingUrl}, ${paginaUrl},
          ${primary}, ${JSON.stringify(montagetypes)}::jsonb, ${materiaal}, ${collectie},
          ${JSON.stringify(kleurIds)}::jsonb, ${JSON.stringify(kleurIds)}::jsonb, ${actief}, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          naam = EXCLUDED.naam,
          afbeelding_url = EXCLUDED.afbeelding_url,
          pagina_url = EXCLUDED.pagina_url,
          montagetype = EXCLUDED.montagetype,
          montagetypes = EXCLUDED.montagetypes,
          materiaal = EXCLUDED.materiaal,
          collectie = EXCLUDED.collectie,
          kleuren = EXCLUDED.kleuren,
          kleur_ids = EXCLUDED.kleur_ids,
          actief = EXCLUDED.actief,
          updated_at = now()
      `

      const rows = await sql`
        SELECT id, naam, afbeelding_url, pagina_url, montagetype, montagetypes,
               materiaal, collectie, kleuren, kleur_ids, actief, updated_at
        FROM producten WHERE id = ${id} LIMIT 1
      `
      res.status(200).json({ product: mapAdmin((rows as DbRow[])[0]!) })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-producten]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Beheeractie mislukt',
    })
  }
}
