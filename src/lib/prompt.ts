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
  'FRONT DOOR HARDWARE (critical — exterior voordeur / entree — OVERRIDES all other hardware guidance, Image 2, and colour notes):',
  'NEVER use an interior lever handle / deurkruk / klink — not even if Image 2 shows one, and not even if other prompt text mentions a lever.',
  'Dutch front doors do not get a lever klink.',
  'Use ONLY a round/oval door knob (deurknop), or a pull bar/stang ONLY if Image 2 already clearly shows a pull bar/stang.',
  'If Image 2 shows a lever/klink, REPLACE it with a round door knob.',
  'Default when unsure: round door knob — never a lever klink.',
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
  /** Engelse omschrijving van gekozen beslagkleur, of leeg. */
  beslagKleurPrompt?: string
}): string {
  const neverLever =
    opts.neverLeverHandle === true ||
    opts.montagetype === 'voordeur' ||
    opts.montagetype === 'voordeur-met-kozijn'
  const montageInstruction =
    opts.montageAgentPrompt?.trim() ||
    `Mounting type: ${opts.montagetype}.`
  // Bij voordeur wint de knop-regel altijd — negeer DB-beslagprompts zoals deurkruk-standaard.
  const beslagInstruction = neverLever
    ? 'Hardware type (mandatory): round/oval exterior door knob (deurknop). NEVER a lever deurkruk/klink. Pull bar/stang only if Image 2 already shows one.'
    : opts.beslagAgentPrompt?.trim() ||
      'Hardware: use a standard Dutch lever door handle (deurkruk) when appropriate for this door type.'
  const extra = opts.agentExtra?.trim()
  const beslagKleur = opts.beslagKleurPrompt?.trim()
  const beslagKleurRules = beslagKleur
    ? [
        'HARDWARE COLOUR (critical — overrides Image 1 and Image 2 hardware colours only, NOT hardware type):',
        `ALL door hardware must be finished in ${beslagKleur}.`,
        neverLever
          ? 'This includes EVERY metal fitting on the door: the round/oval door knob, rose/escutcheon (rozet), letterbox/mail slot (brievenbus), pull bar/stang if present, hinges if visible on the door face, peephole ring, and any other door furniture. Do NOT introduce a lever handle when applying this colour.'
          : 'This includes EVERY metal fitting on the door: door handle, rose/escutcheon (rozet), letterbox/mail slot (brievenbus), pull bar/stang, hinges if visible on the door face, peephole ring, and any other door furniture.',
        'Do not mix hardware colours. Do not keep chrome/brass/black from the product photo if a different hardware colour was requested.',
      ].join(' ')
    : ''

  return [
    'Photorealistic photo edit of a real room.',
    'Image 1 = customer room photo (base). Keep walls, floor, ceiling, lighting, furniture, stairs, switches, keypad, camera angle and perspective EXACTLY unchanged — EXCEPT the door itself, which must match Image 2.',
    'Image 2 = product reference for the NEW door design only. Image 2 is the authority for panels, glass/no-glass, and (except on front doors) hardware style.',
    'Replace only the door leaf (and frame only if mounting type requires a new frame) so it fits the existing opening naturally.',
    `Door model: ${opts.productNaam}.`,
    `Requested colour: ${opts.kleur}. Apply this colour to the door leaf/frame realistically; keep panel and glass/no-glass layout of the model (Image 2).`,
    `Mounting guidance: ${montageInstruction}`,
    `Hardware guidance: ${beslagInstruction}`,
    extra ? `Additional product guidance: ${extra}` : '',
    HARD_VISUAL_RULES,
    neverLever ? FRONT_DOOR_HARD_RULES : '',
    beslagKleurRules,
    'No people, no text overlays, no logos, no watermarks.',
    'Output one photorealistic photo.',
  ]
    .filter(Boolean)
    .join(' ')
}

