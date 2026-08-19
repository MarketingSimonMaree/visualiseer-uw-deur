import type { VercelRequest, VercelResponse } from '@vercel/node'
import { processMailResultaat } from '../shared/mailResultaatCore'

export const config = { maxDuration: 60 }

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
    }

    const result = await processMailResultaat({
      naam: body.naam ?? '',
      woonplaats: body.woonplaats ?? '',
      email: body.email ?? '',
      prijsindicatie: Boolean(body.prijsindicatie),
      bron: body.bron === 'offerte' ? 'offerte' : 'mail',
      productId: body.productId,
      productNaam: body.productNaam ?? '',
      kleur: body.kleur ?? '',
      montagetype: body.montagetype,
      imageBase64: body.imageBase64 ?? '',
      mimeType: body.mimeType,
      roomImageBase64: body.roomImageBase64,
      roomMimeType: body.roomMimeType,
    })

    res.status(200).json(result)
  } catch (err) {
    console.error('[api/mail-resultaat]', err)
    const message = err instanceof Error ? err.message : 'Mail-aanvraag mislukt'
    const status =
      message.includes('verplicht') ||
      message.includes('Ongeldig') ||
      message.includes('Ontbrekende')
        ? 400
        : 500
    res.status(status).json({ error: message })
  }
}
