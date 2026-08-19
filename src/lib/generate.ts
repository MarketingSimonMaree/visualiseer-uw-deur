import type { Montagetype } from '../types/product'
import { buildGeneratePrompt } from './prompt'

export { buildGeneratePrompt }

export interface GenerateRequestBody {
  roomImageBase64: string
  productImageUrl: string
  productId: string
  productNaam: string
  kleur: string
  montagetype: Montagetype
  cacheKey: string
}

export interface GenerateResponseBody {
  imageBase64: string
  mimeType: string
  mock?: boolean
  error?: string
}

export async function requestGeneration(
  body: GenerateRequestBody,
  signal?: AbortSignal,
): Promise<GenerateResponseBody> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  const text = await res.text()
  let data: GenerateResponseBody
  try {
    data = JSON.parse(text) as GenerateResponseBody
  } catch {
    if (res.status === 404) {
      throw new Error(
        'De generatie-API is niet bereikbaar (404). Controleer of de site op Vercel draait met OPENAI_API_KEY gezet.',
      )
    }
    if (res.status >= 500) {
      throw new Error(
        'De server gaf een fout (500). Vaak ontbreekt OPENAI_API_KEY in Vercel, of de deploy is nog bezig. Geen database nodig.',
      )
    }
    throw new Error(
      `Onverwacht antwoord van de server (${res.status}). Probeer het opnieuw.`,
    )
  }

  if (!res.ok) {
    throw new Error(data.error ?? 'Genereren mislukt. Probeer het opnieuw.')
  }
  if (!data.imageBase64) {
    throw new Error('Geen afbeelding ontvangen. Probeer het opnieuw.')
  }
  return data
}
