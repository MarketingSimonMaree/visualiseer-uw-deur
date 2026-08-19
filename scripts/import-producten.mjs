/**
 * Haalt product-sitemap op, filtert echte producten (diepte 4 + SKD-uitzondering),
 * schrijft naar Neon.
 *
 * Usage: node --env-file=.env.local scripts/import-producten.mjs
 */
import { neon } from '@neondatabase/serverless'

const SITEMAP = 'https://www.simonmaree.nl/product-sitemap.xml'
const EXTRA_SLUGS = new Set(['skd-brons-ugp-verticaal-type-1'])

const DEFAULT_KLEUREN = ['RAL 9010', 'RAL 9005', 'RAL 7021']

function loadDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    console.error('DATABASE_URL ontbreekt (.env.local)')
    process.exit(1)
  }
  return url
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

function parseSitemap(xml) {
  const entries = []
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? []
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]
    if (!loc) continue
    const images = [...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(
      (m) => decodeXml(m[1]),
    )
    entries.push({ url: decodeXml(loc), images })
  }
  return entries
}

function pathSegments(productUrl) {
  const u = new URL(productUrl)
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'producten') return null
  return parts.slice(1)
}

function isProductPage(segments) {
  if (!segments || segments.length === 0) return false
  if (segments.length === 1 && EXTRA_SLUGS.has(segments[0])) return true
  // /producten/{cat}/{sub}/{slug}/
  return segments.length === 3
}

function titleFromSlug(slug) {
  return slug
    .split('-')
    .map((w) => {
      if (/^(skd|wk|ndb|ugp|dg\d+|cc|ls|vd|hd|vl)\d*$/i.test(w)) return w.toUpperCase()
      if (w.length <= 2) return w.toUpperCase()
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

function collectieLabel(sub, cat) {
  const map = {
    'steel-look-deuren': 'Steel look',
    'kamerhoge-deuren': 'Kamerhoog',
    'moderne-binnendeuren': 'Modern',
    'eiken-binnendeuren': 'Eiken',
    'aluminium-voordeur': 'Aluminium voordeuren',
    voordeur: 'Voordeuren',
    tuindeuren: 'Tuindeuren',
    'openslaande-garagedeuren': 'Garagedeuren',
    schuifdeuren: 'Schuifdeuren',
    taatsdeuren: 'Taatsdeuren',
    opdekdeuren: 'Opdek',
  }
  if (sub && map[sub]) return map[sub]
  if (cat === 'binnendeuren') return 'Binnendeuren'
  if (cat === 'buitendeuren') return 'Buitendeuren'
  return sub || cat || 'Overig'
}

function inferMateriaal(slug, sub) {
  if (sub === 'aluminium-voordeur' || slug.includes('aluminium')) return 'aluminium'
  if (sub === 'steel-look-deuren' || slug.startsWith('skd-')) return 'staal'
  return 'hout'
}

function inferMontagetype(segments) {
  const [cat, sub] = segments
  if (cat === 'buitendeuren') {
    if (sub === 'openslaande-garagedeuren') return 'voordeur-met-kozijn'
    return 'voordeur'
  }
  if (sub === 'taatsdeuren') return 'taatsdeur'
  if (sub === 'schuifdeuren') return 'schuifdeur'
  if (sub === 'kamerhoge-deuren') return 'deur-met-kozijn'
  return 'deur-bestaand-kozijn'
}

function inferKleuren(slug, naam) {
  const s = `${slug} ${naam}`.toLowerCase()
  const found = []
  const rules = [
    [/zwart/, 'RAL 9005'],
    [/wit/, 'RAL 9010'],
    [/brons/, 'Brons'],
    [/zilver/, 'Zilver'],
    [/grijs|kwarts-grijs|lichtgrijs|licht-grijs/, 'Grijs'],
    [/blauw/, 'Blauw'],
    [/groen/, 'Groen'],
    [/bruin/, 'Bruin'],
    [/beige/, 'Beige'],
    [/houtlook/, 'Houtlook'],
    [/eiken|afrormosia/, 'Eiken'],
    [/donker-eiken/, 'Donker eiken'],
    [/licht-eiken/, 'Licht eiken'],
  ]
  for (const [re, label] of rules) {
    if (re.test(s) && !found.includes(label)) found.push(label)
  }
  return found.length > 0 ? found : [...DEFAULT_KLEUREN]
}

function toRow(entry) {
  const segments = pathSegments(entry.url)
  if (!isProductPage(segments)) return null
  if (!entry.images[0]) return null

  const slug = segments[segments.length - 1]
  const cat = segments[0] ?? ''
  const sub = segments[1] ?? ''
  const naam = titleFromSlug(slug)

  return {
    id: slug,
    naam,
    afbeelding_url: entry.images[0],
    pagina_url: entry.url.replace(/\/?$/, '/'),
    montagetype: inferMontagetype(segments),
    materiaal: inferMateriaal(slug, sub),
    collectie: collectieLabel(sub, cat),
    kleuren: inferKleuren(slug, naam),
  }
}

async function main() {
  const sql = neon(loadDatabaseUrl())

  await sql`
    CREATE TABLE IF NOT EXISTS producten (
      id TEXT PRIMARY KEY,
      naam TEXT NOT NULL,
      afbeelding_url TEXT NOT NULL,
      pagina_url TEXT NOT NULL UNIQUE,
      montagetype TEXT NOT NULL,
      materiaal TEXT NOT NULL,
      collectie TEXT NOT NULL,
      kleuren JSONB NOT NULL DEFAULT '[]'::jsonb,
      actief BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS producten_actief_idx ON producten (actief)`
  await sql`CREATE INDEX IF NOT EXISTS producten_montagetype_idx ON producten (montagetype)`

  console.log('Sitemap ophalen…')
  const res = await fetch(SITEMAP)
  if (!res.ok) throw new Error(`Sitemap HTTP ${res.status}`)
  const xml = await res.text()
  const entries = parseSitemap(xml)
  const rows = entries.map(toRow).filter(Boolean)

  console.log(`Sitemap-URL’s: ${entries.length}, producten: ${rows.length}`)

  let upserted = 0
  for (const row of rows) {
    await sql`
      INSERT INTO producten (
        id, naam, afbeelding_url, pagina_url,
        montagetype, materiaal, collectie, kleuren, actief, updated_at
      ) VALUES (
        ${row.id},
        ${row.naam},
        ${row.afbeelding_url},
        ${row.pagina_url},
        ${row.montagetype},
        ${row.materiaal},
        ${row.collectie},
        ${JSON.stringify(row.kleuren)}::jsonb,
        true,
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        naam = EXCLUDED.naam,
        afbeelding_url = EXCLUDED.afbeelding_url,
        pagina_url = EXCLUDED.pagina_url,
        montagetype = EXCLUDED.montagetype,
        materiaal = EXCLUDED.materiaal,
        collectie = EXCLUDED.collectie,
        kleuren = EXCLUDED.kleuren,
        actief = true,
        updated_at = now()
    `
    upserted += 1
  }

  const count = await sql`SELECT count(*)::int AS n FROM producten WHERE actief = true`
  console.log(`Upserted: ${upserted}, actief in DB: ${count[0].n}`)

  const sample = await sql`
    SELECT id, montagetype, collectie, materiaal
    FROM producten
    WHERE id = 'skd-brons-ugp-verticaal-type-1'
       OR id LIKE 'jutta%'
       OR id LIKE 'eiken-voordeur%'
    ORDER BY id
    LIMIT 10
  `
  console.log('Sample:', sample)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
