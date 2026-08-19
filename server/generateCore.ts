import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import OpenAI, { toFile } from 'openai'
import sharp from 'sharp'
import {
  DAILY_GENERATION_LIMIT,
  IMAGE_QUALITY,
  IMAGE_SIZE,
  MAX_GEN_INPUT_LONG_SIDE,
} from '../src/config.ts'
import { DEFAULT_AGENT_PROMPTS, type Montagetype } from '../src/types/product.ts'
import { buildGeneratePrompt } from '../src/lib/prompt.ts'

export type GenBody = {
  roomImageBase64: string
  productImageUrl: string
  productNaam: string
  kleur: string
  montagetype: string
  cacheKey?: string
}

export type GenSuccess = {
  imageBase64: string
  mimeType: string
  mock?: boolean
}

/** Eenvoudige in-memory daglimiet per IP (per instance; client heeft ook limiet). */
const dailyByIp = new Map<string, { date: string; count: number }>()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getClientIp(headers: Record<string, string | string[] | undefined>, fallback = 'unknown'): string {
  const xf = headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim()
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0]!.trim()
  const real = headers['x-real-ip']
  if (typeof real === 'string' && real.length > 0) return real
  return fallback
}

function getDailyCount(ip: string): number {
  const day = todayKey()
  const cur = dailyByIp.get(ip)
  if (!cur || cur.date !== day) return 0
  return cur.count
}

export function canGenerateToday(ip: string): boolean {
  return getDailyCount(ip) < DAILY_GENERATION_LIMIT
}

export function consumeDailyLimit(ip: string): void {
  const day = todayKey()
  const cur = dailyByIp.get(ip)
  if (!cur || cur.date !== day) {
    dailyByIp.set(ip, { date: day, count: 1 })
    return
  }
  cur.count += 1
  dailyByIp.set(ip, cur)
}

export function dailyLimitMessage(): string {
  return `Daglimiet bereikt (${DAILY_GENERATION_LIMIT} visualisaties per dag). Probeer het morgen opnieuw of neem contact met ons op.`
}

export function stripDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) {
    return { mime: 'image/jpeg', buffer: Buffer.from(dataUrl, 'base64') }
  }
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }
}

async function downscaleImageBuffer(
  buffer: Buffer,
  mime: string,
  maxLongSide: number,
): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const image = sharp(buffer, { failOn: 'none' })
    const meta = await image.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const long = Math.max(w, h)
    const pipeline =
      long > maxLongSide
        ? image.resize({
            width: w >= h ? maxLongSide : undefined,
            height: h > w ? maxLongSide : undefined,
            fit: 'inside',
            withoutEnlargement: true,
          })
        : image
    const out = await pipeline.jpeg({ quality: 85 }).toBuffer()
    return { buffer: out, mime: 'image/jpeg' }
  } catch {
    return { buffer, mime }
  }
}

function mimeFromPath(path: string): string {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  return 'image/jpeg'
}

async function loadProductImage(
  productImageUrl: string,
  opts: { projectRoot?: string; origin?: string },
): Promise<{ buffer: Buffer; mime: string }> {
  if (productImageUrl.startsWith('/')) {
    if (opts.projectRoot) {
      const local = resolve(opts.projectRoot, 'public', productImageUrl.replace(/^\//, ''))
      if (existsSync(local)) {
        return { buffer: readFileSync(local), mime: mimeFromPath(local) }
      }
    }
    if (opts.origin) {
      const absolute = new URL(productImageUrl, opts.origin).href
      const productRes = await fetch(absolute)
      if (!productRes.ok) {
        throw new Error(`Productafbeelding laden mislukt (${productRes.status})`)
      }
      return {
        buffer: Buffer.from(await productRes.arrayBuffer()),
        mime: productRes.headers.get('content-type') ?? 'image/jpeg',
      }
    }
    throw new Error(`Productafbeelding niet gevonden: ${productImageUrl}`)
  }

  const productRes = await fetch(productImageUrl)
  if (!productRes.ok) {
    throw new Error(`Productafbeelding laden mislukt (${productRes.status})`)
  }
  return {
    buffer: Buffer.from(await productRes.arrayBuffer()),
    mime: productRes.headers.get('content-type') ?? 'image/jpeg',
  }
}

export function formatGenerateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  const cause =
    err instanceof Error && err.cause instanceof Error ? err.cause.message : ''
  const combined = `${msg} ${cause}`.toLowerCase()

  if (
    combined.includes('enotfound') ||
    combined.includes('connection error') ||
    combined.includes('fetch failed') ||
    combined.includes('econnrefused') ||
    combined.includes('etimedout')
  ) {
    return 'Geen verbinding met OpenAI. Controleer uw internetverbinding en probeer het opnieuw.'
  }
  if (combined.includes('401') || combined.includes('incorrect api key')) {
    return 'Ongeldige OPENAI_API_KEY. Controleer de sleutel in de hosting-omgeving.'
  }
  if (combined.includes('429') || combined.includes('rate limit')) {
    return 'Te veel verzoeken naar OpenAI. Wacht even en probeer het opnieuw.'
  }
  if (combined.includes('organization must be verified') || combined.includes('verification')) {
    return 'Uw OpenAI-organisatie moet geverifieerd zijn voor gpt-image-2.'
  }
  return msg || 'Genereren mislukt. Probeer het opnieuw.'
}

/**
 * Voert een generatie uit. Zonder API-key: mock (kamerfoto terug).
 */
export async function runGeneration(
  body: GenBody,
  opts: {
    apiKey?: string
    projectRoot?: string
    origin?: string
    ip?: string
  },
): Promise<GenSuccess> {
  if (!body.roomImageBase64 || !body.productImageUrl || !body.productNaam || !body.kleur) {
    throw new Error('Ontbrekende velden voor generatie.')
  }

  const room = stripDataUrl(body.roomImageBase64)
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY

  if (!apiKey) {
    return {
      imageBase64: room.buffer.toString('base64'),
      mimeType: room.mime,
      mock: true,
    }
  }

  if (opts.ip && !canGenerateToday(opts.ip)) {
    const err = new Error(dailyLimitMessage())
    ;(err as Error & { statusCode?: number }).statusCode = 429
    throw err
  }

  const product = await loadProductImage(body.productImageUrl, {
    projectRoot: opts.projectRoot,
    origin: opts.origin,
  })

  if (
    product.mime.includes('svg') ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(product.mime)
  ) {
    throw new Error(
      'Productafbeelding moet JPG, PNG of WebP zijn (geen SVG). Pas afbeeldingUrl aan in producten.ts.',
    )
  }

  const openai = new OpenAI({ apiKey })
  const productPrepared = await downscaleImageBuffer(
    product.buffer,
    product.mime,
    MAX_GEN_INPUT_LONG_SIDE,
  )
  const roomFile = await toFile(room.buffer, 'room.jpg', { type: room.mime })
  const productFile = await toFile(productPrepared.buffer, 'door.jpg', {
    type: productPrepared.mime,
  })

  const montagetype = (body.montagetype ||
    'deur-bestaand-kozijn') as Montagetype
  const montageAgentPrompt =
    DEFAULT_AGENT_PROMPTS[montagetype] ?? `Mounting type: ${montagetype}.`

  const result = await openai.images.edit({
    model: 'gpt-image-2',
    image: [roomFile, productFile],
    prompt: buildGeneratePrompt({
      productNaam: body.productNaam,
      kleur: body.kleur,
      montagetype,
      montageAgentPrompt,
    }),
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
  })

  const imageBase64 = result.data?.[0]?.b64_json
  if (!imageBase64) {
    throw new Error('Model gaf geen afbeelding terug.')
  }

  if (opts.ip) consumeDailyLimit(opts.ip)

  return { imageBase64, mimeType: 'image/png', mock: false }
}
