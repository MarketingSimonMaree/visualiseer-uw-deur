import type { Product } from '../types/product'

/** Helper voor filterchips in ProductKiezer. */
export function collectiesVan(productenLijst: Product[]): string[] {
  return [...new Set(productenLijst.map((p) => p.collectie))].sort()
}

/** Fallback als de API (nog) niet bereikbaar is. */
export const fallbackProducten: Product[] = []
