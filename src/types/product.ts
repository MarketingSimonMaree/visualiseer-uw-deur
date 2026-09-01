/** Montage-id’s zijn vrij (DB); bekende defaults hieronder voor fallbacks. */
export type Montagetype = string

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
  id: string
  label: string
  hint: string
  agentPrompt: string
  sortOrder: number
  actief: boolean
  /** Voordeuren: nooit een klink. Tuindeuren/binnendeuren: klink mag. */
  neverLeverHandle: boolean
}

export const MONTAGETYPE_LABELS: Record<string, string> = {
  'deur-bestaand-kozijn': 'Nieuwe deur in bestaand kozijn',
  'deur-met-kozijn': 'Nieuwe deur mét nieuw kozijn',
  taatsdeur: 'Taatsdeur plaatsen',
  schuifdeur: 'Schuifdeur plaatsen',
  voordeur: 'Nieuwe voordeur in bestaand kozijn',
  'voordeur-met-kozijn': 'Nieuwe voordeur mét nieuw kozijn',
  tuindeur: 'Nieuwe tuindeur in bestaand kozijn',
  'tuindeur-met-kozijn': 'Nieuwe tuindeur mét nieuw kozijn',
}

export const MONTAGETYPE_HINTS: Record<string, string> = {
  'deur-bestaand-kozijn': 'Alleen het deurblad wisselen',
  'deur-met-kozijn': 'Complete set: deur én kozijn',
  taatsdeur: 'Draait om een as, vaak vloer tot plafond',
  schuifdeur: 'Schuift voor de wand langs een rail',
  voordeur: 'Entree / voordeur in uw bestaande kozijn',
  'voordeur-met-kozijn': 'Entree / voordeur inclusief nieuw kozijn',
  tuindeur: 'Achterdeur / tuindeur in uw bestaande kozijn',
  'tuindeur-met-kozijn': 'Achterdeur / tuindeur inclusief nieuw kozijn',
}

export const DEFAULT_AGENT_PROMPTS: Record<string, string> = {
  'deur-bestaand-kozijn':
    'Replace only the door leaf inside the existing frame. Keep the existing door frame (kozijn) completely unchanged.',
  'deur-met-kozijn':
    'Replace the door leaf and install a new matching frame around the opening. The new kozijn should fit the opening naturally.',
  taatsdeur:
    'Install a pivot/taats door. The door pivots on an axis (often floor-to-ceiling). Do not show traditional side hinges like a swing door.',
  schuifdeur:
    'Install a sliding door on a rail in front of the wall. The door must slide, not swing on hinges.',
  voordeur:
    'Replace only the exterior front door leaf in the existing exterior frame. Keep the existing outdoor frame unchanged. FRONT DOOR: never a lever klink/deurkruk — only a round knob or a pull bar/stang if the product model shows one.',
  'voordeur-met-kozijn':
    'Replace the exterior front door including a new exterior frame that fits the opening. FRONT DOOR: never a lever klink/deurkruk — only a round knob or a pull bar/stang if the product model shows one.',
  tuindeur:
    'Replace only the garden/back door leaf (tuindeur/achterdeur) in the existing exterior frame. Keep the existing frame unchanged. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
  'tuindeur-met-kozijn':
    'Replace the garden/back door (tuindeur/achterdeur) including a new exterior frame that fits the opening. A lever handle (deurkruk/klink) is allowed for garden doors when appropriate.',
}

/** Publieke fallback als de API nog geen montagetypes teruggeeft. */
export const FALLBACK_MONTAGETYPES: MontagetypeDef[] = [
  {
    id: 'deur-bestaand-kozijn',
    label: MONTAGETYPE_LABELS['deur-bestaand-kozijn']!,
    hint: MONTAGETYPE_HINTS['deur-bestaand-kozijn']!,
    agentPrompt: DEFAULT_AGENT_PROMPTS['deur-bestaand-kozijn']!,
    sortOrder: 10,
    actief: true,
    neverLeverHandle: false,
  },
  {
    id: 'deur-met-kozijn',
    label: MONTAGETYPE_LABELS['deur-met-kozijn']!,
    hint: MONTAGETYPE_HINTS['deur-met-kozijn']!,
    agentPrompt: DEFAULT_AGENT_PROMPTS['deur-met-kozijn']!,
    sortOrder: 20,
    actief: true,
    neverLeverHandle: false,
  },
  {
    id: 'taatsdeur',
    label: MONTAGETYPE_LABELS.taatsdeur!,
    hint: MONTAGETYPE_HINTS.taatsdeur!,
    agentPrompt: DEFAULT_AGENT_PROMPTS.taatsdeur!,
    sortOrder: 30,
    actief: true,
    neverLeverHandle: false,
  },
  {
    id: 'schuifdeur',
    label: MONTAGETYPE_LABELS.schuifdeur!,
    hint: MONTAGETYPE_HINTS.schuifdeur!,
    agentPrompt: DEFAULT_AGENT_PROMPTS.schuifdeur!,
    sortOrder: 40,
    actief: true,
    neverLeverHandle: false,
  },
  {
    id: 'voordeur',
    label: MONTAGETYPE_LABELS.voordeur!,
    hint: MONTAGETYPE_HINTS.voordeur!,
    agentPrompt: DEFAULT_AGENT_PROMPTS.voordeur!,
    sortOrder: 50,
    actief: true,
    neverLeverHandle: true,
  },
  {
    id: 'voordeur-met-kozijn',
    label: MONTAGETYPE_LABELS['voordeur-met-kozijn']!,
    hint: MONTAGETYPE_HINTS['voordeur-met-kozijn']!,
    agentPrompt: DEFAULT_AGENT_PROMPTS['voordeur-met-kozijn']!,
    sortOrder: 60,
    actief: true,
    neverLeverHandle: true,
  },
  {
    id: 'tuindeur',
    label: MONTAGETYPE_LABELS.tuindeur!,
    hint: MONTAGETYPE_HINTS.tuindeur!,
    agentPrompt: DEFAULT_AGENT_PROMPTS.tuindeur!,
    sortOrder: 70,
    actief: true,
    neverLeverHandle: false,
  },
  {
    id: 'tuindeur-met-kozijn',
    label: MONTAGETYPE_LABELS['tuindeur-met-kozijn']!,
    hint: MONTAGETYPE_HINTS['tuindeur-met-kozijn']!,
    agentPrompt: DEFAULT_AGENT_PROMPTS['tuindeur-met-kozijn']!,
    sortOrder: 80,
    actief: true,
    neverLeverHandle: false,
  },
]

export function montageLabel(id: string, defs?: MontagetypeDef[]): string {
  const fromDb = defs?.find((m) => m.id === id)
  if (fromDb?.label) return fromDb.label
  return MONTAGETYPE_LABELS[id] ?? id
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
