import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  dailyLimitMessage,
  formatGenerateError,
  getClientIp,
  runGeneration,
  type GenBody,
} from '../server/generateCore'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
  maxDuration: 60,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Alleen POST is toegestaan.' })
  }

  try {
    const body = req.body as GenBody
    const host = req.headers.host
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
    const origin = host ? `${proto}://${host}` : undefined
    const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)

    const result = await runGeneration(body, {
      apiKey: process.env.OPENAI_API_KEY,
      origin,
      ip,
    })

    return res.status(200).json(result)
  } catch (err) {
    console.error('[api/generate]', err)
    const status =
      err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 429
        ? 429
        : 500
    const message =
      status === 429
        ? dailyLimitMessage()
        : formatGenerateError(err)
    return res.status(status).json({ error: message })
  }
}
