/**
 * Beslag-catalogus + collectie-defaults + product.beslag_id
 * Usage: node --env-file=.env.local scripts/migrate-beslag.mjs
 */
import { neon } from '@neondatabase/serverless'

const BESLAG = [
  {
    id: 'deurkruk-standaard',
    label: 'Standaard deurkruk',
    hint: 'Horizontale Nederlandse deurkruk op rozet',
    agent_prompt:
      'Hardware: use a standard Dutch lever door handle (deurkruk / horizontal lever on a rose or shield). NEVER a vertical pull bar or ladder pull. Place the deurkruk on the OPPOSITE side of the hinges.',
    sort_order: 10,
  },
  {
    id: 'trekstang-verticaal',
    label: 'Verticale trekstang',
    hint: 'Lange verticale stang (vaak steel look)',
    agent_prompt:
      'Hardware: use a slim vertical pull bar (trekstang) on the door, typical for steel-look doors. Do NOT use a horizontal lever deurkruk. Keep the bar proportional and realistic; place it on the opening side opposite the hinges if hinges are visible.',
    sort_order: 20,
  },
  {
    id: 'greep-lang',
    label: 'Lange greep / handgreep',
    hint: 'Horizontale of schuine designgreep',
    agent_prompt:
      'Hardware: use a modern elongated door grip/handle appropriate for the door design (not a thin vertical ladder pull unless the product photo clearly shows one). Keep it photorealistic and correctly sided opposite hinges when applicable.',
    sort_order: 30,
  },
  {
    id: 'deurknop',
    label: 'Deurknop',
    hint: 'Ronde of ovale knop',
    agent_prompt:
      'Hardware: use a classic round or oval door knob (deurknop), not a lever handle and not a pull bar. Place it at typical Dutch door-handle height, opposite the hinge side.',
    sort_order: 40,
  },
  {
    id: 'minimaal-onzichtbaar',
    label: 'Minimaal / onzichtbaar beslag',
    hint: 'Zo weinig mogelijk zichtbaar beslag (taats/schuif)',
    agent_prompt:
      'Hardware: keep hardware minimal or visually discreet. Avoid a prominent pull bar or lever unless required for realism. For pivot/sliding doors, do not invent heavy traditional swing-door furniture.',
    sort_order: 50,
  },
]

const COLLECTIE_DEFAULTS = [
  { collectie: 'Steel look', beslag_id: 'trekstang-verticaal' },
  { collectie: 'Kamerhoog', beslag_id: 'deurkruk-standaard' },
  { collectie: 'Modern', beslag_id: 'deurkruk-standaard' },
  { collectie: 'Eiken', beslag_id: 'deurkruk-standaard' },
  { collectie: 'Voordeuren', beslag_id: 'deurkruk-standaard' },
  { collectie: 'Aluminium voordeuren', beslag_id: 'deurkruk-standaard' },
  { collectie: 'Tuindeuren', beslag_id: 'deurkruk-standaard' },
  { collectie: 'Garagedeuren', beslag_id: 'deurkruk-standaard' },
]

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(url)

  await sql`
    CREATE TABLE IF NOT EXISTS beslag_defs (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      hint TEXT NOT NULL DEFAULT '',
      agent_prompt TEXT NOT NULL DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0,
      actief BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS collectie_defaults (
      collectie TEXT PRIMARY KEY,
      beslag_id TEXT REFERENCES beslag_defs(id),
      agent_extra TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`ALTER TABLE producten ADD COLUMN IF NOT EXISTS beslag_id TEXT`
  await sql`ALTER TABLE producten ADD COLUMN IF NOT EXISTS agent_extra TEXT NOT NULL DEFAULT ''`

  for (const b of BESLAG) {
    await sql`
      INSERT INTO beslag_defs (id, label, hint, agent_prompt, sort_order, actief, updated_at)
      VALUES (${b.id}, ${b.label}, ${b.hint}, ${b.agent_prompt}, ${b.sort_order}, true, now())
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        hint = EXCLUDED.hint,
        agent_prompt = COALESCE(NULLIF(beslag_defs.agent_prompt, ''), EXCLUDED.agent_prompt),
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    `
  }

  for (const c of COLLECTIE_DEFAULTS) {
    await sql`
      INSERT INTO collectie_defaults (collectie, beslag_id, agent_extra, updated_at)
      VALUES (${c.collectie}, ${c.beslag_id}, '', now())
      ON CONFLICT (collectie) DO UPDATE SET
        beslag_id = COALESCE(collectie_defaults.beslag_id, EXCLUDED.beslag_id),
        updated_at = now()
    `
  }

  // Steel look producten: default trekstang als nog geen beslag_id
  const updated = await sql`
    UPDATE producten
    SET beslag_id = 'trekstang-verticaal', updated_at = now()
    WHERE beslag_id IS NULL
      AND (
        lower(collectie) LIKE '%steel%'
        OR id LIKE 'skd-%'
      )
    RETURNING id
  `

  console.log({
    beslag: BESLAG.length,
    collectieDefaults: COLLECTIE_DEFAULTS.length,
    steelLookProductsSet: updated.length,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
