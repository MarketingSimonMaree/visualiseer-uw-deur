import type { Product } from '../types/product'

export async function fetchProducten(): Promise<Product[]> {
  const res = await fetch('/api/producten')
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Producten laden mislukt (${res.status})`)
  }
  const data = (await res.json()) as { producten?: Product[] }
  return Array.isArray(data.producten) ? data.producten : []
}
