/**
 * Migreert producten naar multi-montagetype + kleurenbibliotheek.
 * Usage: node --env-file=.env.local scripts/migrate-admin-meta.mjs
 */
import { neon } from '@neondatabase/serverless'

const MONTAGES = [
  {
    id: 'deur-bestaand-kozijn',
    label: 'Nieuwe deur in bestaand kozijn',
    hint: 'Alleen het deurblad wisselen',
    agent_prompt:
      'Replace only the door leaf inside the existing frame. Keep the existing door frame (kozijn) completely unchanged.',
    sort_order: 10,
  },
  {
    id: 'deur-met-kozijn',
    label: 'Nieuwe deur mét nieuw kozijn',
    hint: 'Complete set: deur én kozijn',
    agent_prompt:
      'Replace the door leaf and install a new matching frame around the opening. The new kozijn should fit the opening naturally.',
    sort_order: 20,
  },
  {
    id: 'taatsdeur',
    label: 'Taatsdeur plaatsen',
    hint: 'Draait om een as, vaak vloer tot plafond',
    agent_prompt:
      'Install a pivot/taats door. The door pivots on an axis (often floor-to-ceiling). Do not show traditional side hinges like a swing door.',
    sort_order: 30,
  },
  {
    id: 'schuifdeur',
    label: 'Schuifdeur plaatsen',
    hint: 'Schuift voor de wand langs een rail',
    agent_prompt:
      'Install a sliding door on a rail in front of the wall. The door must slide, not swing on hinges.',
    sort_order: 40,
  },
  {
    id: 'voordeur',
    label: 'Nieuwe voordeur in bestaand kozijn',
    hint: 'Buitendeur in uw bestaande kozijn',
    agent_prompt:
      'Replace only the exterior front door leaf in the existing exterior frame. Keep the existing outdoor frame unchanged.',
    sort_order: 50,
  },
  {
    id: 'voordeur-met-kozijn',
    label: 'Nieuwe voordeur mét nieuw kozijn',
    hint: 'Buitendeur inclusief nieuw kozijn',
    agent_prompt:
      'Replace the exterior front door including a new exterior frame that fits the opening.',
    sort_order: 60,
  },
]

const KLEUREN = [
  { id: 'ral-9010', naam: 'RAL 9010', categorie: 'ral', hex: '#F7F5EC', sort_order: 10 },
  { id: 'ral-9016', naam: 'RAL 9016', categorie: 'ral', hex: '#F7FBF5', sort_order: 20 },
  { id: 'ral-9001', naam: 'RAL 9001', categorie: 'ral', hex: '#F5E9D9', sort_order: 30 },
  { id: 'ral-9005', naam: 'RAL 9005', categorie: 'ral', hex: '#0E0E10', sort_order: 40 },
  { id: 'ral-7021', naam: 'RAL 7021', categorie: 'ral', hex: '#2F3234', sort_order: 50 },
  { id: 'ral-7016', naam: 'RAL 7016', categorie: 'ral', hex: '#383E42', sort_order: 60 },
  { id: 'ral-3004', naam: 'RAL 3004', categorie: 'ral', hex: '#6B1C23', sort_order: 70 },
  { id: 'ral-6009', naam: 'RAL 6009', categorie: 'ral', hex: '#27352A', sort_order: 80 },
  { id: 'brons', naam: 'Brons', categorie: 'ral', hex: '#8C6B3F', sort_order: 90 },
  { id: 'zilver', naam: 'Zilver', categorie: 'ral', hex: '#C0C0C0', sort_order: 100 },
  { id: 'grijs', naam: 'Grijs', categorie: 'ral', hex: '#8A8A8A', sort_order: 110 },
  { id: 'blauw', naam: 'Blauw', categorie: 'ral', hex: '#2F4F7A', sort_order: 120 },
  { id: 'groen', naam: 'Groen', categorie: 'ral', hex: '#3E5A3D', sort_order: 130 },
  { id: 'bruin', naam: 'Bruin', categorie: 'ral', hex: '#6B4423', sort_order: 140 },
  { id: 'beige', naam: 'Beige', categorie: 'ral', hex: '#D7C4A3', sort_order: 150 },
  {
    id: 'eiken-natuurlijk',
    naam: 'Eiken natuurlijk',
    categorie: 'eiken',
    hex: '#C4A574',
    sort_order: 10,
  },
  {
    id: 'eiken-gerookt',
    naam: 'Eiken gerookt',
    categorie: 'eiken',
    hex: '#6B5344',
    sort_order: 20,
  },
  {
    id: 'eiken-afrormosia',
    naam: 'Eiken Afrormosia',
    categorie: 'eiken',
    hex: '#8B5A2B',
    sort_order: 30,
  },
  {
    id: 'donker-eiken',
    naam: 'Donker eiken',
    categorie: 'eiken',
    hex: '#5A4030',
    sort_order: 40,
  },
  {
    id: 'licht-eiken',
    naam: 'Licht eiken',
    categorie: 'eiken',
    hex: '#D2B48C',
    sort_order: 50,
  },
  {
    id: 'houtlook',
    naam: 'Houtlook',
    categorie: 'eiken',
    hex: '#A67C52',
    sort_order: 60,
  },
]

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(url)

  await sql`
    CREATE TABLE IF NOT EXISTS montagetype_defs (
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
    CREATE TABLE IF NOT EXISTS kleuren_catalogus (
      id TEXT PRIMARY KEY,
      naam TEXT NOT NULL,
      categorie TEXT NOT NULL,
      hex TEXT,
      staaltje_url TEXT,
      actief BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`ALTER TABLE producten ADD COLUMN IF NOT EXISTS montagetypes JSONB`
  await sql`ALTER TABLE producten ADD COLUMN IF NOT EXISTS kleur_ids JSONB`

  for (const m of MONTAGES) {
    await sql`
      INSERT INTO montagetype_defs (id, label, hint, agent_prompt, sort_order, actief, updated_at)
      VALUES (${m.id}, ${m.label}, ${m.hint}, ${m.agent_prompt}, ${m.sort_order}, true, now())
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        hint = EXCLUDED.hint,
        agent_prompt = COALESCE(NULLIF(montagetype_defs.agent_prompt, ''), EXCLUDED.agent_prompt),
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    `
  }

  for (const k of KLEUREN) {
    await sql`
      INSERT INTO kleuren_catalogus (id, naam, categorie, hex, staaltje_url, actief, sort_order, updated_at)
      VALUES (${k.id}, ${k.naam}, ${k.categorie}, ${k.hex}, null, true, ${k.sort_order}, now())
      ON CONFLICT (id) DO UPDATE SET
        naam = EXCLUDED.naam,
        categorie = EXCLUDED.categorie,
        hex = COALESCE(kleuren_catalogus.hex, EXCLUDED.hex),
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    `
  }

  const naamToId = new Map(KLEUREN.map((k) => [k.naam.toLowerCase(), k.id]))
  for (const k of KLEUREN) naamToId.set(k.id, k.id)

  const products = await sql`SELECT id, montagetype, kleuren, montagetypes, kleur_ids FROM producten`
  let updated = 0
  for (const p of products) {
    const existingTypes = parseJsonArray(p.montagetypes)
    const montagetypes =
      existingTypes.length > 0
        ? existingTypes
        : p.montagetype
          ? [String(p.montagetype)]
          : ['deur-bestaand-kozijn']

    const existingKleurIds = parseJsonArray(p.kleur_ids)
    let kleurIds = existingKleurIds
    if (kleurIds.length === 0) {
      const old = parseJsonArray(p.kleuren)
      kleurIds = []
      for (const name of old) {
        const key = name.toLowerCase()
        let id = naamToId.get(key)
        if (!id) {
          id = slugify(name)
          const categorie = /eiken|hout|afrormosia/i.test(name) ? 'eiken' : 'ral'
          await sql`
            INSERT INTO kleuren_catalogus (id, naam, categorie, hex, actief, sort_order, updated_at)
            VALUES (${id}, ${name}, ${categorie}, null, true, 500, now())
            ON CONFLICT (id) DO NOTHING
          `
          naamToId.set(key, id)
        }
        if (!kleurIds.includes(id)) kleurIds.push(id)
      }
      if (kleurIds.length === 0) kleurIds = ['ral-9010', 'ral-9005']
    }

    await sql`
      UPDATE producten
      SET montagetypes = ${JSON.stringify(montagetypes)}::jsonb,
          kleur_ids = ${JSON.stringify(kleurIds)}::jsonb,
          montagetype = ${montagetypes[0]},
          updated_at = now()
      WHERE id = ${p.id}
    `
    updated += 1
  }

  console.log({
    montagetypes: MONTAGES.length,
    kleuren: KLEUREN.length,
    productenUpdated: updated,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
