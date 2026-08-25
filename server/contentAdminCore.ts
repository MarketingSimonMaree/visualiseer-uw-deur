import { neon } from '@neondatabase/serverless'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type SituatieTekst = {
  titelGold: string
  titel: string
  lead: string
  tips: string[]
  tipsExtraTitel: string
  tipsExtra: string[]
}

export type CatalogusFilter = {
  id: string
  label: string
  montagetype: string
  sortOrder: number
  actief: boolean
  productIds: string[]
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

export function loadDatabaseUrl(projectRoot: string): string | undefined {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim()
  for (const name of ['.env.local', '.env']) {
    const p = resolve(projectRoot, name)
    if (!existsSync(p)) continue
    const line = readFileSync(p, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='))
    if (line) {
      return line
        .slice('DATABASE_URL='.length)
        .trim()
        .replace(/^["']|["']$/g, '')
    }
  }
  return undefined
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
}): CatalogusFilter {
  return {
    id: row.id,
    label: row.label,
    montagetype: row.montagetype ?? '',
    sortOrder: row.sort_order,
    actief: row.actief !== false,
    productIds: parseIds(row.product_ids),
  }
}

// neon() return type is awkward across versions; keep ensure untyped
async function ensureTables(sql: {
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
}

export async function getPublicContent(projectRoot: string) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) {
    return { situatie: DEFAULT_SITUATIE, filters: [] as CatalogusFilter[] }
  }
  try {
    const sql = neon(databaseUrl)
    await ensureTables(sql)
    const [tekstRows, filterRows] = await Promise.all([
      sql`SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1`,
      sql`
        SELECT id, label, montagetype, sort_order, actief, product_ids
        FROM catalogus_filters
        WHERE actief = true
        ORDER BY sort_order ASC, label ASC
      `,
    ])
    return {
      situatie: parseSituatie(
        (tekstRows as Array<{ payload: unknown }>)[0]?.payload,
      ),
      filters: (
        filterRows as Array<{
          id: string
          label: string
          montagetype: string | null
          sort_order: number
          actief: boolean
          product_ids: unknown
        }>
      ).map((r) => ({
        id: r.id,
        label: r.label,
        montagetype: r.montagetype ?? '',
        sortOrder: r.sort_order,
        productIds: parseIds(r.product_ids),
      })),
    }
  } catch {
    return { situatie: DEFAULT_SITUATIE, filters: [] }
  }
}

export async function getAdminTeksten(projectRoot: string) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(databaseUrl)
  await ensureTables(sql)
  const rows = await sql`
    SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1
  `
  return {
    situatie: parseSituatie(
      (rows as Array<{ payload: unknown }>)[0]?.payload,
    ),
  }
}

export async function saveAdminTeksten(
  projectRoot: string,
  patch: Partial<SituatieTekst>,
) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(databaseUrl)
  await ensureTables(sql)
  const existing = await sql`
    SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1
  `
  const cur = parseSituatie(
    (existing as Array<{ payload: unknown }>)[0]?.payload,
  )
  const next = parseSituatie({ ...cur, ...patch })
  await sql`
    INSERT INTO site_teksten (id, payload, updated_at)
    VALUES ('situatie', ${JSON.stringify(next)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now()
  `
  return { situatie: next }
}

export async function listAdminFilters(projectRoot: string) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(databaseUrl)
  await ensureTables(sql)
  const rows = await sql`
    SELECT id, label, montagetype, sort_order, actief, product_ids
    FROM catalogus_filters
    ORDER BY sort_order ASC, label ASC
  `
  return {
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
  }
}

export async function upsertAdminFilter(
  projectRoot: string,
  body: {
    id?: string
    label?: string
    montagetype?: string
    sortOrder?: number
    actief?: boolean
    productIds?: string[]
  },
  isNew: boolean,
) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(databaseUrl)
  await ensureTables(sql)

  const label = body.label?.trim()
  if (!label) throw Object.assign(new Error('label is verplicht'), { statusCode: 400 })
  const montagetype = body.montagetype?.trim() ?? ''
  if (!montagetype) {
    throw Object.assign(new Error('montagetype is verplicht'), { statusCode: 400 })
  }
  const id = slugify(body.id || `${montagetype}-${label}`)
  if (!id) throw Object.assign(new Error('id is verplicht'), { statusCode: 400 })

  if (isNew) {
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
      throw Object.assign(new Error('Filter niet gevonden'), { statusCode: 404 })
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
  return {
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
  }
}

export async function deleteAdminFilter(projectRoot: string, id: string) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(databaseUrl)
  await ensureTables(sql)
  await sql`DELETE FROM catalogus_filters WHERE id = ${id}`
  return { ok: true as const }
}
