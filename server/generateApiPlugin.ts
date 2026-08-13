import type { Plugin } from 'vite'
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
import { buildGeneratePrompt } from '../src/lib/prompt.ts'

type GenBody = {
  roomImageBase64: string
  productImageUrl: string
  productNaam: string
  kleur: string
  montagetype: string
  cacheKey: string
}

/** Eenvoudige in-memory daglimiet per IP (reset bij server-herstart). */
const dailyByIp = new Map<string, { date: string; count: number }>()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim()
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0]!.trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

function getDailyCount(ip: string): number {
  const day = todayKey()
  const cur = dailyByIp.get(ip)
  if (!cur || cur.date !== day) return 0
  return cur.count
}

function canGenerateToday(ip: string): boolean {
  return getDailyCount(ip) < DAILY_GENERATION_LIMIT
}

function consumeDailyLimit(ip: string): void {
  const day = todayKey()
  const cur = dailyByIp.get(ip)
  if (!cur || cur.date !== day) {
    dailyByIp.set(ip, { date: day, count: 1 })
    return
  }
  cur.count += 1
  dailyByIp.set(ip, cur)
}

function loadEnvKey(root: string): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  for (const name of ['.env.local', '.env']) {
    const p = resolve(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    const line = text.split('\n').find((l) => l.startsWith('OPENAI_API_KEY='))
    if (!line) continue
    return line.slice('OPENAI_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

function stripDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) {
    return { mime: 'image/jpeg', buffer: Buffer.from(dataUrl, 'base64') }
  }
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }
}

function mimeFromPath(path: string): string {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  return 'image/jpeg'
}

async function loadProductImage(
  root: string,
  productImageUrl: string,
): Promise<{ buffer: Buffer; mime: string }> {
  if (productImageUrl.startsWith('/')) {
    const local = resolve(root, 'public', productImageUrl.replace(/^\//, ''))
    if (!existsSync(local)) {
      throw new Error(`Productafbeelding niet gevonden: ${productImageUrl}`)
    }
    return { buffer: readFileSync(local), mime: mimeFromPath(local) }
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

function formatGenerateError(err: unknown): string {
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
    return 'Geen verbinding met OpenAI. Controleer uw internetverbinding en herstart daarna de server.'
  }
  if (combined.includes('401') || combined.includes('incorrect api key')) {
    return 'Ongeldige OPENAI_API_KEY in .env.local. Controleer de sleutel en herstart de server.'
  }
  if (combined.includes('429') || combined.includes('rate limit')) {
    return 'Te veel verzoeken naar OpenAI. Wacht even en probeer het opnieuw.'
  }
  if (combined.includes('organization must be verified') || combined.includes('verification')) {
    return 'Uw OpenAI-organisatie moet geverifieerd zijn voor gpt-image-2. Doe dat in het OpenAI-dashboard.'
  }
  return msg || 'Genereren mislukt. Probeer het opnieuw.'
}

export function generateApiPlugin(): Plugin {
  return {
    name: 'sm-generate-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/generate' || req.method !== 'POST') {
          next()
          return
        }

        try {
          const ip = clientIp(req as never)

          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as GenBody

          if (!body.roomImageBase64 || !body.productImageUrl || !body.productNaam || !body.kleur) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Ontbrekende velden voor generatie.' }))
            return
          }

          const room = stripDataUrl(body.roomImageBase64)
          const apiKey = loadEnvKey(server.config.root)

          if (!apiKey) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                imageBase64: room.buffer.toString('base64'),
                mimeType: room.mime,
                mock: true,
              }),
            )
            return
          }

          if (!canGenerateToday(ip)) {
            res.statusCode = 429
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: `Daglimiet bereikt (${DAILY_GENERATION_LIMIT} visualisaties per dag). Probeer het morgen opnieuw of neem contact met ons op.`,
              }),
            )
            return
          }

          const product = await loadProductImage(server.config.root, body.productImageUrl)
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

          const result = await openai.images.edit({
            model: 'gpt-image-2',
            image: [roomFile, productFile],
            prompt: buildGeneratePrompt({
              productNaam: body.productNaam,
              kleur: body.kleur,
              montagetype: body.montagetype,
            }),
            size: IMAGE_SIZE,
            quality: IMAGE_QUALITY,
          })

          const imageBase64 = result.data?.[0]?.b64_json
          if (!imageBase64) {
            throw new Error('Model gaf geen afbeelding terug.')
          }

          consumeDailyLimit(ip)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ imageBase64, mimeType: 'image/png', mock: false }))
        } catch (err) {
          console.error('[api/generate]', err)
          const message = formatGenerateError(err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
  }
}
