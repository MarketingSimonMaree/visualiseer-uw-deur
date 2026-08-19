import { neon } from '@neondatabase/serverless'
import {
  applyMailTemplate,
  DEFAULT_MAIL_TEMPLATES,
  type MailTemplate,
  type MailTemplateId,
  type TemplateVars,
} from './mailTemplates.ts'

export type MailAttachment = {
  filename: string
  mimeType: string
  base64: string
}

export type MailResultaatInput = {
  naam: string
  woonplaats: string
  email: string
  prijsindicatie: boolean
  bron: 'mail' | 'offerte'
  productId?: string
  productNaam: string
  kleur: string
  montagetype?: string
  /** Visualisatie-resultaat */
  imageBase64: string
  mimeType?: string
  /** Originele kamerfoto van de klant */
  roomImageBase64?: string
  roomMimeType?: string
}

export type MailResultaatOutput = {
  ok: true
  emailed: boolean
  leadsEmailed: boolean
}

function stripDataUrl(raw: string): { base64: string; mime: string } {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(raw)
  if (m) return { mime: m[1]!, base64: m[2]! }
  return { mime: 'image/png', base64: raw }
}

function extForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  return 'png'
}

async function ensureMailTemplates(sql: {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
}) {
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

export async function loadMailTemplates(): Promise<MailTemplate[]> {
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

export async function saveMailTemplate(
  input: Partial<MailTemplate> & { id: MailTemplateId },
): Promise<MailTemplate> {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')

  const defaults = DEFAULT_MAIL_TEMPLATES.find((t) => t.id === input.id)
  if (!defaults) throw new Error('Onbekend template')

  const sql = neon(databaseUrl)
  await ensureMailTemplates(sql)
  const existing = await sql`
    SELECT id, label, subject, html FROM mail_templates WHERE id = ${input.id} LIMIT 1
  `
  const cur = (
    existing as Array<{
      id: string
      label: string
      subject: string
      html: string
    }>
  )[0]

  const label = input.label ?? cur?.label ?? defaults.label
  const subject = input.subject ?? cur?.subject ?? defaults.subject
  const html = input.html ?? cur?.html ?? defaults.html

  await sql`
    INSERT INTO mail_templates (id, label, subject, html, updated_at)
    VALUES (${input.id}, ${label}, ${subject}, ${html}, now())
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      subject = EXCLUDED.subject,
      html = EXCLUDED.html,
      updated_at = now()
  `

  return { id: input.id, label, subject, html }
}

async function sendWithMailjet(opts: {
  to: string
  subject: string
  html: string
  attachments: MailAttachment[]
}): Promise<boolean> {
  const apiKey = process.env.MAILJET_API_KEY?.trim()
  const apiSecret = process.env.MAILJET_API_SECRET?.trim()
  const fromRaw = process.env.MAIL_FROM?.trim()
  if (!apiKey || !apiSecret || !fromRaw) return false

  const fromMatch = /^(.+?)\s*<([^>]+)>$/.exec(fromRaw)
  const fromEmail = (fromMatch?.[2] ?? fromRaw).trim()
  const fromName = (fromMatch?.[1] ?? 'Simon Maree')
    .trim()
    .replace(/^["']|["']$/g, '')

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: fromEmail, Name: fromName },
          To: [{ Email: opts.to }],
          Subject: opts.subject,
          HTMLPart: opts.html,
          Attachments: opts.attachments.map((a) => ({
            ContentType: a.mimeType,
            Filename: a.filename,
            Base64Content: a.base64,
          })),
        },
      ],
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[mailjet]', res.status, detail.slice(0, 400))
    return false
  }

  try {
    const data = (await res.json()) as {
      Messages?: Array<{ Status?: string }>
    }
    return data.Messages?.[0]?.Status === 'success'
  } catch {
    return true
  }
}

function pickTemplate(
  templates: MailTemplate[],
  id: MailTemplateId,
): MailTemplate {
  return (
    templates.find((t) => t.id === id) ??
    DEFAULT_MAIL_TEMPLATES.find((t) => t.id === id)!
  )
}

/**
 * Verstuurt klant- en/of lead-mail. Slaat géén klantgegevens op in de database.
 */
export async function processMailResultaat(
  body: MailResultaatInput,
): Promise<MailResultaatOutput> {
  const naam = body.naam.trim()
  const woonplaats = body.woonplaats.trim()
  const email = body.email.trim().toLowerCase()

  if (!naam) throw new Error('Naam is verplicht.')
  if (!woonplaats) throw new Error('Woonplaats is verplicht.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Ongeldig e-mailadres.')
  }
  if (!body.imageBase64 || !body.productNaam || !body.kleur) {
    throw new Error('Ontbrekende velden.')
  }

  const result = stripDataUrl(body.imageBase64)
  const resultMime = body.mimeType || result.mime
  const resultExt = extForMime(resultMime)

  const room = body.roomImageBase64
    ? stripDataUrl(body.roomImageBase64)
    : null
  const roomMime = body.roomMimeType || room?.mime || 'image/jpeg'
  const roomExt = extForMime(roomMime)

  const templates = await loadMailTemplates()
  const vars: TemplateVars = {
    naam,
    woonplaats,
    email,
    product: body.productNaam,
    kleur: body.kleur,
    montagetype: body.montagetype?.trim() || '—',
    prijsindicatie: Boolean(body.prijsindicatie),
    bron: body.bron,
    visualiseerUrl:
      process.env.VISUALISEER_URL?.trim() ||
      'https://www.simonmaree.nl/visualiseer-uw-deur/',
  }

  const resultAttachment: MailAttachment = {
    filename: `visualisatie.${resultExt}`,
    mimeType: resultMime,
    base64: result.base64,
  }
  const roomAttachment: MailAttachment | null = room
    ? {
        filename: `originele-kamerfoto.${roomExt}`,
        mimeType: roomMime,
        base64: room.base64,
      }
    : null

  let emailed = false
  let leadsEmailed = false

  // Klantmail: bij "mail"-pad altijd; bij offerte optioneel (bevestiging)
  if (body.bron === 'mail' || body.prijsindicatie) {
    const klantTpl = pickTemplate(templates, 'klant')
    emailed = await sendWithMailjet({
      to: email,
      subject: applyMailTemplate(klantTpl.subject, vars),
      html: applyMailTemplate(klantTpl.html, vars),
      attachments: [resultAttachment],
    })
  }

  const leadsEmail = process.env.LEADS_EMAIL?.trim()
  if (leadsEmail) {
    const leadsTpl = pickTemplate(templates, 'leads')
    const attachments = [resultAttachment]
    if (roomAttachment) attachments.push(roomAttachment)
    leadsEmailed = await sendWithMailjet({
      to: leadsEmail,
      subject: applyMailTemplate(leadsTpl.subject, vars),
      html: applyMailTemplate(leadsTpl.html, vars),
      attachments,
    })
  }

  // Geen PII in de database — alleen mails verstuurd.
  return { ok: true, emailed, leadsEmailed }
}
