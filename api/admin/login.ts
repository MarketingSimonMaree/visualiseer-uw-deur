import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  createAdminToken,
  loadAdminSecret,
  verifyLoginPassword,
} from '../../server/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = (req.body ?? {}) as { password?: string }
    const ok = await verifyLoginPassword(body.password)
    if (!ok) {
      res.status(401).json({ error: 'Onjuist wachtwoord' })
      return
    }
    res.status(200).json({ token: createAdminToken(loadAdminSecret()) })
  } catch (err) {
    console.error('[api/admin/login]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Inloggen mislukt',
    })
  }
}
