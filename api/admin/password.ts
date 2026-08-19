import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  bearerToken,
  changeAdminPassword,
  loadAdminSecret,
  verifyAdminToken,
} from '../../server/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = verifyAdminToken(
    bearerToken(req.headers.authorization),
    loadAdminSecret(),
  )
  if (!session) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }

  try {
    const body = (req.body ?? {}) as {
      currentPassword?: string
      newPassword?: string
    }
    if (!body.currentPassword || !body.newPassword) {
      res.status(400).json({ error: 'Huidig en nieuw wachtwoord zijn verplicht' })
      return
    }
    await changeAdminPassword({
      username: session.username,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    })
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[api/admin/password]', err)
    const status =
      err instanceof Error &&
      typeof (err as Error & { statusCode?: number }).statusCode === 'number'
        ? (err as Error & { statusCode: number }).statusCode
        : 500
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Wachtwoord wijzigen mislukt',
    })
  }
}
