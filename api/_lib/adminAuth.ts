import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

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

export function loadAdminSecret(): string {
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

function verifyPasswordHash(password: string | undefined, stored: string): boolean {
  if (!password) return false
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

async function ensureAdminUsers() {
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
  return sql
}

export async function loginAdminUser(opts: {
  username?: string
  password?: string
}): Promise<{ username: string } | null> {
  const username = normalizeUsername(opts.username)
  if (!username || !opts.password) return null
  const sql = await ensureAdminUsers()
  const rows = await sql`
    SELECT username, password_hash
    FROM admin_users
    WHERE username = ${username}
    LIMIT 1
  `
  const row = (rows as Array<{ username: string; password_hash: string }>)[0]
  if (!row) return null
  if (!verifyPasswordHash(opts.password, row.password_hash)) return null
  return { username: row.username }
}

export async function changeAdminPassword(opts: {
  username: string
  currentPassword: string
  newPassword: string
}): Promise<void> {
  const username = normalizeUsername(opts.username)
  if (!username) {
    throw Object.assign(new Error('Ongeldige gebruiker'), { statusCode: 400 })
  }
  if (!opts.newPassword || opts.newPassword.length < 6) {
    throw Object.assign(
      new Error('Nieuw wachtwoord moet minimaal 6 tekens zijn'),
      { statusCode: 400 },
    )
  }
  const sql = await ensureAdminUsers()
  const rows = await sql`
    SELECT username, password_hash
    FROM admin_users
    WHERE username = ${username}
    LIMIT 1
  `
  const row = (rows as Array<{ username: string; password_hash: string }>)[0]
  if (!row || !verifyPasswordHash(opts.currentPassword, row.password_hash)) {
    throw Object.assign(new Error('Huidig wachtwoord is onjuist'), {
      statusCode: 401,
    })
  }
  await sql`
    UPDATE admin_users
    SET password_hash = ${hashPassword(opts.newPassword)}, updated_at = now()
    WHERE username = ${username}
  `
}

export function createAdminToken(secret: string, username: string): string {
  const exp = Date.now() + TOKEN_TTL_MS
  const nonce = randomBytes(8).toString('hex')
  const user = normalizeUsername(username) ?? 'admin'
  const payload = `${exp}.${nonce}.${user}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifyAdminToken(
  token: string | undefined,
  secret: string,
): { username: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [exp, nonce, username, sig] = parts
  if (!exp || !nonce || !username || !sig) return null
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return null
  const payload = `${exp}.${nonce}.${username}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  if (!safeEqual(sig, expected)) return null
  const user = normalizeUsername(username)
  if (!user) return null
  return { username: user }
}

export function bearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization
  if (!raw) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m?.[1]?.trim()
}
