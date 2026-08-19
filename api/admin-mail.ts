import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { neon } from '@neondatabase/serverless'
import {
  DEFAULT_MAIL_TEMPLATES,
  MAIL_PLACEHOLDERS,
  type MailTemplate,
  type MailTemplateId,
} from '../shared/mailTemplates'

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
/** Token = exp.nonce.username.sig — username mag géén punten bevatten in oude tokens. */
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

async function ensureMailTemplates(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS mail_templates (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  for (const t of DEFAULT_MAIL_TEMPLATES) {
    await sql`
      INSERT INTO mail_templates (id, label, subject, html, updated_at)
      VALUES (${t.id}, ${t.label}, ${t.subject}, ${t.html}, now())
      ON CONFLICT (id) DO NOTHING
    `
  }
}

async function loadMailTemplates(): Promise<MailTemplate[]> {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) return DEFAULT_MAIL_TEMPLATES.map((t) => ({ ...t }))

  const sql = neon(databaseUrl)
  await ensureMailTemplates(sql)
  const rows = await sql`
    SELECT id, label, subject, html
    FROM mail_templates
    ORDER BY id ASC
  `
  const list = (
    rows as Array<{ id: string; label: string; subject: string; html: string }>
  ).map((r) => ({
    id: r.id as MailTemplateId,
    label: r.label,
    subject: r.subject,
    html: r.html,
  }))
  return list.length ? list : DEFAULT_MAIL_TEMPLATES.map((t) => ({ ...t }))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req)) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }

  try {
    if (req.method === 'GET') {
      const templates = await loadMailTemplates()
      res.status(200).json({
        templates,
        placeholders: MAIL_PLACEHOLDERS,
        bijlagen: {
          klant: ['visualisatie (resultaatbeeld)'],
          leads: [
            'visualisatie (resultaatbeeld)',
            'originele kamerfoto van de klant',
          ],
        },
        velden: [
          'naam',
          'woonplaats',
          'e-mailadres',
          'product',
          'kleur',
          'montagetype',
          'prijsindicatie (ja/nee)',
          'bron (mail of offerte)',
        ],
        privacy:
          'Klantgegevens worden niet bewaard in de database; ze gaan alleen mee in de verstuurde e-mails.',
      })
      return
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as {
        id?: MailTemplateId
        label?: string
        subject?: string
        html?: string
      }
      if (body.id !== 'klant' && body.id !== 'leads') {
        res.status(400).json({ error: 'id moet klant of leads zijn' })
        return
      }
      const databaseUrl = process.env.DATABASE_URL?.trim()
      if (!databaseUrl) {
        res.status(500).json({ error: 'DATABASE_URL ontbreekt' })
        return
      }
      const defaults = DEFAULT_MAIL_TEMPLATES.find((t) => t.id === body.id)!
      const sql = neon(databaseUrl)
      await ensureMailTemplates(sql)
      const existing = await sql`
        SELECT id, label, subject, html FROM mail_templates WHERE id = ${body.id} LIMIT 1
      `
      const cur = (
        existing as Array<{
          label: string
          subject: string
          html: string
        }>
      )[0]
      const label = body.label ?? cur?.label ?? defaults.label
      const subject = body.subject ?? cur?.subject ?? defaults.subject
      const html = body.html ?? cur?.html ?? defaults.html
      await sql`
        INSERT INTO mail_templates (id, label, subject, html, updated_at)
        VALUES (${body.id}, ${label}, ${subject}, ${html}, now())
        ON CONFLICT (id) DO UPDATE SET
          label = EXCLUDED.label,
          subject = EXCLUDED.subject,
          html = EXCLUDED.html,
          updated_at = now()
      `
      res.status(200).json({
        template: { id: body.id, label, subject, html },
      })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin-mail]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Mail-templates laden mislukt',
    })
  }
}
