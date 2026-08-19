import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  loadMailTemplates,
  saveMailTemplate,
} from '../shared/mailResultaatCore'
import {
  MAIL_PLACEHOLDERS,
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
      const template = await saveMailTemplate({
        id: body.id,
        label: body.label,
        subject: body.subject,
        html: body.html,
      })
      res.status(200).json({ template })
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
