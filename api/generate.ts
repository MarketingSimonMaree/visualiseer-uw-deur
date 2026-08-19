import type { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI, { toFile } from 'openai'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
  maxDuration: 60,
}

const DAILY_LIMIT = 20
const IMAGE_SIZE = '1024x1536' as const
const IMAGE_QUALITY = 'low' as const

type GenBody = {
  roomImageBase64?: string
  productImageUrl?: string
  productId?: string
  productNaam?: string
  kleur?: string
  montagetype?: string
}

/** Best-effort limiet per IP binnen deze serverless instance. */
const dailyByIp = new Map<string, { date: string; count: number }>()

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function clientIp(req: VercelRequest): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim()
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0]!.trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

function canGenerate(ip: string): boolean {
  const day = todayKey()
  const cur = dailyByIp.get(ip)
  if (!cur || cur.date !== day) return true
  return cur.count < DAILY_LIMIT
}

function consume(ip: string) {
  const day = todayKey()
  const cur = dailyByIp.get(ip)
  if (!cur || cur.date !== day) {
    dailyByIp.set(ip, { date: day, count: 1 })
    return
  }
  cur.count += 1
}

function stripDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) return { mime: 'image/jpeg', buffer: Buffer.from(dataUrl, 'base64') }
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }
}

async function resolveAgentGuidance(opts: {
  montagetype: string
  productId?: string
  collectieHint?: string
}): Promise<{ montage: string; beslag: string; extra: string }> {
  const fallbackMontage = `Mounting type: ${opts.montagetype}.`
  const fallbackBeslag =
    'Hardware: use a standard Dutch lever door handle (deurkruk). NEVER a vertical pull bar unless explicitly required.'
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    return { montage: fallbackMontage, beslag: fallbackBeslag, extra: '' }
  }

  try {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(databaseUrl)

    const montageRows = await sql`
      SELECT agent_prompt FROM montagetype_defs
      WHERE id = ${opts.montagetype} AND actief = true
      LIMIT 1
    `
    const montage =
      (montageRows as Array<{ agent_prompt: string }>)[0]?.agent_prompt?.trim() ||
      fallbackMontage

    let beslagId: string | null = null
    let agentExtra = ''
    let collectie = opts.collectieHint ?? ''

    if (opts.productId) {
      const productRows = await sql`
        SELECT beslag_id, agent_extra, collectie
        FROM producten
        WHERE id = ${opts.productId}
        LIMIT 1
      `
      const p = (
        productRows as Array<{
          beslag_id: string | null
          agent_extra: string | null
          collectie: string
        }>
      )[0]
      if (p) {
        beslagId = p.beslag_id
        agentExtra = p.agent_extra?.trim() || ''
        collectie = p.collectie || collectie
      }
    }

    if (!beslagId && collectie) {
      const colRows = await sql`
        SELECT beslag_id, agent_extra
        FROM collectie_defaults
        WHERE collectie = ${collectie}
        LIMIT 1
      `
      const c = (
        colRows as Array<{ beslag_id: string | null; agent_extra: string | null }>
      )[0]
      if (c) {
        beslagId = c.beslag_id
        if (!agentExtra) agentExtra = c.agent_extra?.trim() || ''
      }
    }

    if (!beslagId) beslagId = 'deurkruk-standaard'

    const beslagRows = await sql`
      SELECT agent_prompt FROM beslag_defs
      WHERE id = ${beslagId} AND actief = true
      LIMIT 1
    `
    const beslag =
      (beslagRows as Array<{ agent_prompt: string }>)[0]?.agent_prompt?.trim() ||
      fallbackBeslag

    return { montage, beslag, extra: agentExtra }
  } catch {
    return { montage: fallbackMontage, beslag: fallbackBeslag, extra: '' }
  }
}

function buildPrompt(
  body: Required<Pick<GenBody, 'productNaam' | 'kleur' | 'montagetype'>>,
  guidance: { montage: string; beslag: string; extra: string },
) {
  return [
    'Photorealistic photo edit of a real room.',
    'Image 1 = customer room photo (base). Keep walls, floor, ceiling, lighting, furniture, stairs, switches, keypad, camera angle and perspective EXACTLY unchanged.',
    'Image 2 = product reference for the NEW door design only.',
    'Replace only the door leaf (and frame only if mounting type requires a new frame) so it fits the existing opening naturally.',
    `Door model: ${body.productNaam}.`,
    `Requested colour: ${body.kleur}. Apply this colour to the door leaf/frame realistically; keep panel/glass layout of the model.`,
    `Mounting guidance: ${guidance.montage}`,
    `Hardware guidance: ${guidance.beslag}`,
    guidance.extra ? `Additional product guidance: ${guidance.extra}` : '',
    'HARD RULES — these override anything visible in the product reference photo:',
    '1. The door must be FULLY CLOSED, flush in the opening. Never ajar, never open, never swinging.',
    '2. HINGE vs HANDLE SIDE (critical): Keep the hinge side exactly as in Image 1. Put operable hardware ALWAYS on the OPPOSITE side of the hinges. Ignore the handle side shown on the product photo.',
    '3. Any glass in the door must be CLEAR and TRANSPARENT (see-through). Never frosted, sandblasted, milky, smoked-opaque, or privacy glass.',
    '4. From Image 2, copy only the door design: proportions, panels, frame profile, and material look. Ignore its open/closed state and frosted glass. Follow the hardware guidance above for handle/pull type.',
    'No people, no text overlays, no logos, no watermarks.',
    'Output one photorealistic photo.',
  ]
    .filter(Boolean)
    .join(' ')
}

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('api key') || lower.includes('401')) {
    return 'OPENAI_API_KEY ontbreekt of is ongeldig in Vercel Environment Variables.'
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'Te veel verzoeken naar OpenAI. Wacht even en probeer het opnieuw.'
  }
  return msg || 'Genereren mislukt. Probeer het opnieuw.'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Alleen POST is toegestaan.' })
  }

  try {
    const body = (req.body ?? {}) as GenBody
    if (!body.roomImageBase64 || !body.productImageUrl || !body.productNaam || !body.kleur) {
      return res.status(400).json({ error: 'Ontbrekende velden voor generatie.' })
    }

    const ip = clientIp(req)
    if (!canGenerate(ip)) {
      return res.status(429).json({
        error: `Daglimiet bereikt (${DAILY_LIMIT} visualisaties per dag). Probeer het morgen opnieuw.`,
      })
    }

    const room = stripDataUrl(body.roomImageBase64)
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      // Demo zonder key — geen crash
      return res.status(200).json({
        imageBase64: room.buffer.toString('base64'),
        mimeType: room.mime,
        mock: true,
      })
    }

    const productUrl = body.productImageUrl.startsWith('/')
      ? `https://${req.headers.host}${body.productImageUrl}`
      : body.productImageUrl

    const productRes = await fetch(productUrl)
    if (!productRes.ok) {
      return res.status(400).json({
        error: `Productafbeelding laden mislukt (${productRes.status}).`,
      })
    }

    const productBuf = Buffer.from(await productRes.arrayBuffer())
    const productMime = productRes.headers.get('content-type') ?? 'image/jpeg'
    if (productMime.includes('svg')) {
      return res.status(400).json({
        error: 'Productafbeelding moet JPG, PNG of WebP zijn (geen SVG).',
      })
    }

    const openai = new OpenAI({ apiKey })
    const roomFile = await toFile(room.buffer, 'room.jpg', { type: room.mime })
    const productFile = await toFile(productBuf, 'door.jpg', { type: productMime })

    const montagetype = body.montagetype || 'deur-bestaand-kozijn'
    const guidance = await resolveAgentGuidance({
      montagetype,
      productId: body.productId,
    })

    const result = await openai.images.edit({
      model: 'gpt-image-2',
      image: [roomFile, productFile],
      prompt: buildPrompt(
        {
          productNaam: body.productNaam,
          kleur: body.kleur,
          montagetype,
        },
        guidance,
      ),
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
    })

    const imageBase64 = result.data?.[0]?.b64_json
    if (!imageBase64) {
      return res.status(500).json({ error: 'Model gaf geen afbeelding terug.' })
    }

    consume(ip)
    return res.status(200).json({
      imageBase64,
      mimeType: 'image/png',
      mock: false,
    })
  } catch (err) {
    console.error('[api/generate]', err)
    return res.status(500).json({ error: errorMessage(err) })
  }
}
