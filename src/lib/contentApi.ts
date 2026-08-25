import type { SituatieTekst, CatalogusFilter } from './adminApi'

export type PublicCatalogusFilter = Pick<
  CatalogusFilter,
  'id' | 'label' | 'sortOrder' | 'productIds'
>

export type SiteContent = {
  situatie: SituatieTekst
  filters: PublicCatalogusFilter[]
}

const FALLBACK_SITUATIE: SituatieTekst = {
  titelGold: 'Huidige',
  titel: 'situatie',
  lead:
    'Upload een foto van de deuropening zoals die nu is. Zo ziet u straks precies hoe de nieuwe deur past.',
  tips: [
    'Houd de deur recht en in het midden',
    'Breng de volledige deur en het kozijn in beeld',
    'Zorg voor voldoende ruimte rondom',
  ],
  tipsExtraTitel: 'Let daarnaast op:',
  tipsExtra: [
    'Zorg dat de deur gesloten is',
    'Maak de foto bij voldoende licht en zonder obstakels',
  ],
}

export async function fetchSiteContent(): Promise<SiteContent> {
  try {
    const res = await fetch('/api/site?resource=content')
    if (!res.ok) {
      return { situatie: FALLBACK_SITUATIE, filters: [] }
    }
    const data = (await res.json()) as Partial<SiteContent>
    return {
      situatie: data.situatie ?? FALLBACK_SITUATIE,
      filters: Array.isArray(data.filters) ? data.filters : [],
    }
  } catch {
    return { situatie: FALLBACK_SITUATIE, filters: [] }
  }
}
