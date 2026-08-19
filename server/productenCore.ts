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

function loadDatabaseUrl(root: string): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim()
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

function mapRow(row: {
  id: string
  naam: string
  afbeelding_url: string
  montagetype: string
  materiaal: string
  collectie: string
  kleuren: unknown
}): ApiProduct {
  const kleuren = Array.isArray(row.kleuren)
    ? row.kleuren.map(String)
    : typeof row.kleuren === 'string'
      ? (JSON.parse(row.kleuren) as string[])
      : []

  return {
    id: row.id,
    naam: row.naam,
    afbeeldingUrl: row.afbeelding_url,
    montagetype: row.montagetype,
    materiaal: row.materiaal,
    collectie: row.collectie,
    kleuren,
  }
}

export async function listProducten(
  projectRoot: string,
  montagetype?: string | null,
): Promise<ApiProduct[]> {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) {
    throw new Error('DATABASE_URL ontbreekt')
  }

  const sql = neon(databaseUrl)
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

  return (rows as Array<Parameters<typeof mapRow>[0]>).map(mapRow)
}
