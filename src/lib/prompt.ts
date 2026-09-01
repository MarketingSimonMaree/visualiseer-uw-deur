/**
 * Keiharde basisregels die altijd meekomen bij beeldgeneratie.
 * Beslag-specifieke regels komen apart via beslagAgentPrompt.
 * Montagetype-specifieke regels via montageAgentPrompt + neverLeverHandle.
 */
export const HARD_VISUAL_RULES = [
  'HARD RULES — these override anything visible in either photo:',
  '1. The door must be FULLY CLOSED, flush in the opening. Never ajar, never open, never swinging.',
  '2. HINGE vs HANDLE SIDE (critical): Keep the hinge side exactly as in Image 1 (the room photo). Put operable hardware ALWAYS on the OPPOSITE side of the hinges — never on the hinge side. Ignore the handle side shown on the product photo.',
  '3. GLASS / NO-GLASS LAYOUT (critical): Copy solid panels vs glass STRICTLY from Image 2 (the product). If Image 2 has NO glass, the new door must be FULLY OPAQUE with ZERO glass or glazing — even when Image 1 shows a glazed door. Never invent glass, sidelights, or vision panels that are not on Image 2. If Image 2 has glass, place clear glass only in those same panel positions.',
  '4. If there IS glass from Image 2, it must be CLEAR and TRANSPARENT (see-through). Never frosted, sandblasted, milky, smoked-opaque, or privacy glass.',
  '5. From Image 2, copy only the door design: proportions, panels, frame profile, and material look. Ignore its open/closed state. Follow the hardware guidance for handle/pull type.',
].join(' ')

/** Extra harde regels voor voordeuren — nooit een binnenklink. */
export const FRONT_DOOR_HARD_RULES = [
  'FRONT DOOR HARDWARE (critical — exterior voordeur / entree):',
  'NEVER use an interior lever handle / deurkruk / klink.',
  'Dutch front doors do not get a lever klink.',
  'Use ONLY exterior-appropriate hardware: a round/oval door knob (deurknop) OR a pull bar/stang IF Image 2 (product) already shows that hardware.',
  'If Image 2 shows a knob, use a knob. If Image 2 shows a vertical or horizontal pull bar/stang, use that same style.',
  'If Image 2 hardware is unclear, prefer a round door knob — never a lever klink.',
].join(' ')

export function buildGeneratePrompt(opts: {
  productNaam: string
  kleur: string
  montagetype: string
  montageAgentPrompt?: string
  beslagAgentPrompt?: string
  agentExtra?: string
  /** true = voordeur-achtig (geen klink). false = tuindeur/binnen (klink mag). */
  neverLeverHandle?: boolean
}): string {
  const neverLever =
    opts.neverLeverHandle === true ||
    opts.montagetype === 'voordeur' ||
    opts.montagetype === 'voordeur-met-kozijn'
  const montageInstruction =
    opts.montageAgentPrompt?.trim() ||
    `Mounting type: ${opts.montagetype}.`
  const beslagInstruction =
    opts.beslagAgentPrompt?.trim() ||
    (neverLever
      ? 'Hardware: exterior front-door hardware only — round/oval knob or a pull bar/stang if the product shows one. NEVER a lever deurkruk/klink.'
      : 'Hardware: use a standard Dutch lever door handle (deurkruk) when appropriate for this door type.')
  const extra = opts.agentExtra?.trim()

  return [
    'Photorealistic photo edit of a real room.',
    'Image 1 = customer room photo (base). Keep walls, floor, ceiling, lighting, furniture, stairs, switches, keypad, camera angle and perspective EXACTLY unchanged — EXCEPT the door itself, which must match Image 2.',
    'Image 2 = product reference for the NEW door design only. Image 2 is the authority for panels, glass/no-glass, and hardware style.',
    'Replace only the door leaf (and frame only if mounting type requires a new frame) so it fits the existing opening naturally.',
    `Door model: ${opts.productNaam}.`,
    `Requested colour: ${opts.kleur}. Apply this colour to the door leaf/frame realistically; keep panel and glass/no-glass layout of the model (Image 2).`,
    `Mounting guidance: ${montageInstruction}`,
    `Hardware guidance: ${beslagInstruction}`,
    extra ? `Additional product guidance: ${extra}` : '',
    HARD_VISUAL_RULES,
    neverLever ? FRONT_DOOR_HARD_RULES : '',
    'No people, no text overlays, no logos, no watermarks.',
    'Output one photorealistic photo.',
  ]
    .filter(Boolean)
    .join(' ')
}
