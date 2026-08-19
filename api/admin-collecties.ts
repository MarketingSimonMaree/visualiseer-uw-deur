import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { neon } from '@neondatabase/serverless'

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
  if (parts.length !== 4) return false
  const [exp, nonce, username, sig] = parts
  if (!exp || !nonce || !username || !sig) return false
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return false
  const payload = `${exp}.${nonce}.${username}`
  const expected = createHmac('sha256', adminSecret())
    .update(payload)
    .digest('hex')
  return safeEqual(sig, expected)
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

type CollectieRow = {
  collectie: string
  beslag_id: string | null
  agent_extra: string
  montagetypes: unknown
  kleur_ids: unknown
}

function mapCollectie(row: CollectieRow) {
  return {
    collectie: row.collectie,
    beslagId: row.beslag_id,
    agentExtra: row.agent_extra ?? '',
    montagetypes: parseArray(row.montagetypes),
    kleurIds: parseArray(row.kleur_ids),
  }
}

async function ensureSchema(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS collectie_defaults (
      collectie TEXT PRIMARY KEY,
      beslag_id TEXT,
      agent_extra TEXT NOT NULL DEFAULT '',
      montagetypes JSONB NOT NULL DEFAULT '[]'::jsonb,
      kleur_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`ALTER TABLE collectie_defaults ADD COLUMN IF NOT EXISTS montagetypes JSONB NOT NULL DEFAULT '[]'::jsonb`
  await sql`ALTER TABLE collectie_defaults ADD COLUMN IF NOT EXISTS kleur_ids JSONB NOT NULL DEFAULT '[]'::jsonb`
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
    await ensureSchema(sql)

    if (req.method === 'GET') {
      // Sync collecties uit producten
      const productCollecties = await sql`
        SELECT DISTINCT collectie FROM producten
        WHERE collectie IS NOT NULL AND trim(collectie) <> ''
      `
      for (const row of productCollecties as Array<{ collectie: string }>) {
        const name = row.collectie.trim()
        if (!name) continue
        await sql`
          INSERT INTO collectie_defaults (collectie, beslag_id, agent_extra, montagetypes, kleur_ids, updated_at)
          VALUES (${name}, NULL, '', '[]'::jsonb, '[]'::jsonb, now())
          ON CONFLICT (collectie) DO NOTHING
        `
      }

      const rows = await sql`
        SELECT collectie, beslag_id, agent_extra, montagetypes, kleur_ids
        FROM collectie_defaults
        ORDER BY collectie ASC
      `
      res.status(200).json({
        collecties: (rows as CollectieRow[]).map(mapCollectie),
      })
      return
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        collectie?: string
        beslagId?: string | null
        agentExtra?: string
        montagetypes?: string[]
        kleurIds?: string[]
        applyToProducts?: boolean
      }
      const collectie = body.collectie?.trim()
      if (!collectie) {
        res.status(400).json({ error: 'collectie is verplicht' })
        return
      }

      const existing = await sql`
        SELECT collectie, beslag_id, agent_extra, montagetypes, kleur_ids
        FROM collectie_defaults WHERE collectie = ${collectie} LIMIT 1
      `
      const cur = (existing as CollectieRow[])[0]
      const beslagId =
        body.beslagId !== undefined ? body.beslagId : (cur?.beslag_id ?? null)
      const agentExtra =
        body.agentExtra !== undefined
          ? body.agentExtra
          : (cur?.agent_extra ?? '')
      const montagetypes =
        body.montagetypes !== undefined
          ? body.montagetypes.map(String)
          : parseArray(cur?.montagetypes)
      const kleurIds =
        body.kleurIds !== undefined
          ? body.kleurIds.map(String)
          : parseArray(cur?.kleur_ids)

      await sql`
        INSERT INTO collectie_defaults (
          collectie, beslag_id, agent_extra, montagetypes, kleur_ids, updated_at
        ) VALUES (
          ${collectie}, ${beslagId}, ${agentExtra},
          ${JSON.stringify(montagetypes)}::jsonb,
          ${JSON.stringify(kleurIds)}::jsonb,
          now()
        )
        ON CONFLICT (collectie) DO UPDATE SET
          beslag_id = EXCLUDED.beslag_id,
          agent_extra = EXCLUDED.agent_extra,
          montagetypes = EXCLUDED.montagetypes,
          kleur_ids = EXCLUDED.kleur_ids,
          updated_at = now()
      `

      let productsUpdated = 0
      if (body.applyToProducts) {
        const primary = montagetypes[0] ?? null
        const productRows = await sql`
          SELECT id, montagetypes, kleur_ids, beslag_id, agent_extra, montagetype
          FROM producten WHERE collectie = ${collectie}
        `
        for (const p of productRows as Array<{
          id: string
          montagetypes: unknown
          kleur_ids: unknown
          beslag_id: string | null
          agent_extra: string | null
          montagetype: string
        }>) {
          const nextTypes =
            montagetypes.length > 0 ? montagetypes : parseArray(p.montagetypes)
          const nextPrimary = nextTypes[0] ?? p.montagetype
          const nextKleuren =
            kleurIds.length > 0 ? kleurIds : parseArray(p.kleur_ids)
          const nextBeslag = beslagId ?? p.beslag_id
          const nextExtra =
            agentExtra.trim() !== '' ? agentExtra : (p.agent_extra ?? '')
          await sql`
            UPDATE producten SET
              montagetypes = ${JSON.stringify(nextTypes)}::jsonb,
              montagetype = ${nextPrimary},
              kleur_ids = ${JSON.stringify(nextKleuren)}::jsonb,
              beslag_id = ${nextBeslag},
              agent_extra = ${nextExtra},
              updated_at = now()
            WHERE id = ${p.id}
          `
          productsUpdated += 1
        }
      }

      res.status(200).json({
        collectie: mapCollectie({
          collectie,
          beslag_id: beslagId,
          agent_extra: agentExtra,
          montagetypes,
          kleur_ids: kleurIds,
        }),
        productsUpdated,
      })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-collecties]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Collecties laden mislukt',
    })
  }
}
