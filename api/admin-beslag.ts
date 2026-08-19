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

function mapBeslag(row: {
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
      const [beslagRows, collectieRows] = await Promise.all([
        sql`
          SELECT id, label, hint, agent_prompt, sort_order, actief
          FROM beslag_defs
          ORDER BY sort_order ASC, label ASC
        `,
        sql`
          SELECT collectie, beslag_id, agent_extra
          FROM collectie_defaults
          ORDER BY collectie ASC
        `,
      ])
      res.status(200).json({
        beslag: (beslagRows as Array<Parameters<typeof mapBeslag>[0]>).map(mapBeslag),
        collectieDefaults: (
          collectieRows as Array<{
            collectie: string
            beslag_id: string | null
            agent_extra: string
          }>
        ).map((r) => ({
          collectie: r.collectie,
          beslagId: r.beslag_id,
          agentExtra: r.agent_extra ?? '',
        })),
      })
      return
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        kind?: 'beslag' | 'collectie'
        id?: string
        collectie?: string
        label?: string
        hint?: string
        agentPrompt?: string
        actief?: boolean
        sortOrder?: number
        beslagId?: string | null
        agentExtra?: string
      }

      if (body.kind === 'collectie') {
        const collectie = body.collectie?.trim()
        if (!collectie) {
          res.status(400).json({ error: 'collectie is verplicht' })
          return
        }
        const existing = await sql`
          SELECT collectie, beslag_id, agent_extra
          FROM collectie_defaults WHERE collectie = ${collectie} LIMIT 1
        `
        const cur = (
          existing as Array<{
            collectie: string
            beslag_id: string | null
            agent_extra: string
          }>
        )[0]
        const beslagId =
          body.beslagId !== undefined ? body.beslagId : (cur?.beslag_id ?? null)
        const agentExtra =
          body.agentExtra !== undefined
            ? body.agentExtra
            : (cur?.agent_extra ?? '')
        await sql`
          INSERT INTO collectie_defaults (collectie, beslag_id, agent_extra, updated_at)
          VALUES (${collectie}, ${beslagId}, ${agentExtra}, now())
          ON CONFLICT (collectie) DO UPDATE SET
            beslag_id = EXCLUDED.beslag_id,
            agent_extra = EXCLUDED.agent_extra,
            updated_at = now()
        `
        res.status(200).json({
          collectieDefault: {
            collectie,
            beslagId,
            agentExtra,
          },
        })
        return
      }

      if (!body.id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }
      const existing = await sql`
        SELECT id, label, hint, agent_prompt, sort_order, actief
        FROM beslag_defs WHERE id = ${body.id} LIMIT 1
      `
      const row = (existing as Array<Parameters<typeof mapBeslag>[0]>)[0]
      if (!row) {
        res.status(404).json({ error: 'Beslag niet gevonden' })
        return
      }
      await sql`
        UPDATE beslag_defs SET
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
        FROM beslag_defs WHERE id = ${body.id} LIMIT 1
      `
      res.status(200).json({
        beslag: mapBeslag((updated as Array<Parameters<typeof mapBeslag>[0]>)[0]!),
      })
      return
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        id?: string
        label?: string
        hint?: string
        agentPrompt?: string
        sortOrder?: number
      }
      const id = (body.id || body.label || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '')
      if (!id || !body.label?.trim()) {
        res.status(400).json({ error: 'id en label zijn verplicht' })
        return
      }
      await sql`
        INSERT INTO beslag_defs (id, label, hint, agent_prompt, sort_order, actief, updated_at)
        VALUES (
          ${id}, ${body.label.trim()}, ${body.hint ?? ''}, ${body.agentPrompt ?? ''},
          ${body.sortOrder ?? 100}, true, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          label = EXCLUDED.label,
          hint = EXCLUDED.hint,
          agent_prompt = EXCLUDED.agent_prompt,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
      `
      const rows = await sql`
        SELECT id, label, hint, agent_prompt, sort_order, actief
        FROM beslag_defs WHERE id = ${id} LIMIT 1
      `
      res.status(200).json({
        beslag: mapBeslag((rows as Array<Parameters<typeof mapBeslag>[0]>)[0]!),
      })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-beslag]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Beslag laden mislukt',
    })
  }
}
