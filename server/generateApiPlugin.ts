import type { Plugin } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatGenerateError,
  getClientIp,
  runGeneration,
  type GenBody,
} from './generateCore.ts'
import {
  bearerToken,
  changeAdminPassword,
  createAdminToken,
  loadAdminSecret,
  loginAdminUser,
  verifyAdminToken,
} from './adminAuth.ts'
import {
  listAdminProducten,
  listProducten,
  patchAdminProduct,
  upsertAdminProduct,
  type ProductInput,
} from './productenCore.ts'

function loadEnvKey(root: string): string | undefined {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  for (const name of ['.env.local', '.env']) {
    const p = resolve(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    const line = text.split('\n').find((l) => l.startsWith('OPENAI_API_KEY='))
    if (!line) continue
    return line.slice('OPENAI_API_KEY='.length).trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

async function readJsonBody(req: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
    string,
    unknown
  >
}

function sendJson(
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown,
) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function isAuthed(
  req: import('node:http').IncomingMessage,
  root: string,
): { username: string } | null {
  return verifyAdminToken(
    bearerToken(req.headers.authorization),
    loadAdminSecret(root),
  )
}

export function generateApiPlugin(): Plugin {
  return {
    name: 'sm-generate-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        const pathname = url.split('?')[0]
        const root = server.config.root

        try {
          if (pathname === '/api/producten' && req.method === 'GET') {
            const qs = new URL(url, 'http://localhost').searchParams
            const producten = await listProducten(root, qs.get('montagetype'))
            sendJson(res, 200, { producten })
            return
          }

          if (
            (pathname === '/api/admin-login' ||
              pathname === '/api/admin/login') &&
            req.method === 'POST'
          ) {
            const body = (await readJsonBody(req)) as {
              username?: string
              password?: string
            }
            const user = await loginAdminUser({
              username: body.username,
              password: body.password,
              projectRoot: root,
            })
            if (!user) {
              sendJson(res, 401, {
                error: 'Onjuiste gebruikersnaam of wachtwoord',
              })
              return
            }
            sendJson(res, 200, {
              token: createAdminToken(loadAdminSecret(root), user.username),
              username: user.username,
            })
            return
          }

          if (
            (pathname === '/api/admin-password' ||
              pathname === '/api/admin/password') &&
            req.method === 'POST'
          ) {
            const session = isAuthed(req, root)
            if (!session) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }
            const body = (await readJsonBody(req)) as {
              currentPassword?: string
              newPassword?: string
            }
            if (!body.currentPassword || !body.newPassword) {
              sendJson(res, 400, {
                error: 'Huidig en nieuw wachtwoord zijn verplicht',
              })
              return
            }
            await changeAdminPassword({
              username: session.username,
              currentPassword: body.currentPassword,
              newPassword: body.newPassword,
              projectRoot: root,
            })
            sendJson(res, 200, { ok: true })
            return
          }

          if (
            pathname === '/api/admin-producten' ||
            pathname === '/api/admin/producten'
          ) {
            if (!isAuthed(req, root)) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }

            if (req.method === 'GET') {
              sendJson(res, 200, { producten: await listAdminProducten(root) })
              return
            }

            if (req.method === 'POST') {
              const body = (await readJsonBody(req)) as unknown as ProductInput
              const product = await upsertAdminProduct(body, root)
              sendJson(res, 200, { product })
              return
            }

            if (req.method === 'PATCH') {
              const body = (await readJsonBody(req)) as Partial<ProductInput> & {
                id?: string
              }
              if (!body.id) {
                sendJson(res, 400, { error: 'id is verplicht' })
                return
              }
              const { id, ...patch } = body
              const product = await patchAdminProduct(id, patch, root)
              sendJson(res, 200, { product })
              return
            }

            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          if (pathname === '/api/admin-montagetypes') {
            if (!isAuthed(req, root)) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }
            const { neon } = await import('@neondatabase/serverless')
            const { readFileSync: readEnv, existsSync: existsEnv } =
              await import('node:fs')
            const { resolve: resolveEnv } = await import('node:path')
            let dbUrl = process.env.DATABASE_URL
            if (!dbUrl) {
              for (const name of ['.env.local', '.env']) {
                const p = resolveEnv(root, name)
                if (!existsEnv(p)) continue
                const line = readEnv(p, 'utf8')
                  .split('\n')
                  .find((l) => l.startsWith('DATABASE_URL='))
                if (line) {
                  dbUrl = line
                    .slice('DATABASE_URL='.length)
                    .trim()
                    .replace(/^["']|["']$/g, '')
                  break
                }
              }
            }
            if (!dbUrl) throw new Error('DATABASE_URL ontbreekt')
            const sql = neon(dbUrl)
            if (req.method === 'GET') {
              const rows = await sql`
                SELECT id, label, hint, agent_prompt, sort_order, actief
                FROM montagetype_defs ORDER BY sort_order ASC
              `
              sendJson(res, 200, {
                montagetypes: (
                  rows as Array<{
                    id: string
                    label: string
                    hint: string
                    agent_prompt: string
                    sort_order: number
                    actief: boolean
                  }>
                ).map((r) => ({
                  id: r.id,
                  label: r.label,
                  hint: r.hint,
                  agentPrompt: r.agent_prompt,
                  sortOrder: r.sort_order,
                  actief: r.actief,
                })),
              })
              return
            }
            if (req.method === 'PATCH') {
              const body = (await readJsonBody(req)) as {
                id?: string
                label?: string
                hint?: string
                agentPrompt?: string
                actief?: boolean
              }
              if (!body.id) {
                sendJson(res, 400, { error: 'id is verplicht' })
                return
              }
              await sql`
                UPDATE montagetype_defs SET
                  label = COALESCE(${body.label ?? null}, label),
                  hint = COALESCE(${body.hint ?? null}, hint),
                  agent_prompt = COALESCE(${body.agentPrompt ?? null}, agent_prompt),
                  actief = COALESCE(${body.actief ?? null}, actief),
                  updated_at = now()
                WHERE id = ${body.id}
              `
              const rows = await sql`
                SELECT id, label, hint, agent_prompt, sort_order, actief
                FROM montagetype_defs WHERE id = ${body.id} LIMIT 1
              `
              const r = (
                rows as Array<{
                  id: string
                  label: string
                  hint: string
                  agent_prompt: string
                  sort_order: number
                  actief: boolean
                }>
              )[0]!
              sendJson(res, 200, {
                montagetype: {
                  id: r.id,
                  label: r.label,
                  hint: r.hint,
                  agentPrompt: r.agent_prompt,
                  sortOrder: r.sort_order,
                  actief: r.actief,
                },
              })
              return
            }
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          if (pathname === '/api/admin-kleuren') {
            if (!isAuthed(req, root)) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }
            const { neon } = await import('@neondatabase/serverless')
            const dbUrl =
              process.env.DATABASE_URL ||
              (() => {
                for (const name of ['.env.local', '.env']) {
                  const p = resolve(root, name)
                  if (!existsSync(p)) continue
                  const line = readFileSync(p, 'utf8')
                    .split('\n')
                    .find((l) => l.startsWith('DATABASE_URL='))
                  if (line) {
                    return line
                      .slice('DATABASE_URL='.length)
                      .trim()
                      .replace(/^["']|["']$/g, '')
                  }
                }
                return undefined
              })()
            if (!dbUrl) throw new Error('DATABASE_URL ontbreekt')
            const sql = neon(dbUrl)
            if (req.method === 'GET') {
              const rows = await sql`
                SELECT id, naam, categorie, hex, staaltje_url, actief, sort_order
                FROM kleuren_catalogus
                ORDER BY categorie ASC, sort_order ASC, naam ASC
              `
              sendJson(res, 200, {
                kleuren: (
                  rows as Array<{
                    id: string
                    naam: string
                    categorie: string
                    hex: string | null
                    staaltje_url: string | null
                    actief: boolean
                    sort_order: number
                  }>
                ).map((r) => ({
                  id: r.id,
                  naam: r.naam,
                  categorie: r.categorie,
                  hex: r.hex,
                  staaltjeUrl: r.staaltje_url,
                  actief: r.actief,
                  sortOrder: r.sort_order,
                })),
              })
              return
            }
            if (req.method === 'POST' || req.method === 'PATCH') {
              const body = (await readJsonBody(req)) as {
                id?: string
                naam?: string
                categorie?: string
                hex?: string | null
                staaltjeUrl?: string | null
                actief?: boolean
                sortOrder?: number
              }
              const id = (body.id || body.naam || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-')
                .replace(/^-|-$/g, '')
              if (!id || !body.naam?.trim()) {
                sendJson(res, 400, { error: 'id en naam zijn verplicht' })
                return
              }
              const categorie =
                body.categorie === 'eiken' || body.categorie === 'ral'
                  ? body.categorie
                  : 'ral'
              await sql`
                INSERT INTO kleuren_catalogus (id, naam, categorie, hex, staaltje_url, actief, sort_order, updated_at)
                VALUES (
                  ${id}, ${body.naam.trim()}, ${categorie}, ${body.hex ?? null},
                  ${body.staaltjeUrl ?? null}, ${body.actief !== false},
                  ${body.sortOrder ?? 100}, now()
                )
                ON CONFLICT (id) DO UPDATE SET
                  naam = EXCLUDED.naam,
                  categorie = EXCLUDED.categorie,
                  hex = EXCLUDED.hex,
                  staaltje_url = EXCLUDED.staaltje_url,
                  actief = EXCLUDED.actief,
                  sort_order = EXCLUDED.sort_order,
                  updated_at = now()
              `
              const rows = await sql`
                SELECT id, naam, categorie, hex, staaltje_url, actief, sort_order
                FROM kleuren_catalogus WHERE id = ${id} LIMIT 1
              `
              const r = (
                rows as Array<{
                  id: string
                  naam: string
                  categorie: string
                  hex: string | null
                  staaltje_url: string | null
                  actief: boolean
                  sort_order: number
                }>
              )[0]!
              sendJson(res, 200, {
                kleur: {
                  id: r.id,
                  naam: r.naam,
                  categorie: r.categorie,
                  hex: r.hex,
                  staaltjeUrl: r.staaltje_url,
                  actief: r.actief,
                  sortOrder: r.sort_order,
                },
              })
              return
            }
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          if (pathname !== '/api/generate' || req.method !== 'POST') {
            next()
            return
          }

          const body = (await readJsonBody(req)) as unknown as GenBody
          const ip = getClientIp(
            req.headers as Record<string, string | string[] | undefined>,
            req.socket?.remoteAddress,
          )

          const result = await runGeneration(body, {
            apiKey: loadEnvKey(root),
            projectRoot: root,
            origin: `http://127.0.0.1:${server.config.server.port ?? 5173}`,
            ip,
          })

          sendJson(res, 200, result)
        } catch (err) {
          if (pathname === '/api/generate') {
            console.error('[api/generate]', err)
            const status =
              err instanceof Error &&
              (err as Error & { statusCode?: number }).statusCode === 429
                ? 429
                : 500
            sendJson(res, status, { error: formatGenerateError(err) })
            return
          }

          console.error('[api]', pathname, err)
          const status =
            err instanceof Error &&
            typeof (err as Error & { statusCode?: number }).statusCode === 'number'
              ? (err as Error & { statusCode: number }).statusCode
              : 500
          sendJson(res, status, {
            error: err instanceof Error ? err.message : 'Serverfout',
          })
        }
      })
    },
  }
}
