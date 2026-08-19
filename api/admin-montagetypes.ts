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
  if (parts.length !== 4) return false
  const [exp, nonce, username, sig] = parts
  if (!exp || !nonce || !username || !sig) return false
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return false
  const payload = `${exp}.${nonce}.${username}`
  const expected = createHmac('sha256', adminSecret()).update(payload).digest('hex')
  return safeEqual(sig, expected)
}

function mapRow(row: {
  id: string
  label: string
  hint: string
  agent_prompt: string
  sort_order: number
  actief: boolean
}) {
  return {
    id: row.id,
    label: row.label,
    hint: row.hint,
    agentPrompt: row.agent_prompt,
    sortOrder: row.sort_order,
    actief: row.actief !== false,
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
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, label, hint, agent_prompt, sort_order, actief
        FROM montagetype_defs
        ORDER BY sort_order ASC, label ASC
      `
      res.status(200).json({
        montagetypes: (rows as Array<Parameters<typeof mapRow>[0]>).map(mapRow),
      })
      return
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        id?: string
        label?: string
        hint?: string
        agentPrompt?: string
        actief?: boolean
        sortOrder?: number
      }
      if (!body.id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }
      const existing = await sql`
        SELECT id, label, hint, agent_prompt, sort_order, actief
        FROM montagetype_defs WHERE id = ${body.id} LIMIT 1
      `
      const row = (existing as Array<Parameters<typeof mapRow>[0]>)[0]
      if (!row) {
        res.status(404).json({ error: 'Montagetype niet gevonden' })
        return
      }
      await sql`
        UPDATE montagetype_defs SET
          label = ${body.label ?? row.label},
          hint = ${body.hint ?? row.hint},
          agent_prompt = ${body.agentPrompt ?? row.agent_prompt},
          actief = ${body.actief ?? row.actief},
          sort_order = ${body.sortOrder ?? row.sort_order},
          updated_at = now()
        WHERE id = ${body.id}
      `
      const updated = await sql`
        SELECT id, label, hint, agent_prompt, sort_order, actief
        FROM montagetype_defs WHERE id = ${body.id} LIMIT 1
      `
      res.status(200).json({
        montagetype: mapRow((updated as Array<Parameters<typeof mapRow>[0]>)[0]!),
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
