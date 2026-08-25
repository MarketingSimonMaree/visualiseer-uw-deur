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

function slugify(id: string) {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseIds(value: unknown): string[] {
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

function mapFilter(row: {
  id: string
  label: string
  sort_order: number
  actief: boolean
  product_ids: unknown
}) {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    actief: row.actief !== false,
    productIds: parseIds(row.product_ids),
  }
}

async function ensure(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS catalogus_filters (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 100,
      actief BOOLEAN NOT NULL DEFAULT true,
      product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
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
        SELECT id, label, sort_order, actief, product_ids
        FROM catalogus_filters
        ORDER BY sort_order ASC, label ASC
      `
      res.status(200).json({
        filters: (
          rows as Array<{
            id: string
            label: string
            sort_order: number
            actief: boolean
            product_ids: unknown
          }>
        ).map(mapFilter),
      })
      return
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        id?: string
        label?: string
        sortOrder?: number
        actief?: boolean
        productIds?: string[]
      }
      const label = body.label?.trim()
      if (!label) {
        res.status(400).json({ error: 'label is verplicht' })
        return
      }
      const id = slugify(body.id || label)
      if (!id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }

      if (req.method === 'POST') {
        await sql`
          INSERT INTO catalogus_filters (id, label, sort_order, actief, product_ids, updated_at)
          VALUES (
            ${id}, ${label}, ${body.sortOrder ?? 100}, ${body.actief !== false},
            ${JSON.stringify(body.productIds ?? [])}::jsonb, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            label = EXCLUDED.label,
            sort_order = EXCLUDED.sort_order,
            actief = EXCLUDED.actief,
            product_ids = EXCLUDED.product_ids,
            updated_at = now()
        `
      } else {
        const existing = await sql`
          SELECT id, label, sort_order, actief, product_ids
          FROM catalogus_filters WHERE id = ${id} LIMIT 1
        `
        const cur = (
          existing as Array<{
            id: string
            label: string
            sort_order: number
            actief: boolean
            product_ids: unknown
          }>
        )[0]
        if (!cur) {
          res.status(404).json({ error: 'Filter niet gevonden' })
          return
        }
        const productIds =
          body.productIds !== undefined
            ? body.productIds.map(String)
            : parseIds(cur.product_ids)
        await sql`
          UPDATE catalogus_filters SET
            label = ${label},
            sort_order = ${body.sortOrder ?? cur.sort_order},
            actief = ${body.actief ?? cur.actief},
            product_ids = ${JSON.stringify(productIds)}::jsonb,
            updated_at = now()
          WHERE id = ${id}
        `
      }

      const rows = await sql`
        SELECT id, label, sort_order, actief, product_ids
        FROM catalogus_filters WHERE id = ${id} LIMIT 1
      `
      res.status(200).json({
        filter: mapFilter(
          (
            rows as Array<{
              id: string
              label: string
              sort_order: number
              actief: boolean
              product_ids: unknown
            }>
          )[0]!,
        ),
      })
      return
    }

    if (req.method === 'DELETE') {
      const body = (req.body ?? {}) as { id?: string }
      const id = body.id?.trim()
      if (!id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }
      await sql`DELETE FROM catalogus_filters WHERE id = ${id}`
      res.status(200).json({ ok: true })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-filters]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Filters laden mislukt',
    })
  }
}
