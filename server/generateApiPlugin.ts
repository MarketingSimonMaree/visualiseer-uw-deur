import type { Plugin } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatGenerateError,
  getClientIp,
  runGeneration,
  type GenBody,
} from './generateCore.ts'
import { listProducten } from './productenCore.ts'

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

export function generateApiPlugin(): Plugin {
  return {
    name: 'sm-generate-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        const pathname = url.split('?')[0]

        if (pathname === '/api/producten' && req.method === 'GET') {
          try {
            const qs = new URL(url, 'http://localhost').searchParams
            const producten = await listProducten(
              server.config.root,
              qs.get('montagetype'),
            )
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ producten }))
          } catch (err) {
            console.error('[api/producten]', err)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error:
                  err instanceof Error ? err.message : 'Producten laden mislukt',
              }),
            )
          }
          return
        }

        if (pathname !== '/api/generate' || req.method !== 'POST') {
          next()
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as GenBody
          const ip = getClientIp(
            req.headers as Record<string, string | string[] | undefined>,
            req.socket?.remoteAddress,
          )

          const result = await runGeneration(body, {
            apiKey: loadEnvKey(server.config.root),
            projectRoot: server.config.root,
            origin: `http://127.0.0.1:${server.config.server.port ?? 5173}`,
            ip,
          })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (err) {
          console.error('[api/generate]', err)
          const status =
            err instanceof Error &&
            (err as Error & { statusCode?: number }).statusCode === 429
              ? 429
              : 500
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: formatGenerateError(err) }))
        }
      })
    },
  }
}
