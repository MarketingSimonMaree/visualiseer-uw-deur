import type { Montagetype } from '../types/product'
import { buildGeneratePrompt } from './prompt'

export { buildGeneratePrompt }

export interface GenerateRequestBody {
  roomImageBase64: string
  productImageUrl: string
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

  const data = (await res.json()) as GenerateResponseBody
  if (!res.ok) {
    throw new Error(data.error ?? 'Genereren mislukt. Probeer het opnieuw.')
  }
  if (!data.imageBase64) {
    throw new Error('Geen afbeelding ontvangen. Probeer het opnieuw.')
  }
  return data
}
