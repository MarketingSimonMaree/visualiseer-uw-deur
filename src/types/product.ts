export type Montagetype =
  | 'deur-bestaand-kozijn'
  | 'deur-met-kozijn'
  | 'taatsdeur'
  | 'schuifdeur'
  | 'voordeur'
  | 'voordeur-met-kozijn'

export type Materiaal = 'hout' | 'staal' | 'aluminium'

export interface Product {
  id: string
  naam: string
  /** JPG/PNG van de website — transparantie niet nodig. */
  afbeeldingUrl: string
  montagetype: Montagetype
  materiaal: Materiaal
  /** RAL-codes of textuurnamen (indicatief). */
  kleuren: string[]
  /** Voor catalogusfilters, bijv. "Signature", "Woods". */
  collectie: string
}

export const MONTAGETYPE_LABELS: Record<Montagetype, string> = {
  'deur-bestaand-kozijn': 'Nieuwe deur in bestaand kozijn',
  'deur-met-kozijn': 'Nieuwe deur mét nieuw kozijn',
  taatsdeur: 'Taatsdeur plaatsen',
  schuifdeur: 'Schuifdeur plaatsen',
  voordeur: 'Nieuwe voordeur in bestaand kozijn',
  'voordeur-met-kozijn': 'Nieuwe voordeur mét nieuw kozijn',
}

export const MONTAGETYPE_HINTS: Record<Montagetype, string> = {
  'deur-bestaand-kozijn': 'Alleen het deurblad wisselen',
  'deur-met-kozijn': 'Complete set: deur én kozijn',
  taatsdeur: 'Draait om een as, vaak vloer tot plafond',
  schuifdeur: 'Schuift voor de wand langs een rail',
  voordeur: 'Buitendeur in uw bestaande kozijn',
  'voordeur-met-kozijn': 'Buitendeur inclusief nieuw kozijn',
}

export interface KamerFoto {
  /** Object-URL of data-URL voor weergave. */
  previewUrl: string
  /** JPEG blob na HEIC/EXIF/resize (zonder EXIF). */
  blob: Blob
  width: number
  height: number
}

export interface GeneratieResultaat {
  id: string
  cacheKey: string
  imageUrl: string
  productId: string
  productNaam: string
  kleur: string
  createdAt: number
  /** true = uit cache, telt niet mee voor limiet. */
  fromCache: boolean
  /** true = retry van een mislukte/slechte generatie. */
  isRetry: boolean
}

export type AppStep =
  | 'situatie'
  | 'plan'
  | 'catalogus'
  | 'kleur'
  | 'resultaat'
