import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'

type DbProduct = {
  id: string
  naam: string
  afbeelding_url: string
  montagetype: string
  materiaal: string
  collectie: string
  kleuren: unknown
}

function mapProduct(row: DbProduct) {
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

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json({ producten: (rows as DbProduct[]).map(mapProduct) })
  } catch (err) {
    console.error('[api/producten]', err)
    res.status(500).json({ error: 'Producten laden mislukt' })
  }
}
