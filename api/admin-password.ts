import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'crypto'
import { neon } from '@neondatabase/serverless'

export const config = {
  maxDuration: 30,
}

function bootstrapPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || 'admin1234'
}

function adminSecret(): string {
  return process.env.ADMIN_SECRET?.trim() || `sm-admin:${bootstrapPassword()}`
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const next = scryptSync(password, salt, 64).toString('hex')
  return safeEqual(next, hash)
}

function normalizeUsername(username: string | undefined): string | null {
  if (!username) return null
  const cleaned = username.trim().toLowerCase()
  if (!/^[a-z0-9._-]{2,64}$/.test(cleaned)) return null
  return cleaned
}

function bearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization
  if (!raw) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m?.[1]?.trim()
}

function verifyAdminToken(token: string | undefined): { username: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [exp, nonce, username, sig] = parts
  if (!exp || !nonce || !username || !sig) return null
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return null
  const payload = `${exp}.${nonce}.${username}`
  const expected = createHmac('sha256', adminSecret()).update(payload).digest('hex')
  if (!safeEqual(sig, expected)) return null
  const user = normalizeUsername(username)
  if (!user) return null
  return { username: user }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = verifyAdminToken(bearerToken(req.headers.authorization))
  if (!session) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }

  try {
    const body = (typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : req.body ?? {}) as {
      currentPassword?: string
      newPassword?: string
    }
    if (!body.currentPassword || !body.newPassword) {
      res.status(400).json({ error: 'Huidig en nieuw wachtwoord zijn verplicht' })
      return
    }
    if (body.newPassword.length < 6) {
      res.status(400).json({ error: 'Nieuw wachtwoord moet minimaal 6 tekens zijn' })
      return
    }

    const databaseUrl = process.env.DATABASE_URL?.trim()
    if (!databaseUrl) {
      res.status(500).json({ error: 'DATABASE_URL ontbreekt' })
      return
    }

    const sql = neon(databaseUrl)
    const rows = await sql`
      SELECT username, password_hash
      FROM admin_users
      WHERE username = ${session.username}
      LIMIT 1
    `
    const row = (rows as Array<{ username: string; password_hash: string }>)[0]
    if (!row || !verifyPasswordHash(body.currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Huidig wachtwoord is onjuist' })
      return
    }

    await sql`
      UPDATE admin_users
      SET password_hash = ${hashPassword(body.newPassword)}, updated_at = now()
      WHERE username = ${session.username}
    `
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[api/admin-password]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Wachtwoord wijzigen mislukt',
    })
  }
}
