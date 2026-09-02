import { useEffect, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchAdminStats,
  type AdminStatsOverview,
} from '../lib/adminApi'
import { BESLAG_KLEUREN } from '../data/beslagKleuren'
import { MONTAGETYPE_LABELS } from '../types/product'

const CHART_PINK = '#d84f5b'
const CHART_GOLD = '#b19654'
const CHART_ANTRACIET = '#232323'
const CHART_MUTED = '#9a9a9a'

type RangeDays = 7 | 30 | 90

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--colorDarkGray)]">
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--fontFamilySpecial)] text-3xl text-[var(--colorAntraciet)]">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--colorDarkGray)]">{hint}</p>
      ) : null}
    </div>
  )
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-4 h-64 w-full">{children}</div>
    </div>
  )
}

function formatDay(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function montageLabel(id: string) {
  return (
    MONTAGETYPE_LABELS[id as keyof typeof MONTAGETYPE_LABELS] ?? id
  )
}

function beslagLabel(id: string) {
  return BESLAG_KLEUREN.find((b) => b.id === id)?.naam ?? id
}

export function AdminStatsTab() {
  const [days, setDays] = useState<RangeDays>(30)
  const [data, setData] = useState<AdminStatsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchAdminStats(days)
      .then((overview) => {
        if (!cancelled) setData(overview)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Statistieken laden mislukt',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const dailyChart =
    data?.daily.map((row) => ({
      ...row,
      label: formatDay(row.date),
    })) ?? []

  const funnelMax = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]))

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="section-title text-2xl sm:text-3xl">
            <span className="gold">Statistieken</span>
          </h1>
          <p className="mt-1 text-[var(--colorDarkGray)]">
            Overzicht van gebruik, visualisaties en leads
            {data ? ` · ${data.range.from} t/m ${data.range.to}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([7, 30, 90] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                days === n
                  ? 'border-[var(--colorPrimary)] bg-[var(--colorPrimary)] text-white'
                  : 'border-[var(--colorBorder)] bg-white'
              }`}
            >
              {n} dagen
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-[var(--colorError)]" role="alert">
          {error}
        </p>
      )}
      {loading && !data && (
        <p className="text-[var(--colorDarkGray)]">Statistieken laden…</p>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Sessies"
              value={data.kpis.sessions}
              hint="Unieke bezoekerssessies"
            />
            <KpiCard
              label="Foto’s geüpload"
              value={data.kpis.fotoUploads}
            />
            <KpiCard
              label="Visualisaties"
              value={data.kpis.visualisaties}
              hint={`${data.kpis.cacheHits} uit cache`}
            />
            <KpiCard
              label="Conversie"
              value={`${data.kpis.conversiePct}%`}
              hint="Mail + offerte t.o.v. visualisaties"
            />
            <KpiCard label="Mails verstuurd" value={data.kpis.mails} />
            <KpiCard label="Offerte-aanvragen" value={data.kpis.offertes} />
            <KpiCard label="Downloads" value={data.kpis.downloads} />
            <KpiCard label="Fouten" value={data.kpis.fouten} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Visualisaties & leads per dag">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyChart}>
                  <defs>
                    <linearGradient id="vizFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_PINK} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_PINK} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="visualisaties"
                    name="Visualisaties"
                    stroke={CHART_PINK}
                    fill="url(#vizFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="mails"
                    name="Mails"
                    stroke={CHART_GOLD}
                    fill="transparent"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="offertes"
                    name="Offertes"
                    stroke={CHART_ANTRACIET}
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Funnel">
              <div className="flex h-full flex-col justify-center gap-3">
                {data.funnel.map((step) => {
                  const pct = Math.round((step.count / funnelMax) * 100)
                  return (
                    <div key={step.step}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">{step.label}</span>
                        <span className="text-[var(--colorDarkGray)]">
                          {step.count}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--colorGray)]">
                        <div
                          className="h-full rounded-full bg-[var(--colorPrimary)] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Top producten">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topProducts.map((p) => ({
                    name:
                      p.naam.length > 22 ? `${p.naam.slice(0, 20)}…` : p.naam,
                    count: p.count,
                  }))}
                  layout="vertical"
                  margin={{ left: 8, right: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar dataKey="count" name="Keuzes" radius={[0, 6, 6, 0]}>
                    {data.topProducts.map((_, i) => (
                      <Cell
                        key={i}
                        fill={i % 2 === 0 ? CHART_PINK : CHART_GOLD}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Populaire kleuren">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topKleuren.map((k) => ({
                    name:
                      k.naam.length > 18 ? `${k.naam.slice(0, 16)}…` : k.naam,
                    count: k.count,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="count" name="Keuzes" fill={CHART_GOLD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
              <h3 className="text-base font-semibold">Montagetypes</h3>
              <ul className="mt-3 divide-y divide-[var(--colorGray)]">
                {data.topMontagetypes.length === 0 && (
                  <li className="py-3 text-sm text-[var(--colorDarkGray)]">
                    Nog geen data
                  </li>
                )}
                {data.topMontagetypes.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span>{montageLabel(m.id)}</span>
                    <span className="font-semibold">{m.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
              <h3 className="text-base font-semibold">Beslagkleuren</h3>
              <ul className="mt-3 divide-y divide-[var(--colorGray)]">
                {data.topBeslag.length === 0 && (
                  <li className="py-3 text-sm text-[var(--colorDarkGray)]">
                    Nog geen data
                  </li>
                )}
                {data.topBeslag.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded border border-[var(--colorBorder)]"
                        style={{
                          background:
                            BESLAG_KLEUREN.find((x) => x.id === b.id)?.hex ??
                            CHART_MUTED,
                        }}
                        aria-hidden
                      />
                      {beslagLabel(b.id)}
                    </span>
                    <span className="font-semibold">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
            <h3 className="text-base font-semibold">Alle events</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.eventsByType.length === 0 && (
                <p className="text-sm text-[var(--colorDarkGray)]">
                  Nog geen events — zodra bezoekers de visualisator gebruiken
                  verschijnen hier cijfers.
                </p>
              )}
              {data.eventsByType.map((e) => (
                <div
                  key={e.type}
                  className="flex items-center justify-between rounded-[var(--borderRadius)] border border-[var(--colorGray)] px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-[var(--colorDarkGray)]">
                    {e.type}
                  </span>
                  <span className="font-semibold">{e.count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
