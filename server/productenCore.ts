import { neon } from '@neondatabase/serverless'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type ApiKleur = {
  id: string
  naam: string
  categorie: string
  hex: string | null
  staaltjeUrl: string | null
}

export type ApiProduct = {
  id: string
  naam: string
  afbeeldingUrl: string
  montagetype: string
  montagetypes: string[]
  materiaal: string
  collectie: string
  kleuren: ApiKleur[]
}

export type AdminProduct = {
  id: string
  naam: string
  afbeeldingUrl: string
  paginaUrl: string
  montagetype: string
  montagetypes: string[]
  materiaal: string
  collectie: string
  kleuren: string[]
  kleurIds: string[]
  actief: boolean
  updatedAt: string | null
}

export type ProductInput = {
  id: string
  naam: string
  afbeeldingUrl: string
  paginaUrl?: string
  montagetypes: string[]
  materiaal: string
  collectie: string
  kleurIds: string[]
  actief?: boolean
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

function getSql(projectRoot?: string) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  return neon(databaseUrl)
}

function slugifyId(id: string) {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function listProducten(
  projectRoot?: string,
  montagetype?: string | null,
): Promise<ApiProduct[]> {
  const sql = getSql(projectRoot)
  const rows = await sql`
    SELECT id, naam, afbeelding_url, montagetype, montagetypes, materiaal,
           collectie, kleuren, kleur_ids
    FROM producten
    WHERE actief = true
    ORDER BY collectie ASC, naam ASC
  `
  const kleurRows = await sql`
    SELECT id, naam, categorie, hex, staaltje_url
    FROM kleuren_catalogus
    WHERE actief = true
  `
  const kleurMap = new Map(
    (
      kleurRows as Array<{
        id: string
        naam: string
        categorie: string
        hex: string | null
        staaltje_url: string | null
      }>
    ).map((k) => [
      k.id,
      {
        id: k.id,
        naam: k.naam,
        categorie: k.categorie,
        hex: k.hex,
        staaltjeUrl: k.staaltje_url,
      },
    ]),
  )

  return (
    rows as Array<{
      id: string
      naam: string
      afbeelding_url: string
      montagetype: string
      montagetypes: unknown
      materiaal: string
      collectie: string
      kleuren: unknown
      kleur_ids: unknown
    }>
  )
    .map((row) => {
      const montagetypes = parseArray(row.montagetypes)
      const types =
        montagetypes.length > 0
          ? montagetypes
          : row.montagetype
            ? [row.montagetype]
            : []
      const kleurIds = parseArray(row.kleur_ids)
      const legacy = parseArray(row.kleuren)
      const ids = kleurIds.length > 0 ? kleurIds : legacy
      const kleuren = ids.map((id) => {
        const found = kleurMap.get(id)
        if (found) return found
        return {
          id,
          naam: id,
          categorie: /eiken|hout/i.test(id) ? 'eiken' : 'ral',
          hex: null,
          staaltjeUrl: null,
        }
      })
      return {
        id: row.id,
        naam: row.naam,
        afbeeldingUrl: row.afbeelding_url,
        montagetype: types[0] || row.montagetype,
        montagetypes: types,
        materiaal: row.materiaal,
        collectie: row.collectie,
        kleuren,
      }
    })
    .filter((p) => (montagetype ? p.montagetypes.includes(montagetype) : true))
}

function mapAdmin(row: {
  id: string
  naam: string
  afbeelding_url: string
  pagina_url?: string | null
  montagetype: string
  montagetypes: unknown
  materiaal: string
  collectie: string
  kleuren: unknown
  kleur_ids: unknown
  actief?: boolean
  updated_at?: string | Date | null
}): AdminProduct {
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

export async function listAdminProducten(
  projectRoot?: string,
): Promise<AdminProduct[]> {
  const sql = getSql(projectRoot)
  const rows = await sql`
    SELECT id, naam, afbeelding_url, pagina_url, montagetype, montagetypes,
           materiaal, collectie, kleuren, kleur_ids, actief, updated_at
    FROM producten
    ORDER BY actief DESC, collectie ASC, naam ASC
  `
  return (
    rows as Array<Parameters<typeof mapAdmin>[0]>
  ).map(mapAdmin)
}

export async function upsertAdminProduct(
  input: ProductInput,
  projectRoot?: string,
): Promise<AdminProduct> {
  const sql = getSql(projectRoot)
  const id = slugifyId(input.id)
  if (!id) throw Object.assign(new Error('Ongeldige product-id'), { statusCode: 400 })
  const montagetypes = input.montagetypes?.length
    ? input.montagetypes
    : ['deur-bestaand-kozijn']
  const kleurIds = input.kleurIds ?? []
  const paginaUrl =
    input.paginaUrl?.trim() || `https://www.simonmaree.nl/producten/${id}/`
  const actief = input.actief !== false
  const primary = montagetypes[0]!

  await sql`
    INSERT INTO producten (
      id, naam, afbeelding_url, pagina_url,
      montagetype, montagetypes, materiaal, collectie, kleuren, kleur_ids, actief, updated_at
    ) VALUES (
      ${id}, ${input.naam.trim()}, ${input.afbeeldingUrl.trim()}, ${paginaUrl},
      ${primary}, ${JSON.stringify(montagetypes)}::jsonb, ${input.materiaal},
      ${input.collectie.trim() || 'Overig'},
      ${JSON.stringify(kleurIds)}::jsonb, ${JSON.stringify(kleurIds)}::jsonb,
      ${actief}, now()
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
  return mapAdmin((rows as Array<Parameters<typeof mapAdmin>[0]>)[0]!)
}

export async function patchAdminProduct(
  id: string,
  patch: Partial<ProductInput> & { actief?: boolean },
  projectRoot?: string,
): Promise<AdminProduct> {
  const sql = getSql(projectRoot)
  const existing = await sql`
    SELECT id, naam, afbeelding_url, pagina_url, montagetype, montagetypes,
           materiaal, collectie, kleuren, kleur_ids, actief, updated_at
    FROM producten WHERE id = ${id} LIMIT 1
  `
  const row = (existing as Array<Parameters<typeof mapAdmin>[0]>)[0]
  if (!row) {
    throw Object.assign(new Error('Product niet gevonden'), { statusCode: 404 })
  }
  const mapped = mapAdmin(row)
  return upsertAdminProduct(
    {
      id,
      naam: patch.naam ?? mapped.naam,
      afbeeldingUrl: patch.afbeeldingUrl ?? mapped.afbeeldingUrl,
      paginaUrl: patch.paginaUrl ?? mapped.paginaUrl,
      montagetypes: patch.montagetypes ?? mapped.montagetypes,
      materiaal: patch.materiaal ?? mapped.materiaal,
      collectie: patch.collectie ?? mapped.collectie,
      kleurIds: patch.kleurIds ?? mapped.kleurIds,
      actief: patch.actief ?? mapped.actief,
    },
    projectRoot,
  )
}
