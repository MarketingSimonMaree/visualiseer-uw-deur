import { neon } from '@neondatabase/serverless'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type ApiProduct = {
  id: string
  naam: string
  afbeeldingUrl: string
  montagetype: string
  materiaal: string
  collectie: string
  kleuren: string[]
}

export type AdminProduct = ApiProduct & {
  paginaUrl: string
  actief: boolean
  updatedAt: string | null
}

export type ProductInput = {
  id: string
  naam: string
  afbeeldingUrl: string
  paginaUrl?: string
  montagetype: string
  materiaal: string
  collectie: string
  kleuren: string[]
  actief?: boolean
}

type DbRow = {
  id: string
  naam: string
  afbeelding_url: string
  pagina_url?: string
  montagetype: string
  materiaal: string
  collectie: string
  kleuren: unknown
  actief?: boolean
  updated_at?: string | Date | null
}

function loadDatabaseUrl(root?: string): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim()
  if (!root) return undefined
  for (const name of ['.env.local', '.env']) {
    const p = resolve(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    const line = text.split('\n').find((l) => l.startsWith('DATABASE_URL='))
    if (!line) continue
    return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

function parseKleuren(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

function mapPublic(row: DbRow): ApiProduct {
  return {
    id: row.id,
    naam: row.naam,
    afbeeldingUrl: row.afbeelding_url,
    montagetype: row.montagetype,
    materiaal: row.materiaal,
    collectie: row.collectie,
    kleuren: parseKleuren(row.kleuren),
  }
}

function mapAdmin(row: DbRow): AdminProduct {
  return {
    ...mapPublic(row),
    paginaUrl: row.pagina_url ?? '',
    actief: row.actief !== false,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

function getSql(projectRoot?: string) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  return neon(databaseUrl)
}

export async function listProducten(
  projectRoot?: string,
  montagetype?: string | null,
): Promise<ApiProduct[]> {
  const sql = getSql(projectRoot)
  const rows = montagetype
    ? await sql`
        SELECT id, naam, afbeelding_url, montagetype, materiaal, collectie, kleuren
        FROM producten
        WHERE actief = true AND montagetype = ${montagetype}
        ORDER BY collectie ASC, naam ASC
      `
    : await sql`
        SELECT id, naam, afbeelding_url, montagetype, materiaal, collectie, kleuren
        FROM producten
        WHERE actief = true
        ORDER BY collectie ASC, naam ASC
      `
  return (rows as DbRow[]).map(mapPublic)
}

export async function listAdminProducten(
  projectRoot?: string,
): Promise<AdminProduct[]> {
  const sql = getSql(projectRoot)
  const rows = await sql`
    SELECT id, naam, afbeelding_url, pagina_url, montagetype, materiaal,
           collectie, kleuren, actief, updated_at
    FROM producten
    ORDER BY actief DESC, collectie ASC, naam ASC
  `
  return (rows as DbRow[]).map(mapAdmin)
}

function slugifyId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function upsertAdminProduct(
  input: ProductInput,
  projectRoot?: string,
): Promise<AdminProduct> {
  const sql = getSql(projectRoot)
  const id = slugifyId(input.id)
  if (!id) throw Object.assign(new Error('Ongeldige product-id'), { statusCode: 400 })
  if (!input.naam?.trim()) {
    throw Object.assign(new Error('Naam is verplicht'), { statusCode: 400 })
  }
  if (!input.afbeeldingUrl?.trim()) {
    throw Object.assign(new Error('Afbeelding-URL is verplicht'), { statusCode: 400 })
  }

  const paginaUrl =
    input.paginaUrl?.trim() ||
    `https://www.simonmaree.nl/producten/${id}/`
  const actief = input.actief !== false
  const kleuren = Array.isArray(input.kleuren) ? input.kleuren : []

  await sql`
    INSERT INTO producten (
      id, naam, afbeelding_url, pagina_url,
      montagetype, materiaal, collectie, kleuren, actief, updated_at
    ) VALUES (
      ${id},
      ${input.naam.trim()},
      ${input.afbeeldingUrl.trim()},
      ${paginaUrl},
      ${input.montagetype},
      ${input.materiaal},
      ${input.collectie.trim() || 'Overig'},
      ${JSON.stringify(kleuren)}::jsonb,
      ${actief},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      naam = EXCLUDED.naam,
      afbeelding_url = EXCLUDED.afbeelding_url,
      pagina_url = EXCLUDED.pagina_url,
      montagetype = EXCLUDED.montagetype,
      materiaal = EXCLUDED.materiaal,
      collectie = EXCLUDED.collectie,
      kleuren = EXCLUDED.kleuren,
      actief = EXCLUDED.actief,
      updated_at = now()
  `

  const rows = await sql`
    SELECT id, naam, afbeelding_url, pagina_url, montagetype, materiaal,
           collectie, kleuren, actief, updated_at
    FROM producten
    WHERE id = ${id}
    LIMIT 1
  `
  return mapAdmin((rows as DbRow[])[0]!)
}

export async function patchAdminProduct(
  id: string,
  patch: Partial<ProductInput> & { actief?: boolean },
  projectRoot?: string,
): Promise<AdminProduct> {
  const sql = getSql(projectRoot)
  const existing = await sql`
    SELECT id, naam, afbeelding_url, pagina_url, montagetype, materiaal,
           collectie, kleuren, actief, updated_at
    FROM producten
    WHERE id = ${id}
    LIMIT 1
  `
  const row = (existing as DbRow[])[0]
  if (!row) {
    throw Object.assign(new Error('Product niet gevonden'), { statusCode: 404 })
  }

  const next: ProductInput = {
    id,
    naam: patch.naam ?? row.naam,
    afbeeldingUrl: patch.afbeeldingUrl ?? row.afbeelding_url,
    paginaUrl: patch.paginaUrl ?? row.pagina_url ?? '',
    montagetype: patch.montagetype ?? row.montagetype,
    materiaal: patch.materiaal ?? row.materiaal,
    collectie: patch.collectie ?? row.collectie,
    kleuren: patch.kleuren ?? parseKleuren(row.kleuren),
    actief: patch.actief ?? row.actief !== false,
  }

  return upsertAdminProduct(next, projectRoot)
}
