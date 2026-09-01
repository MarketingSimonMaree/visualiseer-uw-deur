import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { createHmac, timingSafeEqual } from 'crypto'

export const config = { maxDuration: 30 }

type SituatieTekst = {
  titelGold: string
  titel: string
  lead: string
  tips: string[]
  tipsExtraTitel: string
  tipsExtra: string[]
}

const DEFAULT_SITUATIE: SituatieTekst = {
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
  const tips = Array.isArray(o.tips) ? o.tips.map(String).filter(Boolean) : []
  const tipsExtra = Array.isArray(o.tipsExtra)
    ? o.tipsExtra.map(String).filter(Boolean)
    : []
  return {
    titelGold: String(o.titelGold ?? DEFAULT_SITUATIE.titelGold),
    titel: String(o.titel ?? DEFAULT_SITUATIE.titel),
    lead: String(o.lead ?? DEFAULT_SITUATIE.lead),
    tips: tips.length ? tips : DEFAULT_SITUATIE.tips,
    tipsExtraTitel: String(o.tipsExtraTitel ?? DEFAULT_SITUATIE.tipsExtraTitel),
    tipsExtra: tipsExtra.length ? tipsExtra : DEFAULT_SITUATIE.tipsExtra,
  }
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

function slugify(id: string) {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function mapFilter(row: {
  id: string
  label: string
  montagetype: string | null
  sort_order: number
  actief: boolean
  product_ids: unknown
}) {
  return {
    id: row.id,
    label: row.label,
    montagetype: row.montagetype ?? '',
    sortOrder: row.sort_order,
    actief: row.actief !== false,
    productIds: parseIds(row.product_ids),
  }
}

async function ensure(sql: {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
}) {
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
  await sql`
    CREATE TABLE IF NOT EXISTS catalogus_filters (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      montagetype TEXT NOT NULL DEFAULT '',
      sort_order INT NOT NULL DEFAULT 100,
      actief BOOLEAN NOT NULL DEFAULT true,
      product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`ALTER TABLE catalogus_filters ADD COLUMN IF NOT EXISTS montagetype TEXT NOT NULL DEFAULT ''`
  await sql`ALTER TABLE montagetype_defs ADD COLUMN IF NOT EXISTS never_lever_handle BOOLEAN NOT NULL DEFAULT false`
  await sql`
    UPDATE montagetype_defs
    SET never_lever_handle = true
    WHERE id IN ('voordeur', 'voordeur-met-kozijn')
  `
  await sql`
    INSERT INTO montagetype_defs (
      id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, updated_at
    ) VALUES
      (
        'tuindeur',
        'Nieuwe tuindeur in bestaand kozijn',
        'Achterdeur / tuindeur in uw bestaande kozijn',
        'Replace only the garden/back door leaf (tuindeur/achterdeur) in the existing exterior frame. Keep the existing frame unchanged. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
        70, true, false, now()
      ),
      (
        'tuindeur-met-kozijn',
        'Nieuwe tuindeur mét nieuw kozijn',
        'Achterdeur / tuindeur inclusief nieuw kozijn',
        'Replace the garden/back door (tuindeur/achterdeur) including a new exterior frame that fits the opening. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
        80, true, false, now()
      )
    ON CONFLICT (id) DO NOTHING
  `
}

function resourceOf(req: VercelRequest): string {
  const q = req.query.resource
  if (typeof q === 'string' && q.trim()) return q.trim().toLowerCase()
  if (Array.isArray(q) && q[0]) return String(q[0]).trim().toLowerCase()
  // Fallback via rewrite / path
  const url = typeof req.url === 'string' ? req.url : ''
  if (url.includes('admin-teksten') || url.includes('teksten')) return 'teksten'
  if (url.includes('admin-filters') || url.includes('filters')) return 'filters'
  return 'content'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const resource = resourceOf(req)
  const databaseUrl = process.env.DATABASE_URL?.trim()

  // Publieke content (geen auth)
  if (resource === 'content') {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }
    if (!databaseUrl) {
      res.status(200).json({ situatie: DEFAULT_SITUATIE, filters: [], montagetypes: [] })
      return
    }
    try {
      const sql = neon(databaseUrl)
      await ensure(sql)
      const [tekstRows, filterRows, montageRows] = await Promise.all([
        sql`SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1`,
        sql`
          SELECT id, label, montagetype, sort_order, product_ids
          FROM catalogus_filters
          WHERE actief = true
          ORDER BY sort_order ASC, label ASC
        `,
        sql`
          SELECT id, label, hint, sort_order, actief, never_lever_handle
          FROM montagetype_defs
          WHERE actief = true
          ORDER BY sort_order ASC, label ASC
        `,
      ])
      const situatie = parseSituatie(
        (tekstRows as Array<{ payload: unknown }>)[0]?.payload,
      )
      const filters = (
        filterRows as Array<{
          id: string
          label: string
          montagetype: string | null
          sort_order: number
          product_ids: unknown
        }>
      ).map((r) => ({
        id: r.id,
        label: r.label,
        montagetype: r.montagetype ?? '',
        sortOrder: r.sort_order,
        productIds: parseIds(r.product_ids),
      }))
      const montagetypes = (
        montageRows as Array<{
          id: string
          label: string
          hint: string
          sort_order: number
          actief: boolean
          never_lever_handle: boolean | null
        }>
      ).map((r) => ({
        id: r.id,
        label: r.label,
        hint: r.hint,
        sortOrder: r.sort_order,
        actief: r.actief !== false,
        neverLeverHandle: Boolean(r.never_lever_handle),
      }))
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120')
      res.status(200).json({ situatie, filters, montagetypes })
    } catch (err) {
      console.error('[api/site content]', err)
      res.status(200).json({ situatie: DEFAULT_SITUATIE, filters: [], montagetypes: [] })
    }
    return
  }

  if (!requireAuth(req)) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }
  if (!databaseUrl) {
    res.status(500).json({ error: 'DATABASE_URL ontbreekt' })
    return
  }

  const sql = neon(databaseUrl)

  try {
    await ensure(sql)

    if (resource === 'teksten') {
      if (req.method === 'GET') {
        const rows = await sql`
          SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1
        `
        res.status(200).json({
          situatie: parseSituatie(
            (rows as Array<{ payload: unknown }>)[0]?.payload,
          ),
        })
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
      return
    }

    if (resource === 'filters') {
      if (req.method === 'GET') {
        const rows = await sql`
          SELECT id, label, montagetype, sort_order, actief, product_ids
          FROM catalogus_filters
          ORDER BY sort_order ASC, label ASC
        `
        res.status(200).json({
          filters: (
            rows as Array<{
              id: string
              label: string
              montagetype: string | null
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
          montagetype?: string
          sortOrder?: number
          actief?: boolean
          productIds?: string[]
        }
        const label = body.label?.trim()
        if (!label) {
          res.status(400).json({ error: 'label is verplicht' })
          return
        }
        const montagetype = body.montagetype?.trim() ?? ''
        const id = slugify(body.id || label)
        if (!id) {
          res.status(400).json({ error: 'id is verplicht' })
          return
        }

        if (req.method === 'POST') {
          await sql`
            INSERT INTO catalogus_filters (id, label, montagetype, sort_order, actief, product_ids, updated_at)
            VALUES (
              ${id}, ${label}, ${montagetype}, ${body.sortOrder ?? 100}, ${body.actief !== false},
              ${JSON.stringify(body.productIds ?? [])}::jsonb, now()
            )
            ON CONFLICT (id) DO UPDATE SET
              label = EXCLUDED.label,
              montagetype = EXCLUDED.montagetype,
              sort_order = EXCLUDED.sort_order,
              actief = EXCLUDED.actief,
              product_ids = EXCLUDED.product_ids,
              updated_at = now()
          `
        } else {
          const existing = await sql`
            SELECT id, label, montagetype, sort_order, actief, product_ids
            FROM catalogus_filters WHERE id = ${id} LIMIT 1
          `
          const cur = (
            existing as Array<{
              id: string
              label: string
              montagetype: string | null
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
              montagetype = ${montagetype || cur.montagetype || ''},
              sort_order = ${body.sortOrder ?? cur.sort_order},
              actief = ${body.actief ?? cur.actief},
              product_ids = ${JSON.stringify(productIds)}::jsonb,
              updated_at = now()
            WHERE id = ${id}
          `
        }

        const rows = await sql`
          SELECT id, label, montagetype, sort_order, actief, product_ids
          FROM catalogus_filters WHERE id = ${id} LIMIT 1
        `
        res.status(200).json({
          filter: mapFilter(
            (
              rows as Array<{
                id: string
                label: string
                montagetype: string | null
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
      return
    }

    res.status(400).json({ error: 'Onbekende resource' })
  } catch (err) {
    console.error('[api/site]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Site-content mislukt',
    })
  }
}
