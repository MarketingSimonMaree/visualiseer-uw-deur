import type { Plugin } from 'vite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatGenerateError,
  getClientIp,
  runGeneration,
  type GenBody,
} from './generateCore.ts'
import { processMailResultaat, loadMailTemplates, saveMailTemplate } from '../shared/mailResultaatCore.ts'
import { MAIL_PLACEHOLDERS } from '../shared/mailTemplates.ts'
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
import {
  deleteAdminFilter,
  getAdminTeksten,
  getPublicContent,
  listAdminFilters,
  saveAdminTeksten,
  upsertAdminFilter,
} from './contentAdminCore.ts'

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
            req.method === 'POST' &&
            !url.includes('action=password')
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
              pathname === '/api/admin/password' ||
              (pathname === '/api/admin-login' &&
                url.includes('action=password'))) &&
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
            await sql`ALTER TABLE montagetype_defs ADD COLUMN IF NOT EXISTS never_lever_handle BOOLEAN NOT NULL DEFAULT false`
            await sql`
              UPDATE montagetype_defs SET never_lever_handle = true
              WHERE id IN ('voordeur', 'voordeur-met-kozijn')
            `
            await sql`
              INSERT INTO montagetype_defs (
                id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, updated_at
              ) VALUES
                ('tuindeur', 'Nieuwe tuindeur in bestaand kozijn',
                 'Achterdeur / tuindeur in uw bestaande kozijn',
                 'Replace only the garden/back door leaf (tuindeur/achterdeur) in the existing exterior frame. Keep the existing frame unchanged. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
                 70, true, false, now()),
                ('tuindeur-met-kozijn', 'Nieuwe tuindeur mét nieuw kozijn',
                 'Achterdeur / tuindeur inclusief nieuw kozijn',
                 'Replace the garden/back door (tuindeur/achterdeur) including a new exterior frame that fits the opening. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
                 80, true, false, now())
              ON CONFLICT (id) DO NOTHING
            `
            const mapM = (r: {
              id: string
              label: string
              hint: string
              agent_prompt: string
              sort_order: number
              actief: boolean
              never_lever_handle: boolean | null
            }) => ({
              id: r.id,
              label: r.label,
              hint: r.hint,
              agentPrompt: r.agent_prompt,
              sortOrder: r.sort_order,
              actief: r.actief !== false,
              neverLeverHandle: Boolean(r.never_lever_handle),
            })

            if (req.method === 'GET') {
              const rows = await sql`
                SELECT id, label, hint, agent_prompt, sort_order, actief, never_lever_handle
                FROM montagetype_defs ORDER BY sort_order ASC, label ASC
              `
              sendJson(res, 200, {
                montagetypes: (
                  rows as Array<Parameters<typeof mapM>[0]>
                ).map(mapM),
              })
              return
            }

            if (req.method === 'POST' || req.method === 'PATCH') {
              const body = (await readJsonBody(req)) as {
                id?: string
                label?: string
                hint?: string
                agentPrompt?: string
                actief?: boolean
                sortOrder?: number
                neverLeverHandle?: boolean
              }
              const label = body.label?.trim()
              if (!label) {
                sendJson(res, 400, { error: 'label is verplicht' })
                return
              }
              const id = (body.id || label)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
              if (!id) {
                sendJson(res, 400, { error: 'id is verplicht' })
                return
              }
              if (req.method === 'POST') {
                await sql`
                  INSERT INTO montagetype_defs (
                    id, label, hint, agent_prompt, sort_order, actief, never_lever_handle, updated_at
                  ) VALUES (
                    ${id}, ${label}, ${body.hint ?? ''}, ${body.agentPrompt ?? ''},
                    ${body.sortOrder ?? 100}, ${body.actief !== false},
                    ${Boolean(body.neverLeverHandle)}, now()
                  )
                  ON CONFLICT (id) DO UPDATE SET
                    label = EXCLUDED.label,
                    hint = EXCLUDED.hint,
                    agent_prompt = EXCLUDED.agent_prompt,
                    sort_order = EXCLUDED.sort_order,
                    actief = EXCLUDED.actief,
                    never_lever_handle = EXCLUDED.never_lever_handle,
                    updated_at = now()
                `
              } else {
                const existing = await sql`
                  SELECT id, label, hint, agent_prompt, sort_order, actief, never_lever_handle
                  FROM montagetype_defs WHERE id = ${id} LIMIT 1
                `
                const row = (existing as Array<Parameters<typeof mapM>[0]>)[0]
                if (!row) {
                  sendJson(res, 404, { error: 'Montagetype niet gevonden' })
                  return
                }
                await sql`
                  UPDATE montagetype_defs SET
                    label = ${body.label ?? row.label},
                    hint = ${body.hint ?? row.hint},
                    agent_prompt = ${body.agentPrompt ?? row.agent_prompt},
                    actief = ${body.actief ?? row.actief},
                    sort_order = ${body.sortOrder ?? row.sort_order},
                    never_lever_handle = ${
                      body.neverLeverHandle !== undefined
                        ? Boolean(body.neverLeverHandle)
                        : Boolean(row.never_lever_handle)
                    },
                    updated_at = now()
                  WHERE id = ${id}
                `
              }
              const rows = await sql`
                SELECT id, label, hint, agent_prompt, sort_order, actief, never_lever_handle
                FROM montagetype_defs WHERE id = ${id} LIMIT 1
              `
              sendJson(res, 200, {
                montagetype: mapM(
                  (rows as Array<Parameters<typeof mapM>[0]>)[0]!,
                ),
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

          if (pathname === '/api/admin-beslag') {
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

            const mapBeslag = (r: {
              id: string
              label: string
              hint: string
              agent_prompt: string
              sort_order: number
              actief: boolean
            }) => ({
              id: r.id,
              label: r.label,
              hint: r.hint,
              agentPrompt: r.agent_prompt,
              sortOrder: r.sort_order,
              actief: r.actief !== false,
            })

            if (req.method === 'GET') {
              const [beslagRows, collectieRows] = await Promise.all([
                sql`
                  SELECT id, label, hint, agent_prompt, sort_order, actief
                  FROM beslag_defs
                  ORDER BY sort_order ASC, label ASC
                `,
                sql`
                  SELECT collectie, beslag_id, agent_extra
                  FROM collectie_defaults
                  ORDER BY collectie ASC
                `,
              ])
              sendJson(res, 200, {
                beslag: (
                  beslagRows as Array<Parameters<typeof mapBeslag>[0]>
                ).map(mapBeslag),
                collectieDefaults: (
                  collectieRows as Array<{
                    collectie: string
                    beslag_id: string | null
                    agent_extra: string
                  }>
                ).map((r) => ({
                  collectie: r.collectie,
                  beslagId: r.beslag_id,
                  agentExtra: r.agent_extra ?? '',
                })),
              })
              return
            }

            if (req.method === 'PATCH') {
              const body = (await readJsonBody(req)) as {
                kind?: 'beslag' | 'collectie'
                id?: string
                collectie?: string
                label?: string
                hint?: string
                agentPrompt?: string
                actief?: boolean
                sortOrder?: number
                beslagId?: string | null
                agentExtra?: string
              }
              if (body.kind === 'collectie') {
                const collectie = body.collectie?.trim()
                if (!collectie) {
                  sendJson(res, 400, { error: 'collectie is verplicht' })
                  return
                }
                const existing = await sql`
                  SELECT collectie, beslag_id, agent_extra
                  FROM collectie_defaults WHERE collectie = ${collectie} LIMIT 1
                `
                const cur = (
                  existing as Array<{
                    beslag_id: string | null
                    agent_extra: string
                  }>
                )[0]
                const beslagId =
                  body.beslagId !== undefined
                    ? body.beslagId
                    : (cur?.beslag_id ?? null)
                const agentExtra =
                  body.agentExtra !== undefined
                    ? body.agentExtra
                    : (cur?.agent_extra ?? '')
                await sql`
                  INSERT INTO collectie_defaults (collectie, beslag_id, agent_extra, updated_at)
                  VALUES (${collectie}, ${beslagId}, ${agentExtra}, now())
                  ON CONFLICT (collectie) DO UPDATE SET
                    beslag_id = EXCLUDED.beslag_id,
                    agent_extra = EXCLUDED.agent_extra,
                    updated_at = now()
                `
                sendJson(res, 200, {
                  collectieDefault: { collectie, beslagId, agentExtra },
                })
                return
              }
              if (!body.id) {
                sendJson(res, 400, { error: 'id is verplicht' })
                return
              }
              const existing = await sql`
                SELECT id, label, hint, agent_prompt, sort_order, actief
                FROM beslag_defs WHERE id = ${body.id} LIMIT 1
              `
              const row = (existing as Array<Parameters<typeof mapBeslag>[0]>)[0]
              if (!row) {
                sendJson(res, 404, { error: 'Beslag niet gevonden' })
                return
              }
              await sql`
                UPDATE beslag_defs SET
                  label = ${body.label ?? row.label},
                  hint = ${body.hint ?? row.hint},
                  agent_prompt = ${body.agentPrompt ?? row.agent_prompt},
                  actief = ${body.actief ?? row.actief},
                  sort_order = ${body.sortOrder ?? row.sort_order},
                  updated_at = now()
                WHERE id = ${body.id}
              `
              const updated = await sql`
                SELECT id, label, hint, agent_prompt, sort_order, actief
                FROM beslag_defs WHERE id = ${body.id} LIMIT 1
              `
              sendJson(res, 200, {
                beslag: mapBeslag(
                  (updated as Array<Parameters<typeof mapBeslag>[0]>)[0]!,
                ),
              })
              return
            }

            if (req.method === 'POST') {
              const body = (await readJsonBody(req)) as {
                id?: string
                label?: string
                hint?: string
                agentPrompt?: string
                sortOrder?: number
              }
              const id = (body.id || body.label || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-')
                .replace(/^-|-$/g, '')
              if (!id || !body.label?.trim()) {
                sendJson(res, 400, { error: 'id en label zijn verplicht' })
                return
              }
              await sql`
                INSERT INTO beslag_defs (id, label, hint, agent_prompt, sort_order, actief, updated_at)
                VALUES (
                  ${id}, ${body.label.trim()}, ${body.hint ?? ''},
                  ${body.agentPrompt ?? ''}, ${body.sortOrder ?? 100}, true, now()
                )
                ON CONFLICT (id) DO UPDATE SET
                  label = EXCLUDED.label,
                  hint = EXCLUDED.hint,
                  agent_prompt = EXCLUDED.agent_prompt,
                  sort_order = EXCLUDED.sort_order,
                  updated_at = now()
              `
              const rows = await sql`
                SELECT id, label, hint, agent_prompt, sort_order, actief
                FROM beslag_defs WHERE id = ${id} LIMIT 1
              `
              sendJson(res, 200, {
                beslag: mapBeslag(
                  (rows as Array<Parameters<typeof mapBeslag>[0]>)[0]!,
                ),
              })
              return
            }

            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          if (pathname === '/api/admin-collecties') {
            if (!isAuthed(req, root)) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }
            const { neon } = await import('@neondatabase/serverless')
            if (!process.env.DATABASE_URL) {
              for (const name of ['.env.local', '.env']) {
                const p = resolve(root, name)
                if (!existsSync(p)) continue
                for (const line of readFileSync(p, 'utf8').split('\n')) {
                  const m = /^(DATABASE_URL)=(.*)$/.exec(line.trim())
                  if (!m || process.env[m[1]!]) continue
                  process.env[m[1]!] = m[2]!
                    .trim()
                    .replace(/^["']|["']$/g, '')
                }
              }
            }
            if (!process.env.DATABASE_URL) {
              sendJson(res, 500, { error: 'DATABASE_URL ontbreekt' })
              return
            }
            try {
              const sql = neon(process.env.DATABASE_URL)
              await sql`
                CREATE TABLE IF NOT EXISTS collectie_defaults (
                  collectie TEXT PRIMARY KEY,
                  beslag_id TEXT,
                  agent_extra TEXT NOT NULL DEFAULT '',
                  montagetypes JSONB NOT NULL DEFAULT '[]'::jsonb,
                  kleur_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
              `
              await sql`ALTER TABLE collectie_defaults ADD COLUMN IF NOT EXISTS montagetypes JSONB NOT NULL DEFAULT '[]'::jsonb`
              await sql`ALTER TABLE collectie_defaults ADD COLUMN IF NOT EXISTS kleur_ids JSONB NOT NULL DEFAULT '[]'::jsonb`

              const parseArr = (value: unknown): string[] => {
                if (Array.isArray(value)) return value.map(String)
                if (typeof value === 'string') {
                  try {
                    const parsed = JSON.parse(value) as unknown
                    return Array.isArray(parsed) ? parsed.map(String) : []
                  } catch {
                    return []
                  }
                }
                return []
              }

              if (req.method === 'GET') {
                const productCollecties = await sql`
                  SELECT DISTINCT collectie FROM producten
                  WHERE collectie IS NOT NULL AND trim(collectie) <> ''
                `
                for (const row of productCollecties as Array<{ collectie: string }>) {
                  const name = row.collectie.trim()
                  if (!name) continue
                  await sql`
                    INSERT INTO collectie_defaults (collectie, beslag_id, agent_extra, montagetypes, kleur_ids, updated_at)
                    VALUES (${name}, NULL, '', '[]'::jsonb, '[]'::jsonb, now())
                    ON CONFLICT (collectie) DO NOTHING
                  `
                }
                const rows = await sql`
                  SELECT collectie, beslag_id, agent_extra, montagetypes, kleur_ids
                  FROM collectie_defaults ORDER BY collectie ASC
                `
                sendJson(res, 200, {
                  collecties: (
                    rows as Array<{
                      collectie: string
                      beslag_id: string | null
                      agent_extra: string
                      montagetypes: unknown
                      kleur_ids: unknown
                    }>
                  ).map((r) => ({
                    collectie: r.collectie,
                    beslagId: r.beslag_id,
                    agentExtra: r.agent_extra ?? '',
                    montagetypes: parseArr(r.montagetypes),
                    kleurIds: parseArr(r.kleur_ids),
                  })),
                })
                return
              }

              if (req.method === 'PATCH') {
                const body = (await readJsonBody(req)) as {
                  collectie?: string
                  beslagId?: string | null
                  agentExtra?: string
                  montagetypes?: string[]
                  kleurIds?: string[]
                  applyToProducts?: boolean
                }
                const collectie = body.collectie?.trim()
                if (!collectie) {
                  sendJson(res, 400, { error: 'collectie is verplicht' })
                  return
                }
                const existing = await sql`
                  SELECT collectie, beslag_id, agent_extra, montagetypes, kleur_ids
                  FROM collectie_defaults WHERE collectie = ${collectie} LIMIT 1
                `
                const cur = (
                  existing as Array<{
                    beslag_id: string | null
                    agent_extra: string
                    montagetypes: unknown
                    kleur_ids: unknown
                  }>
                )[0]
                const beslagId =
                  body.beslagId !== undefined
                    ? body.beslagId
                    : (cur?.beslag_id ?? null)
                const agentExtra =
                  body.agentExtra !== undefined
                    ? body.agentExtra
                    : (cur?.agent_extra ?? '')
                const montagetypes =
                  body.montagetypes !== undefined
                    ? body.montagetypes.map(String)
                    : parseArr(cur?.montagetypes)
                const kleurIds =
                  body.kleurIds !== undefined
                    ? body.kleurIds.map(String)
                    : parseArr(cur?.kleur_ids)

                await sql`
                  INSERT INTO collectie_defaults (
                    collectie, beslag_id, agent_extra, montagetypes, kleur_ids, updated_at
                  ) VALUES (
                    ${collectie}, ${beslagId}, ${agentExtra},
                    ${JSON.stringify(montagetypes)}::jsonb,
                    ${JSON.stringify(kleurIds)}::jsonb,
                    now()
                  )
                  ON CONFLICT (collectie) DO UPDATE SET
                    beslag_id = EXCLUDED.beslag_id,
                    agent_extra = EXCLUDED.agent_extra,
                    montagetypes = EXCLUDED.montagetypes,
                    kleur_ids = EXCLUDED.kleur_ids,
                    updated_at = now()
                `

                let productsUpdated = 0
                if (body.applyToProducts) {
                  const productRows = await sql`
                    SELECT id, montagetypes, kleur_ids, beslag_id, agent_extra, montagetype
                    FROM producten WHERE collectie = ${collectie}
                  `
                  for (const p of productRows as Array<{
                    id: string
                    montagetypes: unknown
                    kleur_ids: unknown
                    beslag_id: string | null
                    agent_extra: string | null
                    montagetype: string
                  }>) {
                    const nextTypes =
                      montagetypes.length > 0
                        ? montagetypes
                        : parseArr(p.montagetypes)
                    const nextPrimary = nextTypes[0] ?? p.montagetype
                    const nextKleuren =
                      kleurIds.length > 0 ? kleurIds : parseArr(p.kleur_ids)
                    const nextBeslag = beslagId ?? p.beslag_id
                    const nextExtra =
                      agentExtra.trim() !== ''
                        ? agentExtra
                        : (p.agent_extra ?? '')
                    await sql`
                      UPDATE producten SET
                        montagetypes = ${JSON.stringify(nextTypes)}::jsonb,
                        montagetype = ${nextPrimary},
                        kleur_ids = ${JSON.stringify(nextKleuren)}::jsonb,
                        beslag_id = ${nextBeslag},
                        agent_extra = ${nextExtra},
                        updated_at = now()
                      WHERE id = ${p.id}
                    `
                    productsUpdated += 1
                  }
                }

                sendJson(res, 200, {
                  collectie: {
                    collectie,
                    beslagId,
                    agentExtra,
                    montagetypes,
                    kleurIds,
                  },
                  productsUpdated,
                })
                return
              }

              sendJson(res, 405, { error: 'Method not allowed' })
            } catch (err) {
              sendJson(res, 500, {
                error:
                  err instanceof Error
                    ? err.message
                    : 'Collecties laden mislukt',
              })
            }
            return
          }

          if (pathname === '/api/admin-mail') {
            if (!isAuthed(req, root)) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }
            if (!process.env.DATABASE_URL) {
              for (const name of ['.env.local', '.env']) {
                const p = resolve(root, name)
                if (!existsSync(p)) continue
                for (const line of readFileSync(p, 'utf8').split('\n')) {
                  const m =
                    /^(DATABASE_URL|MAILJET_API_KEY|MAILJET_API_SECRET|MAIL_FROM|LEADS_EMAIL)=(.*)$/.exec(
                      line.trim(),
                    )
                  if (!m || process.env[m[1]!]) continue
                  process.env[m[1]!] = m[2]!
                    .trim()
                    .replace(/^["']|["']$/g, '')
                }
              }
            }
            try {
              if (req.method === 'GET') {
                const templates = await loadMailTemplates()
                sendJson(res, 200, {
                  templates,
                  placeholders: MAIL_PLACEHOLDERS,
                  bijlagen: {
                    klant: ['visualisatie (resultaatbeeld)'],
                    leads: [
                      'visualisatie (resultaatbeeld)',
                      'originele kamerfoto van de klant',
                    ],
                  },
                  velden: [
                    'naam',
                    'woonplaats',
                    'e-mailadres',
                    'product',
                    'kleur',
                    'montagetype',
                    'prijsindicatie (ja/nee)',
                    'bron (mail of offerte)',
                  ],
                  privacy:
                    'Klantgegevens worden niet bewaard in de database; ze gaan alleen mee in de verstuurde e-mails.',
                })
                return
              }
              if (req.method === 'PATCH') {
                const body = (await readJsonBody(req)) as {
                  id?: 'klant' | 'leads'
                  label?: string
                  subject?: string
                  html?: string
                }
                if (body.id !== 'klant' && body.id !== 'leads') {
                  sendJson(res, 400, { error: 'id moet klant of leads zijn' })
                  return
                }
                const template = await saveMailTemplate({
                  id: body.id,
                  label: body.label,
                  subject: body.subject,
                  html: body.html,
                })
                sendJson(res, 200, { template })
                return
              }
              sendJson(res, 405, { error: 'Method not allowed' })
            } catch (err) {
              sendJson(res, 500, {
                error:
                  err instanceof Error
                    ? err.message
                    : 'Mail-templates laden mislukt',
              })
            }
            return
          }

          if (pathname === '/api/mail-resultaat') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Alleen POST is toegestaan.' })
              return
            }
            try {
              const body = (await readJsonBody(req)) as {
                naam?: string
                woonplaats?: string
                email?: string
                prijsindicatie?: boolean
                bron?: 'mail' | 'offerte'
                productId?: string
                productNaam?: string
                kleur?: string
                montagetype?: string
                imageBase64?: string
                mimeType?: string
                roomImageBase64?: string
                roomMimeType?: string
              }
              if (
                !process.env.DATABASE_URL ||
                !process.env.MAILJET_API_KEY ||
                !process.env.MAILJET_API_SECRET
              ) {
                for (const name of ['.env.local', '.env']) {
                  const p = resolve(root, name)
                  if (!existsSync(p)) continue
                  for (const line of readFileSync(p, 'utf8').split('\n')) {
                    const m =
                      /^(DATABASE_URL|MAILJET_API_KEY|MAILJET_API_SECRET|MAIL_FROM|LEADS_EMAIL)=(.*)$/.exec(
                        line.trim(),
                      )
                    if (!m || process.env[m[1]!]) continue
                    process.env[m[1]!] = m[2]!
                      .trim()
                      .replace(/^["']|["']$/g, '')
                  }
                }
              }
              const result = await processMailResultaat({
                naam: body.naam ?? '',
                woonplaats: body.woonplaats ?? '',
                email: body.email ?? '',
                prijsindicatie: Boolean(body.prijsindicatie),
                bron: body.bron === 'offerte' ? 'offerte' : 'mail',
                productId: body.productId,
                productNaam: body.productNaam ?? '',
                kleur: body.kleur ?? '',
                montagetype: body.montagetype,
                imageBase64: body.imageBase64 ?? '',
                mimeType: body.mimeType,
                roomImageBase64: body.roomImageBase64,
                roomMimeType: body.roomMimeType,
              })
              sendJson(res, 200, result)
            } catch (err) {
              const message =
                err instanceof Error ? err.message : 'Mail-aanvraag mislukt'
              const status =
                message.includes('Ongeldig') ||
                message.includes('Ontbrekende') ||
                message.includes('verplicht')
                  ? 400
                  : 500
              sendJson(res, status, { error: message })
            }
            return
          }

          if (
            pathname === '/api/content' ||
            (pathname === '/api/site' &&
              (url.includes('resource=content') ||
                !url.includes('resource=')))
          ) {
            if (req.method === 'GET') {
              sendJson(res, 200, await getPublicContent(root))
              return
            }
          }

          if (
            pathname === '/api/admin-teksten' ||
            (pathname === '/api/site' && url.includes('resource=teksten'))
          ) {
            if (!isAuthed(req, root)) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }
            if (req.method === 'GET') {
              sendJson(res, 200, await getAdminTeksten(root))
              return
            }
            if (req.method === 'PATCH') {
              const body = (await readJsonBody(req)) as {
                situatie?: Parameters<typeof saveAdminTeksten>[1]
              }
              sendJson(
                res,
                200,
                await saveAdminTeksten(root, body.situatie ?? {}),
              )
              return
            }
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          if (
            pathname === '/api/admin-filters' ||
            (pathname === '/api/site' && url.includes('resource=filters'))
          ) {
            if (!isAuthed(req, root)) {
              sendJson(res, 401, { error: 'Niet ingelogd' })
              return
            }
            if (req.method === 'GET') {
              sendJson(res, 200, await listAdminFilters(root))
              return
            }
            if (req.method === 'POST' || req.method === 'PATCH') {
              const body = (await readJsonBody(req)) as {
                id?: string
                label?: string
                sortOrder?: number
                actief?: boolean
                productIds?: string[]
              }
              sendJson(
                res,
                200,
                await upsertAdminFilter(root, body, req.method === 'POST'),
              )
              return
            }
            if (req.method === 'DELETE') {
              const body = (await readJsonBody(req)) as { id?: string }
              if (!body.id?.trim()) {
                sendJson(res, 400, { error: 'id is verplicht' })
                return
              }
              sendJson(res, 200, await deleteAdminFilter(root, body.id.trim()))
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
