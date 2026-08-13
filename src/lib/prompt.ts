/**
 * Harde visualisatieregels — altijd meegestuurd naar gpt-image-2.
 * Productfoto's (open deur, stang, matglas) worden hierdoor overschreven.
 */
export const HARD_VISUAL_RULES = [
  'HARD RULES — these override anything visible in the product reference photo:',
  '1. The door must be FULLY CLOSED, flush in the opening. Never ajar, never open, never swinging.',
  '2. Hardware: ALWAYS a standard Dutch lever door handle (deurkruk / horizontal lever on a rose or shield). NEVER a vertical pull bar, long stang, ladder pull, or handle bar.',
  '3. HINGE vs HANDLE (critical): Keep the hinge side exactly as in Image 1 (the room photo). Put the deurkruk ALWAYS on the OPPOSITE side of the hinges — never on the hinge side. Example: if hinges are on the left of the opening, the deurkruk must be on the right; if hinges are on the right, the deurkruk must be on the left. Ignore the handle side shown on the product photo.',
  '4. Any glass in the door must be CLEAR and TRANSPARENT (see-through). Never frosted, sandblasted, milky, smoked-opaque, or privacy glass.',
  '5. From Image 2, copy only the door design: proportions, panels, frame profile, and material look. Ignore its open/closed state, ignore its handle type and handle side, ignore frosted glass.',
].join(' ')

export function buildGeneratePrompt(opts: {
  productNaam: string
  kleur: string
  montagetype: string
}): string {
  return [
    'Photorealistic photo edit of a real room.',
    'Image 1 = customer room photo (base). Keep walls, floor, ceiling, lighting, furniture, stairs, switches, keypad, camera angle and perspective EXACTLY unchanged.',
    'Image 2 = product reference for the NEW door design only.',
    'Replace only the door leaf (and frame only if mounting type requires a new frame) so it fits the existing opening naturally.',
    `Door model: ${opts.productNaam}.`,
    `Requested colour: ${opts.kleur}. Apply this colour to the door leaf/frame realistically; keep panel/glass layout of the model.`,
    `Mounting type: ${opts.montagetype}.`,
    HARD_VISUAL_RULES,
    'No people, no text overlays, no logos, no watermarks.',
    'Output one photorealistic photo.',
  ].join(' ')
}
