/**
 * Basisregels — beslag-specifieke regels komen apart via beslagAgentPrompt.
 */
export const HARD_VISUAL_RULES = [
  'HARD RULES — these override anything visible in the product reference photo:',
  '1. The door must be FULLY CLOSED, flush in the opening. Never ajar, never open, never swinging.',
  '2. HINGE vs HANDLE SIDE (critical): Keep the hinge side exactly as in Image 1 (the room photo). Put operable hardware ALWAYS on the OPPOSITE side of the hinges — never on the hinge side. Ignore the handle side shown on the product photo.',
  '3. Any glass in the door must be CLEAR and TRANSPARENT (see-through). Never frosted, sandblasted, milky, smoked-opaque, or privacy glass.',
  '4. From Image 2, copy only the door design: proportions, panels, frame profile, and material look. Ignore its open/closed state and ignore frosted glass. Follow the hardware guidance below for handle/pull type.',
].join(' ')

export function buildGeneratePrompt(opts: {
  productNaam: string
  kleur: string
  montagetype: string
  montageAgentPrompt?: string
  beslagAgentPrompt?: string
  agentExtra?: string
}): string {
  const montageInstruction =
    opts.montageAgentPrompt?.trim() ||
    `Mounting type: ${opts.montagetype}.`
  const beslagInstruction =
    opts.beslagAgentPrompt?.trim() ||
    'Hardware: use a standard Dutch lever door handle (deurkruk). NEVER a vertical pull bar unless explicitly required.'
  const extra = opts.agentExtra?.trim()

  return [
    'Photorealistic photo edit of a real room.',
    'Image 1 = customer room photo (base). Keep walls, floor, ceiling, lighting, furniture, stairs, switches, keypad, camera angle and perspective EXACTLY unchanged.',
    'Image 2 = product reference for the NEW door design only.',
    'Replace only the door leaf (and frame only if mounting type requires a new frame) so it fits the existing opening naturally.',
    `Door model: ${opts.productNaam}.`,
    `Requested colour: ${opts.kleur}. Apply this colour to the door leaf/frame realistically; keep panel/glass layout of the model.`,
    `Mounting guidance: ${montageInstruction}`,
    `Hardware guidance: ${beslagInstruction}`,
    extra ? `Additional product guidance: ${extra}` : '',
    HARD_VISUAL_RULES,
    'No people, no text overlays, no logos, no watermarks.',
    'Output one photorealistic photo.',
  ]
    .filter(Boolean)
    .join(' ')
}
