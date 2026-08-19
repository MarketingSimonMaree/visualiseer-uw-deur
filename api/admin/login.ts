import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  createAdminToken,
  loadAdminSecret,
  loginAdminUser,
} from '../../server/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = (req.body ?? {}) as { username?: string; password?: string }
    const user = await loginAdminUser({
      username: body.username,
      password: body.password,
    })
    if (!user) {
      res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' })
      return
    }
    res.status(200).json({
      token: createAdminToken(loadAdminSecret(), user.username),
      username: user.username,
    })
  } catch (err) {
    console.error('[api/admin/login]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Inloggen mislukt',
    })
  }
}
