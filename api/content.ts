import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'

export const config = { maxDuration: 30 }

const DEFAULT_SITUATIE = {
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

function parseSituatie(raw: unknown) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    res.status(200).json({
      situatie: DEFAULT_SITUATIE,
      filters: [],
    })
    return
  }

  try {
    const sql = neon(databaseUrl)

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
        sort_order INT NOT NULL DEFAULT 100,
        actief BOOLEAN NOT NULL DEFAULT true,
        product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `

    const [tekstRows, filterRows] = await Promise.all([
      sql`SELECT payload FROM site_teksten WHERE id = 'situatie' LIMIT 1`,
      sql`
        SELECT id, label, sort_order, product_ids
        FROM catalogus_filters
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
        sort_order: number
        product_ids: unknown
      }>
    ).map((r) => ({
      id: r.id,
      label: r.label,
      sortOrder: r.sort_order,
      productIds: parseIds(r.product_ids),
    }))

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120')
    res.status(200).json({ situatie, filters })
  } catch (err) {
    console.error('[api/content]', err)
    res.status(200).json({
      situatie: DEFAULT_SITUATIE,
      filters: [],
    })
  }
}
