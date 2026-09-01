import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'
import { createHmac, timingSafeEqual } from 'crypto'

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

function slugify(id: string) {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

type Row = {
  id: string
  label: string
  hint: string
  agent_prompt: string
  sort_order: number
  actief: boolean
  never_lever_handle: boolean | null
  deur_groep: string | null
}

function inferGroep(id: string): 'binnen' | 'buiten' {
  const key = id.toLowerCase()
  if (
    key.startsWith('voordeur') ||
    key.startsWith('tuindeur') ||
    key.startsWith('achterdeur') ||
    key.includes('buiten')
  ) {
    return 'buiten'
  }
  return 'binnen'
}

function mapRow(row: Row) {
  const deurGroep =
    row.deur_groep === 'buiten' || row.deur_groep === 'binnen'
      ? row.deur_groep
      : inferGroep(row.id)
  return {
    id: row.id,
    label: row.label,
    hint: row.hint,
    agentPrompt: row.agent_prompt,
    sortOrder: row.sort_order,
    actief: row.actief !== false,
    neverLeverHandle: Boolean(row.never_lever_handle),
    deurGroep,
  }
}

const SEED = [
  {
    id: 'tuindeur',
    label: 'Nieuwe tuindeur in bestaand kozijn',
    hint: 'Achterdeur / tuindeur in uw bestaande kozijn',
    agent_prompt:
      'Replace only the garden/back door leaf (tuindeur/achterdeur) in the existing exterior frame. Keep the existing frame unchanged. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
    sort_order: 70,
    never_lever_handle: false,
  },
  {
    id: 'tuindeur-met-kozijn',
    label: 'Nieuwe tuindeur mét nieuw kozijn',
    hint: 'Achterdeur / tuindeur inclusief nieuw kozijn',
    agent_prompt:
      'Replace the garden/back door (tuindeur/achterdeur) including a new exterior frame that fits the opening. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
    sort_order: 80,
    never_lever_handle: false,
  },
]

async function ensure(sql: {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
}) {
  await sql`ALTER TABLE montagetype_defs ADD COLUMN IF NOT EXISTS never_lever_handle BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE montagetype_defs ADD COLUMN IF NOT EXISTS deur_groep TEXT NOT NULL DEFAULT 'binnen'`
  await sql`
    UPDATE montagetype_defs
    SET never_lever_handle = true
    WHERE id IN ('voordeur', 'voordeur-met-kozijn')
  `
  await sql`
    UPDATE montagetype_defs
    SET deur_groep = 'buiten'
    WHERE id IN ('voordeur', 'voordeur-met-kozijn', 'tuindeur', 'tuindeur-met-kozijn')
  `
  for (const s of SEED) {
    await sql`
      INSERT INTO montagetype_defs (
        id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, deur_groep, updated_at
      ) VALUES (
        ${s.id}, ${s.label}, ${s.hint}, ${s.agent_prompt}, ${s.sort_order},
        true, ${s.never_lever_handle}, 'buiten', now()
      )
      ON CONFLICT (id) DO NOTHING
    `
  }
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
    await ensure(sql)

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, deur_groep
        FROM montagetype_defs
        ORDER BY sort_order ASC, label ASC
      `
      res.status(200).json({
        montagetypes: (rows as Row[]).map(mapRow),
      })
      return
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        id?: string
        label?: string
        hint?: string
        agentPrompt?: string
        actief?: boolean
        sortOrder?: number
        neverLeverHandle?: boolean
        deurGroep?: 'binnen' | 'buiten'
      }
      const label = body.label?.trim()
      if (!label) {
        res.status(400).json({ error: 'label is verplicht' })
        return
      }
      const id = slugify(body.id || label)
      if (!id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }
      const deurGroep =
        body.deurGroep === 'buiten' || body.deurGroep === 'binnen'
          ? body.deurGroep
          : inferGroep(id)

      if (req.method === 'POST') {
        await sql`
          INSERT INTO montagetype_defs (
            id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, deur_groep, updated_at
          ) VALUES (
            ${id}, ${label}, ${body.hint ?? ''}, ${body.agentPrompt ?? ''},
            ${body.sortOrder ?? 100}, ${body.actief !== false},
            ${Boolean(body.neverLeverHandle)}, ${deurGroep}, now()
          )
          ON CONFLICT (id) DO UPDATE SET
            label = EXCLUDED.label,
            hint = EXCLUDED.hint,
            agent_prompt = EXCLUDED.agent_prompt,
            sort_order = EXCLUDED.sort_order,
            actief = EXCLUDED.actief,
            never_lever_handle = EXCLUDED.never_lever_handle,
            deur_groep = EXCLUDED.deur_groep,
            updated_at = now()
        `
      } else {
        const existing = await sql`
          SELECT id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, deur_groep
          FROM montagetype_defs WHERE id = ${id} LIMIT 1
        `
        const row = (existing as Row[])[0]
        if (!row) {
          res.status(404).json({ error: 'Montagetype niet gevonden' })
          return
        }
        const nextGroep =
          body.deurGroep === 'buiten' || body.deurGroep === 'binnen'
            ? body.deurGroep
            : row.deur_groep === 'buiten' || row.deur_groep === 'binnen'
              ? row.deur_groep
              : inferGroep(id)
        await sql`
          UPDATE montagetype_defs SET
            label = ${body.label ?? row.label},
            hint = ${body.hint ?? row.hint},
            agent_prompt = ${body.agentPrompt ?? row.agent_prompt},
            actief = ${body.actief ?? row.actief},
            sort_order = ${body.sortOrder ?? row.sort_order},
            never_lever_handle = ${
              body.neverLeverHandle !== undefined
                ? Boolean(body.neverLeverHandle)
                : Boolean(row.never_lever_handle)
            },
            deur_groep = ${nextGroep},
            updated_at = now()
          WHERE id = ${id}
        `
      }

      const updated = await sql`
        SELECT id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, deur_groep
        FROM montagetype_defs WHERE id = ${id} LIMIT 1
      `
      res.status(200).json({
        montagetype: mapRow((updated as Row[])[0]!),
      })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-montagetypes]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Montagetypes laden mislukt',
    })
  }
}
