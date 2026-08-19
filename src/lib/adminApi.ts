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

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers })
  const raw = await res.text()
  let data = {} as T & { error?: string }
  try {
    data = raw ? (JSON.parse(raw) as T & { error?: string }) : ({} as T & { error?: string })
  } catch {
    data = { error: raw.slice(0, 200) || `Request mislukt (${res.status})` } as T & {
      error?: string
    }
  }
  if (!res.ok) {
    if (res.status === 401) clearAdminToken()
    throw new Error(data.error ?? `Request mislukt (${res.status})`)
  }
  return data
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<void> {
  const data = await adminFetch<{ token: string; username: string }>(
    '/api/admin/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
  )
  setAdminToken(data.token, data.username)
}

export async function fetchAdminProducten(): Promise<AdminProduct[]> {
  const data = await adminFetch<{ producten: AdminProduct[] }>(
    '/api/admin/producten',
  )
  return data.producten
}

export async function saveAdminProduct(
  input: ProductInput,
): Promise<AdminProduct> {
  const data = await adminFetch<{ product: AdminProduct }>(
    '/api/admin/producten',
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
    '/api/admin/producten',
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
  await adminFetch<{ ok: boolean }>('/api/admin/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}
