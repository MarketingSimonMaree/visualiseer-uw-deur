import type { VercelRequest, VercelResponse } from '@vercel/node'
import { neon } from '@neondatabase/serverless'

export const config = { maxDuration: 60 }

type TemplateVars = {
  naam: string
  woonplaats: string
  email: string
  product: string
  kleur: string
  montagetype: string
  prijsindicatie: boolean
  bron: 'mail' | 'offerte'
  visualiseerUrl: string
}

const DEFAULT_TEMPLATES = {
  klant: {
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
  leads: {
    subject: 'Visualisatie-aanvraag ({{bron}}) — {{naam}} · {{woonplaats}}',
    html: [
      '<p>Nieuwe aanvraag via de deurvisualisator.</p>',
      '<p><strong>Klant</strong><br/>Naam: {{naam}}<br/>Woonplaats: {{woonplaats}}<br/>E-mail: {{email}}</p>',
      '<p><strong>Keuzes</strong><br/>Product: {{product}}<br/>Kleur: {{kleur}}<br/>Montagetype: {{montagetype}}<br/>Prijsindicatie: {{prijsindicatie}}<br/>Bron: {{bron}}</p>',
      '<p>Bijlagen: visualisatie + originele kamerfoto van de klant.</p>',
    ].join('\n'),
  },
}

function applyTemplate(template: string, vars: TemplateVars): string {
  let out = template
  out = out.replace(
    /\{\{#prijsindicatie\}\}([\s\S]*?)\{\{\/prijsindicatie\}\}/g,
    (_, block: string) => (vars.prijsindicatie ? block : ''),
  )
  const map: Record<string, string> = {
    '{{naam}}': vars.naam,
    '{{woonplaats}}': vars.woonplaats,
    '{{email}}': vars.email,
    '{{product}}': vars.product,
    '{{kleur}}': vars.kleur,
    '{{montagetype}}': vars.montagetype,
    '{{prijsindicatie}}': vars.prijsindicatie ? 'ja' : 'nee',
    '{{bron}}': vars.bron,
    '{{visualiseerUrl}}': vars.visualiseerUrl,
  }
  for (const [key, value] of Object.entries(map)) {
    out = out.split(key).join(value)
  }
  return out
}

function visualiseerUrl(): string {
  return (
    process.env.VISUALISEER_URL?.trim() ||
    'https://www.simonmaree.nl/visualiseer-uw-deur/'
  )
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

async function loadTemplate(
  id: 'klant' | 'leads',
): Promise<{ subject: string; html: string }> {
  const fallback = DEFAULT_TEMPLATES[id]
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) return fallback
  try {
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
    const rows = await sql`
      SELECT subject, html FROM mail_templates WHERE id = ${id} LIMIT 1
    `
    const row = (rows as Array<{ subject: string; html: string }>)[0]
    if (row?.subject && row?.html) return { subject: row.subject, html: row.html }
  } catch (err) {
    console.error('[mail-resultaat] template load', err)
  }
  return fallback
}

async function sendWithMailjet(opts: {
  to: string
  subject: string
  html: string
  attachments: Array<{ filename: string; mimeType: string; base64: string }>
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
    const data = (await res.json()) as { Messages?: Array<{ Status?: string }> }
    return data.Messages?.[0]?.Status === 'success'
  } catch {
    return true
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Alleen POST is toegestaan.' })
    return
  }

  try {
    const body = (req.body ?? {}) as {
      naam?: string
      woonplaats?: string
      email?: string
      prijsindicatie?: boolean
      bron?: 'mail' | 'offerte'
      productId?: string
      productNaam?: string
      kleur?: string
      montagetype?: string
      imageBase64?: string
      mimeType?: string
      roomImageBase64?: string
      roomMimeType?: string
      sessionId?: string
      beslagKleur?: string
    }

    const naam = (body.naam ?? '').trim()
    const woonplaats = (body.woonplaats ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    if (!naam) {
      res.status(400).json({ error: 'Naam is verplicht.' })
      return
    }
    if (!woonplaats) {
      res.status(400).json({ error: 'Woonplaats is verplicht.' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Ongeldig e-mailadres.' })
      return
    }
    if (!body.imageBase64 || !body.productNaam || !body.kleur) {
      res.status(400).json({ error: 'Ontbrekende velden.' })
      return
    }

    const result = stripDataUrl(body.imageBase64)
    const resultMime = body.mimeType || result.mime
    const room = body.roomImageBase64
      ? stripDataUrl(body.roomImageBase64)
      : null
    const roomMime = body.roomMimeType || room?.mime || 'image/jpeg'
    const bron = body.bron === 'offerte' ? 'offerte' : 'mail'
    const prijsindicatie = Boolean(body.prijsindicatie)

    const vars: TemplateVars = {
      naam,
      woonplaats,
      email,
      product: body.productNaam,
      kleur: body.kleur,
      montagetype: body.montagetype?.trim() || '—',
      prijsindicatie,
      bron,
      visualiseerUrl: visualiseerUrl(),
    }

    const resultAttachment = {
      filename: `visualisatie.${extForMime(resultMime)}`,
      mimeType: resultMime,
      base64: result.base64,
    }
    const roomAttachment = room
      ? {
          filename: `originele-kamerfoto.${extForMime(roomMime)}`,
          mimeType: roomMime,
          base64: room.base64,
        }
      : null

    let emailed = false
    let leadsEmailed = false

    if (bron === 'mail' || prijsindicatie) {
      const klantTpl = await loadTemplate('klant')
      emailed = await sendWithMailjet({
        to: email,
        subject: applyTemplate(klantTpl.subject, vars),
        html: applyTemplate(klantTpl.html, vars),
        attachments: [resultAttachment],
      })
    }

    const leadsEmail = process.env.LEADS_EMAIL?.trim()
    if (leadsEmail) {
      const leadsTpl = await loadTemplate('leads')
      const attachments = [resultAttachment]
      if (roomAttachment) attachments.push(roomAttachment)
      leadsEmailed = await sendWithMailjet({
        to: leadsEmail,
        subject: applyTemplate(leadsTpl.subject, vars),
        html: applyTemplate(leadsTpl.html, vars),
        attachments,
      })
    }

    res.status(200).json({ ok: true, emailed, leadsEmailed })
  } catch (err) {
    console.error('[api/mail-resultaat]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Mail-aanvraag mislukt',
    })
  }
}
