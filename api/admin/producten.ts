import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  bearerToken,
  loadAdminSecret,
  verifyAdminToken,
} from '../../server/adminAuth'
import {
  listAdminProducten,
  patchAdminProduct,
  upsertAdminProduct,
  type ProductInput,
} from '../../server/productenCore'

function requireAuth(req: VercelRequest): boolean {
  const secret = loadAdminSecret()
  if (!secret) return false
  return verifyAdminToken(bearerToken(req.headers.authorization), secret)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req)) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }

  try {
    if (req.method === 'GET') {
      const producten = await listAdminProducten()
      res.status(200).json({ producten })
      return
    }

    if (req.method === 'POST') {
      const body = req.body as ProductInput
      const product = await upsertAdminProduct(body)
      res.status(200).json({ product })
      return
    }

    if (req.method === 'PATCH') {
      const body = req.body as Partial<ProductInput> & { id?: string }
      if (!body.id) {
        res.status(400).json({ error: 'id is verplicht' })
        return
      }
      const { id, ...patch } = body
      const product = await patchAdminProduct(id, patch)
      res.status(200).json({ product })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/admin/producten]', err)
    const status =
      err instanceof Error &&
      typeof (err as Error & { statusCode?: number }).statusCode === 'number'
        ? (err as Error & { statusCode: number }).statusCode
        : 500
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Beheeractie mislukt',
    })
  }
}
