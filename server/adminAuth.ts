import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_BOOTSTRAP_PASSWORD = 'admin1234'

function readEnvFileValue(root: string, key: string): string | undefined {
  for (const name of ['.env.local', '.env']) {
    const p = resolve(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    const line = text.split('\n').find((l) => l.startsWith(`${key}=`))
    if (!line) continue
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

function loadDatabaseUrl(projectRoot?: string): string | undefined {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim()
  if (projectRoot) return readEnvFileValue(projectRoot, 'DATABASE_URL')
  return undefined
}

/** Bootstrap-wachtwoord uit env; default admin1234 tot je het in beheer wijzigt. */
export function loadBootstrapPassword(projectRoot?: string): string {
  if (process.env.ADMIN_PASSWORD?.trim()) return process.env.ADMIN_PASSWORD.trim()
  if (projectRoot) {
    const fromFile = readEnvFileValue(projectRoot, 'ADMIN_PASSWORD')
    if (fromFile) return fromFile
  }
  return DEFAULT_BOOTSTRAP_PASSWORD
}

/** @deprecated gebruik loadBootstrapPassword */
export function loadAdminPassword(projectRoot?: string): string | undefined {
  return loadBootstrapPassword(projectRoot)
}

export function loadAdminSecret(projectRoot?: string): string {
  if (process.env.ADMIN_SECRET?.trim()) return process.env.ADMIN_SECRET.trim()
  if (projectRoot) {
    const fromFile = readEnvFileValue(projectRoot, 'ADMIN_SECRET')
    if (fromFile) return fromFile
  }
  // Stabiel gehouden o.b.v. bootstrap, niet o.b.v. DB-wachtwoord (tokens blijven geldig)
  return `sm-admin:${loadBootstrapPassword(projectRoot)}`
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPasswordHash(
  password: string | undefined,
  stored: string,
): boolean {
  if (!password) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const next = scryptSync(password, salt, 64).toString('hex')
  return safeEqual(next, hash)
}

export function checkAdminPassword(
  password: string | undefined,
  expected: string,
): boolean {
  if (!password) return false
  return safeEqual(password, expected)
}

async function ensureSettingsTable(projectRoot?: string) {
  const databaseUrl = loadDatabaseUrl(projectRoot)
  if (!databaseUrl) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(databaseUrl)
  await sql`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  return sql
}

async function getStoredPasswordHash(
  projectRoot?: string,
): Promise<string | null> {
  const sql = await ensureSettingsTable(projectRoot)
  const rows = await sql`
    SELECT value FROM admin_settings WHERE key = 'password_hash' LIMIT 1
  `
  const value = (rows as Array<{ value: string }>)[0]?.value
  return value ?? null
}

export async function verifyLoginPassword(
  password: string | undefined,
  projectRoot?: string,
): Promise<boolean> {
  if (!password) return false
  const stored = await getStoredPasswordHash(projectRoot)
  if (stored) return verifyPasswordHash(password, stored)
  return checkAdminPassword(password, loadBootstrapPassword(projectRoot))
}

export async function changeAdminPassword(opts: {
  currentPassword: string
  newPassword: string
  projectRoot?: string
}): Promise<void> {
  const { currentPassword, newPassword, projectRoot } = opts
  if (!newPassword || newPassword.length < 6) {
    throw Object.assign(
      new Error('Nieuw wachtwoord moet minimaal 6 tekens zijn'),
      { statusCode: 400 },
    )
  }
  const ok = await verifyLoginPassword(currentPassword, projectRoot)
  if (!ok) {
    throw Object.assign(new Error('Huidig wachtwoord is onjuist'), {
      statusCode: 401,
    })
  }
  const sql = await ensureSettingsTable(projectRoot)
  const hashed = hashPassword(newPassword)
  await sql`
    INSERT INTO admin_settings (key, value, updated_at)
    VALUES ('password_hash', ${hashed}, now())
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = now()
  `
}

export function createAdminToken(secret: string): string {
  const exp = Date.now() + TOKEN_TTL_MS
  const nonce = randomBytes(8).toString('hex')
  const payload = `${exp}.${nonce}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifyAdminToken(
  token: string | undefined,
  secret: string,
): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, nonce, sig] = parts
  if (!exp || !nonce || !sig) return false
  if (!Number.isFinite(Number(exp)) || Date.now() > Number(exp)) return false
  const payload = `${exp}.${nonce}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return safeEqual(sig, expected)
}

export function bearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization
  if (!raw) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  return m?.[1]?.trim()
}
