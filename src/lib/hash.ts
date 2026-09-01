/** SHA-256 hex van een Blob of string. */
export async function sha256Hex(input: Blob | string): Promise<string> {
  const buffer =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : await input.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Bump bij harde promptwijzigingen zodat oude cache niet terugkomt. */
export const PROMPT_CACHE_VERSION = 'v6-tuindeur-montages'

/** Cache-sleutel: foto + deur + kleur (+ promptversie). */
export async function buildCacheKey(
  roomBlob: Blob,
  productId: string,
  kleur: string,
): Promise<string> {
  const photoHash = await sha256Hex(roomBlob)
  return sha256Hex(`${PROMPT_CACHE_VERSION}|${photoHash}|${productId}|${kleur}`)
}
