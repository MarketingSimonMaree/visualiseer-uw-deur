import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { neon } from '@neondatabase/serverless'

export const config = { maxDuration: 30 }

type MailTemplateId = 'klant' | 'leads'

const MAIL_PLACEHOLDERS = [
  { key: '{{naam}}', beschrijving: 'Naam van de klant' },
  { key: '{{woonplaats}}', beschrijving: 'Woonplaats' },
  { key: '{{email}}', beschrijving: 'E-mailadres van de klant' },
  { key: '{{product}}', beschrijving: 'Gekozen deur / productnaam' },
  { key: '{{kleur}}', beschrijving: 'Gekozen kleur' },
  { key: '{{montagetype}}', beschrijving: 'Gekozen montagetype' },
  { key: '{{prijsindicatie}}', beschrijving: 'ja / nee' },
  { key: '{{bron}}', beschrijving: 'mail of offerte' },
  {
    key: '{{visualiseerUrl}}',
    beschrijving: 'Link terug naar de visualisator',
  },
]

const DEFAULT_MAIL_TEMPLATES: Array<{
  id: MailTemplateId
  label: string
  subject: string
  html: string
}> = [
  {
    id: 'klant',
    label: 'Mail naar de klant',
    subject: 'Uw deurvisualisatie — {{product}}',
    html: [
      '<p>Beste {{naam}},</p>',
      '<p>Hierbij uw visualisatie van <strong>{{product}}</strong> in <strong>{{kleur}}</strong>.</p>',
      '<p>Montagetype: {{montagetype}}.<br/>Woonplaats: {{woonplaats}}.</p>',
      '{{#prijsindicatie}}<p>U heeft aangegeven interesse te hebben in een prijsindicatie. Wij nemen zo snel mogelijk contact met u op.</p>{{/prijsindicatie}}',
      '<p>Klopt de visualisatie niet helemaal? <a href="{{visualiseerUrl}}">Visualiseer opnieuw</a>.</p>',
      '<p>Met vriendelijke groet,<br/>Simon Maree</p>',
    ].join('\n'),
  },
  {
    id: 'leads',
    label: 'Interne lead-mail',
    subject: 'Visualisatie-aanvraag ({{bron}}) — {{naam}} · {{woonplaats}}',
    html: [
      '<p>Nieuwe aanvraag via de deurvisualisator.</p>',
      '<p><strong>Klant</strong><br/>',
      'Naam: {{naam}}<br/>',
      'Woonplaats: {{woonplaats}}<br/>',
      'E-mail: {{email}}</p>',
      '<p><strong>Keuzes</strong><br/>',
      'Product: {{product}}<br/>',
      'Kleur: {{kleur}}<br/>',
      'Montagetype: {{montagetype}}<br/>',
      'Prijsindicatie: {{prijsindicatie}}<br/>',
      'Bron: {{bron}}</p>',
      '<p>Bijlagen: visualisatie + originele kamerfoto van de klant.</p>',
    ].join('\n'),
  },
]

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req)) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }

  try {
    if (req.method === 'GET') {
      const databaseUrl = process.env.DATABASE_URL?.trim()
      let templates = DEFAULT_MAIL_TEMPLATES.map((t) => ({ ...t }))

      if (databaseUrl) {
        const sql = neon(databaseUrl)
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
        // Oude standaard-klantmail bijwerken met "Visualiseer opnieuw" (laat custom teksten met die zin met rust)
        const klantDefault = DEFAULT_MAIL_TEMPLATES.find((t) => t.id === 'klant')!
        await sql`
          UPDATE mail_templates SET
            html = ${klantDefault.html},
            subject = ${klantDefault.subject},
            updated_at = now()
          WHERE id = 'klant'
            AND position('Visualiseer opnieuw' in html) = 0
        `
        const rows = await sql`
          SELECT id, label, subject, html
          FROM mail_templates
          ORDER BY id ASC
        `
        const list = (
          rows as Array<{
            id: string
            label: string
            subject: string
            html: string
          }>
        ).map((r) => ({
          id: r.id as MailTemplateId,
          label: r.label,
          subject: r.subject,
          html: r.html,
        }))
        if (list.length) templates = list
      }

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
      await sql`
        CREATE TABLE IF NOT EXISTS mail_templates (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          subject TEXT NOT NULL,
          html TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
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
