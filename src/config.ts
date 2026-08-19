/**
 * Centrale configuratie — Deurvisualisator (generatief).
 */
export const MAX_IMAGE_LONG_SIDE = 1536

/** Kleinere input naar het model = sneller + goedkoper. */
export const MAX_GEN_INPUT_LONG_SIDE = 1024

/** Max. betaalde generaties vóór e-mailgate (per sessie). */
export const SESSION_GENERATION_LIMIT = 5

/**
 * Harde daglimiet per browser (localStorage) én per IP (server).
 * Voorkomt dat bots/API-kosten doorlopen.
 */
export const DAILY_GENERATION_LIMIT = 20

export const IMAGE_MODEL = 'gpt-image-2'

/**
 * 'low' ≈ 15–30s, voldoende voor verkooppreview.
 * 'medium' scherper maar vaak 45–60s.
 */
export const IMAGE_QUALITY = 'low' as const
export const IMAGE_SIZE = '1024x1536' as const

export const SITE_URL = 'simonmaree.nl'

/** Knop "Offerte" op het resultaat. */
export const OFFERTE_URL = 'https://www.simonmaree.nl/prijsindicatie/'

/** Publieke URL van deze visualisator (voor links in e-mails). */
export const VISUALISEER_URL = 'https://www.simonmaree.nl/visualiseer-uw-deur/'
