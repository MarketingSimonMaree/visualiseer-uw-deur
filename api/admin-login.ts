import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'crypto'
import { neon } from '@neondatabase/serverless'

export const config = {
  maxDuration: 30,
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_USER = { username: 'carlton', password: 'admin1234' }

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL ontbreekt')
  return url
}

function bootstrapPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || DEFAULT_USER.password
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

function createAdminToken(username: string): string {
  const exp = Date.now() + TOKEN_TTL_MS
  const nonce = randomBytes(8).toString('hex')
  const user = normalizeUsername(username) ?? 'admin'
  const payload = `${exp}.${nonce}.${user}`
  const sig = createHmac('sha256', adminSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function bearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization
  if (!raw) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m?.[1]?.trim()
}

function verifyAdminToken(
  token: string | undefined,
): { username: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [exp, nonce, username, sig] = parts
  if (!exp || !nonce || !username || !sig) return null
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return null
  const payload = `${exp}.${nonce}.${username}`
  const expected = createHmac('sha256', adminSecret())
    .update(payload)
    .digest('hex')
  if (!safeEqual(sig, expected)) return null
  const user = normalizeUsername(username)
  if (!user) return null
  return { username: user }
}

function actionOf(req: VercelRequest): string {
  const q = req.query.action
  if (typeof q === 'string' && q.trim()) return q.trim().toLowerCase()
  if (Array.isArray(q) && q[0]) return String(q[0]).trim().toLowerCase()
  const url = typeof req.url === 'string' ? req.url : ''
  if (url.includes('password')) return 'password'
  return 'login'
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const body = (
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  ) as { username?: string; password?: string }

  const username = normalizeUsername(body.username)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) {
    res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' })
    return
  }

  const sql = neon(databaseUrl())
  await sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  const existing = await sql`
    SELECT username FROM admin_users WHERE username = ${DEFAULT_USER.username} LIMIT 1
  `
  if ((existing as Array<{ username: string }>).length === 0) {
    await sql`
      INSERT INTO admin_users (username, password_hash, updated_at)
      VALUES (${DEFAULT_USER.username}, ${hashPassword(bootstrapPassword())}, now())
      ON CONFLICT (username) DO NOTHING
    `
  }

  const rows = await sql`
    SELECT username, password_hash
    FROM admin_users
    WHERE username = ${username}
    LIMIT 1
  `
  const row = (rows as Array<{ username: string; password_hash: string }>)[0]
  if (!row || !verifyPasswordHash(password, row.password_hash)) {
    res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' })
    return
  }

  res.status(200).json({
    token: createAdminToken(row.username),
    username: row.username,
  })
}

async function handlePassword(req: VercelRequest, res: VercelResponse) {
  const session = verifyAdminToken(bearerToken(req.headers.authorization))
  if (!session) {
    res.status(401).json({ error: 'Niet ingelogd' })
    return
  }

  const body = (
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  ) as {
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

  const sql = neon(databaseUrl())
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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    if (actionOf(req) === 'password') {
      await handlePassword(req, res)
      return
    }
    await handleLogin(req, res)
  } catch (err) {
    console.error('[api/admin-login]', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Authenticatie mislukt',
    })
  }
}
