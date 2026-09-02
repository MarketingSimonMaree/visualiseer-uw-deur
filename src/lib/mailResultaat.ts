export type MailResultaatRequest = {
  naam: string
  woonplaats: string
  email: string
  prijsindicatie: boolean
  bron: 'mail' | 'offerte'
  productId: string
  productNaam: string
  kleur: string
  montagetype: string
  imageBase64: string
  mimeType: string
  roomImageBase64?: string
  roomMimeType?: string
  sessionId?: string
  beslagKleur?: string
}

export type MailResultaatResponse = {
  ok: boolean
  emailed: boolean
  leadsEmailed?: boolean
  error?: string
}

export async function requestMailResultaat(
  body: MailResultaatRequest,
): Promise<MailResultaatResponse> {
  const res = await fetch('/api/mail-resultaat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: MailResultaatResponse
  try {
    data = JSON.parse(text) as MailResultaatResponse
  } catch {
    throw new Error(
      `Mail-aanvraag mislukt (${res.status}). Probeer het opnieuw.`,
    )
  }
  if (!res.ok) {
    throw new Error(data.error ?? 'Mail-aanvraag mislukt.')
  }
  return data
}
