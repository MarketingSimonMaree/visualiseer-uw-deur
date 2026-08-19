import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'

export const config = { maxDuration: 30 }

type DbProduct = {
  id: string
  naam: string
  afbeelding_url: string
  montagetype: string
  montagetypes: unknown
  materiaal: string
  collectie: string
  kleuren: unknown
  kleur_ids: unknown
}

type DbKleur = {
  id: string
  naam: string
  categorie: string
  hex: string | null
  staaltje_url: string | null
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    res.status(500).json({ error: 'DATABASE_URL ontbreekt' })
    return
  }

  try {
    const sql = neon(databaseUrl)
    const montagetype =
      typeof req.query.montagetype === 'string' ? req.query.montagetype : null

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
      (kleurRows as DbKleur[]).map((k) => [
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

    const producten = (rows as DbProduct[])
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
        const ids = kleurIds.length > 0 ? kleurIds : legacy.map((n) => n)
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
          montagetype: (types[0] || row.montagetype) as string,
          montagetypes: types,
          materiaal: row.materiaal,
          collectie: row.collectie,
          kleuren,
        }
      })
      .filter((p) =>
        montagetype ? p.montagetypes.includes(montagetype) : true,
      )

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json({ producten })
  } catch (err) {
    console.error('[api/producten]', err)
    res.status(500).json({ error: 'Producten laden mislukt' })
  }
}
