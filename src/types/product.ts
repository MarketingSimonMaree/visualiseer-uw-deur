export type Montagetype =
  | 'deur-bestaand-kozijn'
  | 'deur-met-kozijn'
  | 'taatsdeur'
  | 'schuifdeur'
  | 'voordeur'
  | 'voordeur-met-kozijn'

export type Materiaal = 'hout' | 'staal' | 'aluminium'

export type KleurCategorie = 'ral' | 'eiken'

export interface KleurOptie {
  id: string
  naam: string
  categorie: KleurCategorie | string
  hex?: string | null
  staaltjeUrl?: string | null
}

export interface Product {
  id: string
  naam: string
  /** JPG/PNG van de website — transparantie niet nodig. */
  afbeeldingUrl: string
  /** Primair type (eerste van montagetypes) — backwards compatible. */
  montagetype: Montagetype
  /** Alle montage-opties waarin dit product mag verschijnen. */
  montagetypes: Montagetype[]
  materiaal: Materiaal
  /** Opgeloste kleuren uit de catalogus (of legacy strings). */
  kleuren: KleurOptie[]
  /** Voor catalogusfilters, bijv. "Signature", "Woods". */
  collectie: string
}

export interface MontagetypeDef {
  id: Montagetype | string
  label: string
  hint: string
  agentPrompt: string
  sortOrder: number
  actief: boolean
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

export const DEFAULT_AGENT_PROMPTS: Record<Montagetype, string> = {
  'deur-bestaand-kozijn':
    'Replace only the door leaf inside the existing frame. Keep the existing door frame (kozijn) completely unchanged.',
  'deur-met-kozijn':
    'Replace the door leaf and install a new matching frame around the opening. The new kozijn should fit the opening naturally.',
  taatsdeur:
    'Install a pivot/taats door. The door pivots on an axis (often floor-to-ceiling). Do not show traditional side hinges like a swing door.',
  schuifdeur:
    'Install a sliding door on a rail in front of the wall. The door must slide, not swing on hinges.',
  voordeur:
    'Replace only the exterior front door leaf in the existing exterior frame. Keep the existing outdoor frame unchanged.',
  'voordeur-met-kozijn':
    'Replace the exterior front door including a new exterior frame that fits the opening.',
}

export interface KamerFoto {
  previewUrl: string
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
  fromCache: boolean
  isRetry: boolean
}

export type AppStep =
  | 'situatie'
  | 'plan'
  | 'catalogus'
  | 'kleur'
  | 'resultaat'
