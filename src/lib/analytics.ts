export type AnalyticsEventType =
  | 'foto_uploaded'
  | 'montagetype_selected'
  | 'product_selected'
  | 'kleur_selected'
  | 'beslag_selected'
  | 'delivery_wait'
  | 'delivery_mail'
  | 'generate_success'
  | 'generate_cache_hit'
  | 'generate_error'
  | 'generate_retry'
  | 'daily_limit_hit'
  | 'mail_sent'
  | 'mail_failed'
  | 'offerte_requested'
  | 'result_downloaded'

const SESSION_KEY = 'sm-viz-analytics-session'

export function getAnalyticsSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return `s-${Date.now()}`
  }
}

export type TrackPayload = {
  eventType: AnalyticsEventType
  productId?: string
  productNaam?: string
  montagetype?: string
  kleur?: string
  beslagKleur?: string
  bron?: string
  prijsindicatie?: boolean
  fromCache?: boolean
  isRetry?: boolean
  isMock?: boolean
  errorMessage?: string
  meta?: Record<string, unknown>
}

/** Fire-and-forget; faalt stil. */
export function trackEvent(payload: TrackPayload): void {
  try {
    const body = JSON.stringify({
      ...payload,
      sessionId: getAnalyticsSessionId(),
    })
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon('/api/analytics', blob)
      if (ok) return
    }
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // negeer
  }
}
