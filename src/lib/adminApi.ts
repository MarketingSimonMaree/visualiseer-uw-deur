import type { Materiaal, Montagetype, Product } from '../types/product'

export type AdminProduct = Product & {
  paginaUrl: string
  actief: boolean
  updatedAt: string | null
}

export type ProductInput = {
  id: string
  naam: string
  afbeeldingUrl: string
  paginaUrl?: string
  montagetype: Montagetype | string
  materiaal: Materiaal | string
  collectie: string
  kleuren: string[]
  actief?: boolean
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
    if (res.status === 401) clearAdminToken()
    throw new Error(await readError(res))
  }
  return (await res.json()) as T
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<void> {
  // Geen oude Bearer-token meesturen bij login
  clearAdminToken()
  const res = await fetch('/api/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
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
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return data.product
}

export async function patchAdminProductApi(
  id: string,
  patch: Partial<ProductInput> & { actief?: boolean },
): Promise<AdminProduct> {
  const data = await adminFetch<{ product: AdminProduct }>(
    '/api/admin-producten',
    {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch }),
    },
  )
  return data.product
}

export async function changeAdminPasswordApi(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await adminFetch<{ ok: boolean }>('/api/admin-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}
