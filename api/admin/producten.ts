import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import {
  bearerToken,
  loadAdminSecret,
  verifyAdminToken,
} from '../_lib/adminAuth'

type DbRow = {
  id: string
  naam: string
  afbeelding_url: string
  pagina_url: string | null
  montagetype: string
  materiaal: string
  collectie: string
  kleuren: unknown
  actief: boolean
  updated_at: string | Date | null
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

function mapAdmin(row: DbRow) {
  return {
    id: row.id,
    naam: row.naam,
    afbeeldingUrl: row.afbeelding_url,
    paginaUrl: row.pagina_url ?? '',
    montagetype: row.montagetype,
    materiaal: row.materiaal,
    collectie: row.collectie,
    kleuren: parseKleuren(row.kleuren),
    actief: row.actief !== false,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

function requireAuth(req: VercelRequest): boolean {
  return Boolean(
    verifyAdminToken(bearerToken(req.headers.authorization), loadAdminSecret()),
  )
}

function slugifyId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
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
        SELECT id, naam, afbeelding_url, pagina_url, montagetype, materiaal,
               collectie, kleuren, actief, updated_at
        FROM producten
        ORDER BY actief DESC, collectie ASC, naam ASC
      `
      res.status(200).json({ producten: (rows as DbRow[]).map(mapAdmin) })
      return
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = (req.body ?? {}) as Record<string, unknown>
      const id = slugifyId(String(body.id ?? ''))
      if (!id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }

      if (req.method === 'PATCH') {
        const existing = await sql`
          SELECT id, naam, afbeelding_url, pagina_url, montagetype, materiaal,
                 collectie, kleuren, actief, updated_at
          FROM producten WHERE id = ${id} LIMIT 1
        `
        const row = (existing as DbRow[])[0]
        if (!row) {
          res.status(404).json({ error: 'Product niet gevonden' })
          return
        }
        body.naam = body.naam ?? row.naam
        body.afbeeldingUrl = body.afbeeldingUrl ?? row.afbeelding_url
        body.paginaUrl = body.paginaUrl ?? row.pagina_url ?? ''
        body.montagetype = body.montagetype ?? row.montagetype
        body.materiaal = body.materiaal ?? row.materiaal
        body.collectie = body.collectie ?? row.collectie
        body.kleuren = body.kleuren ?? parseKleuren(row.kleuren)
        body.actief = body.actief ?? row.actief !== false
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
      const montagetype = String(body.montagetype ?? 'deur-bestaand-kozijn')
      const materiaal = String(body.materiaal ?? 'hout')
      const collectie = String(body.collectie ?? 'Overig').trim() || 'Overig'
      const kleuren = Array.isArray(body.kleuren)
        ? body.kleuren.map(String)
        : []
      const actief = body.actief !== false

      await sql`
        INSERT INTO producten (
          id, naam, afbeelding_url, pagina_url,
          montagetype, materiaal, collectie, kleuren, actief, updated_at
        ) VALUES (
          ${id}, ${naam}, ${afbeeldingUrl}, ${paginaUrl},
          ${montagetype}, ${materiaal}, ${collectie},
          ${JSON.stringify(kleuren)}::jsonb, ${actief}, now()
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
        FROM producten WHERE id = ${id} LIMIT 1
      `
      res.status(200).json({ product: mapAdmin((rows as DbRow[])[0]!) })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin/producten]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Beheeractie mislukt',
    })
  }
}
