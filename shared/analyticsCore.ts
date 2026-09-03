import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

export const ANALYTICS_EVENT_TYPES = [
  'foto_uploaded',
  'montagetype_selected',
  'product_selected',
  'kleur_selected',
  'beslag_selected',
  'delivery_wait',
  'delivery_mail',
  'generate_success',
  'generate_cache_hit',
  'generate_error',
  'generate_retry',
  'daily_limit_hit',
  'mail_sent',
  'mail_failed',
  'offerte_requested',
  'result_downloaded',
] as const

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number]

export type AnalyticsEventInput = {
  eventType: AnalyticsEventType | string
  productId?: string | null
  productNaam?: string | null
  montagetype?: string | null
  kleur?: string | null
  beslagKleur?: string | null
  bron?: string | null
  prijsindicatie?: boolean | null
  fromCache?: boolean | null
  isRetry?: boolean | null
  isMock?: boolean | null
  errorMessage?: string | null
  sessionId?: string | null
  ip?: string | null
  meta?: Record<string, unknown> | null
}

export type StatsRangeDays = 7 | 30 | 90

export type StatsOverview = {
  range: { days: number; from: string; to: string }
  kpis: {
    sessions: number
    fotoUploads: number
    visualisaties: number
    cacheHits: number
    fouten: number
    mails: number
    offertes: number
    downloads: number
    conversiePct: number
  }
  daily: Array<{
    date: string
    visualisaties: number
    mails: number
    offertes: number
    fotoUploads: number
    fouten: number
  }>
  funnel: Array<{ step: string; label: string; count: number }>
  topProducts: Array<{ id: string; naam: string; count: number }>
  topKleuren: Array<{ naam: string; count: number }>
  topMontagetypes: Array<{ id: string; count: number }>
  topBeslag: Array<{ id: string; count: number }>
  eventsByType: Array<{ type: string; count: number }>
}

type Sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>

function databaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const salt =
    process.env.ADMIN_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    'sm-analytics'
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 32)
}

export function isAllowedEventType(type: string): type is AnalyticsEventType {
  return (ANALYTICS_EVENT_TYPES as readonly string[]).includes(type)
}

export async function ensureAnalyticsTable(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      product_id TEXT,
      product_naam TEXT,
      montagetype TEXT,
      kleur TEXT,
      beslag_kleur TEXT,
      bron TEXT,
      prijsindicatie BOOLEAN,
      from_cache BOOLEAN,
      is_retry BOOLEAN,
      is_mock BOOLEAN,
      error_message TEXT,
      session_id TEXT,
      ip_hash TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
    ON analytics_events (event_type, created_at DESC)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS analytics_events_created_idx
    ON analytics_events (created_at DESC)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS analytics_events_product_idx
    ON analytics_events (product_id, created_at DESC)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS analytics_events_session_idx
    ON analytics_events (session_id, created_at DESC)
  `
}

/** Fire-and-forget vriendelijk: fouten worden geslikt. */
export async function trackAnalyticsEvent(
  input: AnalyticsEventInput,
): Promise<void> {
  const url = databaseUrl()
  if (!url) return
  const eventType = String(input.eventType || '').trim()
  if (!eventType || !isAllowedEventType(eventType)) return

  try {
    const sql = neon(url)
    await ensureAnalyticsTable(sql)
    const metaJson = JSON.stringify(input.meta ?? {})
    await sql`
      INSERT INTO analytics_events (
        event_type, product_id, product_naam, montagetype, kleur, beslag_kleur,
        bron, prijsindicatie, from_cache, is_retry, is_mock, error_message,
        session_id, ip_hash, meta
      ) VALUES (
        ${eventType},
        ${input.productId?.trim() || null},
        ${input.productNaam?.trim() || null},
        ${input.montagetype?.trim() || null},
        ${input.kleur?.trim() || null},
        ${input.beslagKleur?.trim() || null},
        ${input.bron?.trim() || null},
        ${input.prijsindicatie ?? null},
        ${input.fromCache ?? null},
        ${input.isRetry ?? null},
        ${input.isMock ?? null},
        ${input.errorMessage?.trim()?.slice(0, 500) || null},
        ${input.sessionId?.trim()?.slice(0, 80) || null},
        ${hashIp(input.ip)},
        ${metaJson}
      )
    `
  } catch (err) {
    console.error('[analytics] track failed', err)
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function emptyDaily(days: number, end: Date) {
  const out: StatsOverview['daily'] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - i)
    out.push({
      date: isoDay(d),
      visualisaties: 0,
      mails: 0,
      offertes: 0,
      fotoUploads: 0,
      fouten: 0,
    })
  }
  return out
}

export async function fetchStatsOverview(
  days: StatsRangeDays = 30,
): Promise<StatsOverview> {
  const url = databaseUrl()
  const safeDays = days === 7 || days === 90 ? days : 30
  const to = new Date()
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - (safeDays - 1))
  from.setUTCHours(0, 0, 0, 0)

  const empty: StatsOverview = {
    range: { days: safeDays, from: isoDay(from), to: isoDay(to) },
    kpis: {
      sessions: 0,
      fotoUploads: 0,
      visualisaties: 0,
      cacheHits: 0,
      fouten: 0,
      mails: 0,
      offertes: 0,
      downloads: 0,
      conversiePct: 0,
    },
    daily: emptyDaily(safeDays, to),
    funnel: [
      { step: 'foto_uploaded', label: 'Foto geüpload', count: 0 },
      { step: 'montagetype_selected', label: 'Montagetype', count: 0 },
      { step: 'product_selected', label: 'Product gekozen', count: 0 },
      { step: 'visualisatie', label: 'Visualisatie', count: 0 },
      { step: 'lead', label: 'Mail / offerte', count: 0 },
    ],
    topProducts: [],
    topKleuren: [],
    topMontagetypes: [],
    topBeslag: [],
    eventsByType: [],
  }

  if (!url) return empty

  const sql = neon(url)
  await ensureAnalyticsTable(sql)

  const fromIso = from.toISOString()

  const [
    kpiRows,
    dailyRows,
    funnelRows,
    productRows,
    kleurRows,
    montageRows,
    beslagRows,
    typeRows,
  ] = await Promise.all([
    sql`
      SELECT
        COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions,
        COUNT(*) FILTER (WHERE event_type = 'foto_uploaded') AS foto_uploads,
        COUNT(*) FILTER (
          WHERE event_type IN ('generate_success', 'generate_cache_hit')
            AND COALESCE(is_mock, false) = false
        ) AS visualisaties,
        COUNT(*) FILTER (WHERE event_type = 'generate_cache_hit') AS cache_hits,
        COUNT(*) FILTER (WHERE event_type = 'generate_error') AS fouten,
        COUNT(*) FILTER (WHERE event_type = 'mail_sent') AS mails,
        COUNT(*) FILTER (WHERE event_type = 'offerte_requested') AS offertes,
        COUNT(*) FILTER (WHERE event_type = 'result_downloaded') AS downloads
      FROM analytics_events
      WHERE created_at >= ${fromIso}
    `,
    sql`
      SELECT
        to_char(date_trunc('day', created_at AT TIME ZONE 'Europe/Amsterdam'), 'YYYY-MM-DD') AS day,
        COUNT(*) FILTER (
          WHERE event_type IN ('generate_success', 'generate_cache_hit')
            AND COALESCE(is_mock, false) = false
        ) AS visualisaties,
        COUNT(*) FILTER (WHERE event_type = 'mail_sent') AS mails,
        COUNT(*) FILTER (WHERE event_type = 'offerte_requested') AS offertes,
        COUNT(*) FILTER (WHERE event_type = 'foto_uploaded') AS foto_uploads,
        COUNT(*) FILTER (WHERE event_type = 'generate_error') AS fouten
      FROM analytics_events
      WHERE created_at >= ${fromIso}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    sql`
      SELECT event_type, COUNT(*)::int AS count
      FROM analytics_events
      WHERE created_at >= ${fromIso}
        AND event_type IN (
          'foto_uploaded',
          'montagetype_selected',
          'product_selected',
          'generate_success',
          'generate_cache_hit',
          'mail_sent',
          'offerte_requested'
        )
      GROUP BY event_type
    `,
    sql`
      SELECT
        COALESCE(product_id, 'onbekend') AS id,
        COALESCE(NULLIF(product_naam, ''), product_id, 'Onbekend') AS naam,
        COUNT(*)::int AS count
      FROM analytics_events
      WHERE created_at >= ${fromIso}
        AND event_type IN ('generate_success', 'generate_cache_hit', 'product_selected')
        AND COALESCE(is_mock, false) = false
      GROUP BY 1, 2
      ORDER BY count DESC
      LIMIT 10
    `,
    sql`
      SELECT COALESCE(NULLIF(kleur, ''), 'Onbekend') AS naam, COUNT(*)::int AS count
      FROM analytics_events
      WHERE created_at >= ${fromIso}
        AND event_type IN ('generate_success', 'generate_cache_hit', 'kleur_selected')
        AND kleur IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `,
    sql`
      SELECT COALESCE(NULLIF(montagetype, ''), 'onbekend') AS id, COUNT(*)::int AS count
      FROM analytics_events
      WHERE created_at >= ${fromIso}
        AND event_type IN ('generate_success', 'generate_cache_hit', 'montagetype_selected')
        AND montagetype IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `,
    sql`
      SELECT COALESCE(NULLIF(beslag_kleur, ''), 'onbekend') AS id, COUNT(*)::int AS count
      FROM analytics_events
      WHERE created_at >= ${fromIso}
        AND beslag_kleur IS NOT NULL
        AND event_type IN ('generate_success', 'generate_cache_hit', 'beslag_selected')
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `,
    sql`
      SELECT event_type AS type, COUNT(*)::int AS count
      FROM analytics_events
      WHERE created_at >= ${fromIso}
      GROUP BY event_type
      ORDER BY count DESC
    `,
  ])

  const kpi = (
    kpiRows as Array<{
      sessions: string | number | null
      foto_uploads: string | number | null
      visualisaties: string | number | null
      cache_hits: string | number | null
      fouten: string | number | null
      mails: string | number | null
      offertes: string | number | null
      downloads: string | number | null
    }>
  )[0]

  const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0
  const visualisaties = n(kpi?.visualisaties)
  const mails = n(kpi?.mails)
  const offertes = n(kpi?.offertes)
  const leads = mails + offertes
  const conversiePct =
    visualisaties > 0 ? Math.round((leads / visualisaties) * 1000) / 10 : 0

  const dailyMap = new Map(
    (
      dailyRows as Array<{
        day: string
        visualisaties: string | number
        mails: string | number
        offertes: string | number
        foto_uploads: string | number
        fouten: string | number
      }>
    ).map((r) => [
      r.day,
      {
        date: r.day,
        visualisaties: n(r.visualisaties),
        mails: n(r.mails),
        offertes: n(r.offertes),
        fotoUploads: n(r.foto_uploads),
        fouten: n(r.fouten),
      },
    ]),
  )

  const daily = emptyDaily(safeDays, to).map((row) => dailyMap.get(row.date) ?? row)

  const funnelCounts = new Map(
    (funnelRows as Array<{ event_type: string; count: number }>).map((r) => [
      r.event_type,
      n(r.count),
    ]),
  )
  const vizFunnel =
    (funnelCounts.get('generate_success') ?? 0) +
    (funnelCounts.get('generate_cache_hit') ?? 0)
  const leadFunnel =
    (funnelCounts.get('mail_sent') ?? 0) +
    (funnelCounts.get('offerte_requested') ?? 0)

  return {
    range: { days: safeDays, from: isoDay(from), to: isoDay(to) },
    kpis: {
      sessions: n(kpi?.sessions),
      fotoUploads: n(kpi?.foto_uploads),
      visualisaties,
      cacheHits: n(kpi?.cache_hits),
      fouten: n(kpi?.fouten),
      mails,
      offertes,
      downloads: n(kpi?.downloads),
      conversiePct,
    },
    daily,
    funnel: [
      {
        step: 'foto_uploaded',
        label: 'Foto geüpload',
        count: funnelCounts.get('foto_uploaded') ?? 0,
      },
      {
        step: 'montagetype_selected',
        label: 'Montagetype',
        count: funnelCounts.get('montagetype_selected') ?? 0,
      },
      {
        step: 'product_selected',
        label: 'Product gekozen',
        count: funnelCounts.get('product_selected') ?? 0,
      },
      { step: 'visualisatie', label: 'Visualisatie', count: vizFunnel },
      { step: 'lead', label: 'Mail / offerte', count: leadFunnel },
    ],
    topProducts: (
      productRows as Array<{ id: string; naam: string; count: number }>
    ).map((r) => ({ id: r.id, naam: r.naam, count: n(r.count) })),
    topKleuren: (kleurRows as Array<{ naam: string; count: number }>).map(
      (r) => ({ naam: r.naam, count: n(r.count) }),
    ),
    topMontagetypes: (montageRows as Array<{ id: string; count: number }>).map(
      (r) => ({ id: r.id, count: n(r.count) }),
    ),
    topBeslag: (beslagRows as Array<{ id: string; count: number }>).map(
      (r) => ({ id: r.id, count: n(r.count) }),
    ),
    eventsByType: (typeRows as Array<{ type: string; count: number }>).map(
      (r) => ({ type: r.type, count: n(r.count) }),
    ),
  }
}
