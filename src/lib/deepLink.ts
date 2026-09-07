import { VISUALISEER_URL } from '../config'
import type { Montagetype, Product } from '../types/product'

export type DeepLinkParams = {
  productId: string | null
  montageId: string | null
}

/** Lees ?product= en optioneel ?montage= uit de huidige URL. */
export function parseDeepLink(
  search = typeof window !== 'undefined' ? window.location.search : '',
): DeepLinkParams {
  const params = new URLSearchParams(search)
  const productId =
    params.get('product')?.trim() ||
    params.get('deur')?.trim() ||
    null
  const montageId = params.get('montage')?.trim() || null
  return { productId, montageId }
}

export function productMontagetypes(product: Product): Montagetype[] {
  const types = product.montagetypes?.length
    ? product.montagetypes
    : product.montagetype
      ? [product.montagetype]
      : []
  return types as Montagetype[]
}

/**
 * Publieke deeplink voor een product (voor website-knoppen / beheer).
 * Voorbeeld: https://www.simonmaree.nl/visualiseer-uw-deur/?product=aluminium-voordeur-x
 */
export function buildVisualiseerProductUrl(
  productId: string,
  montageId?: string | null,
): string {
  const base = VISUALISEER_URL.endsWith('/')
    ? VISUALISEER_URL
    : `${VISUALISEER_URL}/`
  const url = new URL(base)
  url.searchParams.set('product', productId)
  if (montageId) url.searchParams.set('montage', montageId)
  return url.toString()
}

/** Verwijder product/montage uit de adresbalk zonder reload. */
export function clearDeepLinkFromUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('product')
  url.searchParams.delete('deur')
  url.searchParams.delete('montage')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

export function resolveMontagetypeForProduct(
  product: Product,
  preferredMontage: string | null,
): Montagetype | null {
  const types = productMontagetypes(product)
  if (types.length === 0) return null
  if (preferredMontage && types.includes(preferredMontage as Montagetype)) {
    return preferredMontage as Montagetype
  }
  if (types.length === 1) return types[0]!
  return null
}
