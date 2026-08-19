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
  verifyAdminToken,
  verifyLoginPassword,
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
): boolean {
  const secret = loadAdminSecret(root)
  if (!secret) return false
  return verifyAdminToken(
    bearerToken(req.headers.authorization),
    secret,
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

          if (pathname === '/api/admin/login' && req.method === 'POST') {
            const body = (await readJsonBody(req)) as { password?: string }
            const ok = await verifyLoginPassword(body.password, root)
            if (!ok) {
              sendJson(res, 401, { error: 'Onjuist wachtwoord' })
              return
            }
            sendJson(res, 200, { token: createAdminToken(loadAdminSecret(root)) })
            return
          }

          if (pathname === '/api/admin/password' && req.method === 'POST') {
            if (!isAuthed(req, root)) {
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
              currentPassword: body.currentPassword,
              newPassword: body.newPassword,
              projectRoot: root,
            })
            sendJson(res, 200, { ok: true })
            return
          }

          if (pathname === '/api/admin/producten') {
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
