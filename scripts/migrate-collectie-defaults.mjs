/**
 * Uitbreiding collectie-defaults: montagetypes + kleur_ids
 * Usage: node --env-file=.env.local scripts/migrate-collectie-defaults.mjs
 */
import { neon } from '@neondatabase/serverless'

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL ontbreekt')
  const sql = neon(url)

  await sql`
    CREATE TABLE IF NOT EXISTS collectie_defaults (
      collectie TEXT PRIMARY KEY,
      beslag_id TEXT,
      agent_extra TEXT NOT NULL DEFAULT '',
      montagetypes JSONB NOT NULL DEFAULT '[]'::jsonb,
      kleur_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  await sql`ALTER TABLE collectie_defaults ADD COLUMN IF NOT EXISTS montagetypes JSONB NOT NULL DEFAULT '[]'::jsonb`
  await sql`ALTER TABLE collectie_defaults ADD COLUMN IF NOT EXISTS kleur_ids JSONB NOT NULL DEFAULT '[]'::jsonb`

  // Zorg dat elke product-collectie een rij heeft
  const collecties = await sql`
    SELECT DISTINCT collectie FROM producten
    WHERE collectie IS NOT NULL AND trim(collectie) <> ''
    ORDER BY collectie ASC
  `

  let created = 0
  for (const row of /** @type {Array<{ collectie: string }>} */ (collecties)) {
    const name = row.collectie.trim()
    if (!name) continue
    const result = await sql`
      INSERT INTO collectie_defaults (collectie, beslag_id, agent_extra, montagetypes, kleur_ids, updated_at)
      VALUES (${name}, NULL, '', '[]'::jsonb, '[]'::jsonb, now())
      ON CONFLICT (collectie) DO NOTHING
      RETURNING collectie
    `
    if (result.length) created += 1
  }

  console.log({
    collecties: collecties.length,
    newlyCreated: created,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
