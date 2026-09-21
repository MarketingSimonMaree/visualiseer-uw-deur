/** Normaliseer kleurcategorie tot een slug (vrij te kiezen in beheer). */
export function normalizeKleurCategorie(
  raw: string | null | undefined,
): string {
  const slug = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'ral'
}

/** Titel voor UI (beheer + klantkiezer). */
export function kleurCategorieLabel(categorie: string): string {
  const c = normalizeKleurCategorie(categorie)
  if (c === 'ral') return 'RAL-kleuren'
  if (c === 'hout' || c === 'eiken') return 'Houtkleuren'
  const words = c
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  if (/kleuren$/i.test(words)) return words
  return `${words}-kleuren`
}

/** Sorteervolgorde: RAL, hout/eiken, daarna alfabetisch. */
export function compareKleurCategorie(a: string, b: string): number {
  const rank = (c: string) => {
    const n = normalizeKleurCategorie(c)
    if (n === 'ral') return 0
    if (n === 'hout' || n === 'eiken') return 1
    return 2
  }
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  return normalizeKleurCategorie(a).localeCompare(normalizeKleurCategorie(b))
}
