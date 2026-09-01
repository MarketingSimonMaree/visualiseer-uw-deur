import type {
  KleurOptie,
  Materiaal,
  Montagetype,
  MontagetypeDef,
  Product,
} from '../types/product'

export type AdminProduct = Product & {
  paginaUrl: string
  actief: boolean
  updatedAt: string | null
  kleurIds: string[]
  beslagId?: string | null
  agentExtra?: string
}

export type ProductInput = {
  id: string
  naam: string
  afbeeldingUrl: string
  paginaUrl?: string
  montagetypes: Array<Montagetype | string>
  materiaal: Materiaal | string
  collectie: string
  kleurIds: string[]
  beslagId?: string | null
  agentExtra?: string
  actief?: boolean
}

export type AdminBeslag = {
  id: string
  label: string
  hint: string
  agentPrompt: string
  sortOrder: number
  actief: boolean
}

export type CollectieDefault = {
  collectie: string
  beslagId: string | null
  agentExtra: string
  montagetypes: string[]
  kleurIds: string[]
}

export type AdminKleur = KleurOptie & {
  actief: boolean
  sortOrder: number
}

const TOKEN_KEY = 'sm-admin-token'
const USER_KEY = 'sm-admin-user'

export function getAdminToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function getAdminUsername(): string | null {
  return sessionStorage.getItem(USER_KEY)
}

export function setAdminToken(token: string, username?: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
  if (username) sessionStorage.setItem(USER_KEY, username)
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

export class AdminApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

async function readError(res: Response): Promise<string> {
  const raw = await res.text()
  try {
    const data = raw ? (JSON.parse(raw) as { error?: string }) : {}
    return data.error || raw.slice(0, 200) || `Request mislukt (${res.status})`
  } catch {
    return raw.slice(0, 200) || `Request mislukt (${res.status})`
  }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    // Alleen bij echte auth-fout de sessie wissen — niet bij 500/404 van nieuwe routes
    if (res.status === 401) clearAdminToken()
    throw new AdminApiError(await readError(res), res.status)
  }
  return (await res.json()) as T
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<void> {
  clearAdminToken()
  const res = await fetch('/api/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { token: string; username: string }
  setAdminToken(data.token, data.username)
}

export async function fetchAdminProducten(): Promise<AdminProduct[]> {
  const data = await adminFetch<{ producten: AdminProduct[] }>(
    '/api/admin-producten',
  )
  return data.producten
}

export async function saveAdminProduct(
  input: ProductInput,
): Promise<AdminProduct> {
  const data = await adminFetch<{ product: AdminProduct }>(
    '/api/admin-producten',
    { method: 'POST', body: JSON.stringify(input) },
  )
  return data.product
}

export async function patchAdminProductApi(
  id: string,
  patch: Partial<ProductInput> & { actief?: boolean },
): Promise<AdminProduct> {
  const data = await adminFetch<{ product: AdminProduct }>(
    '/api/admin-producten',
    { method: 'PATCH', body: JSON.stringify({ id, ...patch }) },
  )
  return data.product
}

export async function changeAdminPasswordApi(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await adminFetch<{ ok: boolean }>('/api/admin-login?action=password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function fetchAdminMontagetypes(): Promise<MontagetypeDef[]> {
  const data = await adminFetch<{ montagetypes: MontagetypeDef[] }>(
    '/api/admin-montagetypes',
  )
  return data.montagetypes
}

export async function saveAdminMontagetype(
  input: Partial<MontagetypeDef> & { label: string },
  isNew: boolean,
): Promise<MontagetypeDef> {
  const data = await adminFetch<{ montagetype: MontagetypeDef }>(
    '/api/admin-montagetypes',
    {
      method: isNew ? 'POST' : 'PATCH',
      body: JSON.stringify(input),
    },
  )
  return data.montagetype
}

export async function patchAdminMontagetype(
  input: Partial<MontagetypeDef> & { id: string },
): Promise<MontagetypeDef> {
  return saveAdminMontagetype({ ...input, label: input.label ?? input.id }, false)
}

export async function fetchAdminKleuren(): Promise<AdminKleur[]> {
  const data = await adminFetch<{ kleuren: AdminKleur[] }>('/api/admin-kleuren')
  return data.kleuren
}

export async function saveAdminKleur(
  input: Partial<AdminKleur> & { id?: string; naam: string; categorie: string },
): Promise<AdminKleur> {
  const data = await adminFetch<{ kleur: AdminKleur }>('/api/admin-kleuren', {
    method: input.id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  })
  return data.kleur
}

export async function fetchAdminBeslag(): Promise<{
  beslag: AdminBeslag[]
  collectieDefaults: CollectieDefault[]
}> {
  return adminFetch('/api/admin-beslag')
}

export async function patchAdminBeslag(
  input: Partial<AdminBeslag> & { id: string },
): Promise<AdminBeslag> {
  const data = await adminFetch<{ beslag: AdminBeslag }>('/api/admin-beslag', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return data.beslag
}

export async function createAdminBeslag(
  input: Partial<AdminBeslag> & { label: string },
): Promise<AdminBeslag> {
  const data = await adminFetch<{ beslag: AdminBeslag }>('/api/admin-beslag', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.beslag
}

export async function patchCollectieDefault(
  input: CollectieDefault,
): Promise<CollectieDefault> {
  const data = await adminFetch<{ collectieDefault: CollectieDefault }>(
    '/api/admin-beslag',
    {
      method: 'PATCH',
      body: JSON.stringify({ kind: 'collectie', ...input }),
    },
  )
  return data.collectieDefault
}

export async function fetchAdminCollecties(): Promise<CollectieDefault[]> {
  const data = await adminFetch<{ collecties: CollectieDefault[] }>(
    '/api/admin-collecties',
  )
  return data.collecties
}

export async function saveAdminCollectie(
  input: CollectieDefault & { applyToProducts?: boolean },
): Promise<{ collectie: CollectieDefault; productsUpdated: number }> {
  return adminFetch('/api/admin-collecties', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export type AdminMailTemplate = {
  id: 'klant' | 'leads'
  label: string
  subject: string
  html: string
}

export type AdminMailMeta = {
  templates: AdminMailTemplate[]
  placeholders: Array<{ key: string; beschrijving: string }>
  bijlagen: { klant: string[]; leads: string[] }
  velden: string[]
  privacy: string
}

export async function fetchAdminMail(): Promise<AdminMailMeta> {
  return adminFetch('/api/admin-mail')
}

export async function patchAdminMailTemplate(
  input: Partial<AdminMailTemplate> & { id: 'klant' | 'leads' },
): Promise<AdminMailTemplate> {
  const data = await adminFetch<{ template: AdminMailTemplate }>(
    '/api/admin-mail',
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
  return data.template
}

export type SituatieTekst = {
  titelGold: string
  titel: string
  lead: string
  tips: string[]
  tipsExtraTitel: string
  tipsExtra: string[]
}

export type CatalogusFilter = {
  id: string
  label: string
  montagetype: string
  sortOrder: number
  actief: boolean
  productIds: string[]
}

export async function fetchAdminTeksten(): Promise<{ situatie: SituatieTekst }> {
  return adminFetch('/api/site?resource=teksten')
}

export async function saveAdminTeksten(
  situatie: SituatieTekst,
): Promise<SituatieTekst> {
  const data = await adminFetch<{ situatie: SituatieTekst }>(
    '/api/site?resource=teksten',
    {
      method: 'PATCH',
      body: JSON.stringify({ situatie }),
    },
  )
  return data.situatie
}

export async function fetchAdminFilters(): Promise<CatalogusFilter[]> {
  const data = await adminFetch<{ filters: CatalogusFilter[] }>(
    '/api/site?resource=filters',
  )
  return data.filters
}

export async function saveAdminFilter(
  input: Partial<CatalogusFilter> & { label: string },
  isNew: boolean,
): Promise<CatalogusFilter> {
  const data = await adminFetch<{ filter: CatalogusFilter }>(
    '/api/site?resource=filters',
    {
      method: isNew ? 'POST' : 'PATCH',
      body: JSON.stringify(input),
    },
  )
  return data.filter
}

export async function deleteAdminFilter(id: string): Promise<void> {
  await adminFetch('/api/site?resource=filters', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}
