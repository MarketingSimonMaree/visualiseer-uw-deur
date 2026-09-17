export type AnalyticsEventType =
  | 'session_start'
  | 'page_view'
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
const SESSION_STARTED_KEY = 'sm-viz-analytics-session-started'

/** Voorkomt dubbele page_view bij React StrictMode (dev). */
let pageViewTrackedThisLoad = false

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

/**
 * Bij openen van de visualisator:
 * - session_start: één keer per browsertab (sessionStorage)
 * - page_view: één keer per page load (refresh telt opnieuw)
 */
export function trackAppVisit(meta?: Record<string, unknown>): void {
  try {
    getAnalyticsSessionId()
    let isNewSession = false
    try {
      if (!sessionStorage.getItem(SESSION_STARTED_KEY)) {
        sessionStorage.setItem(SESSION_STARTED_KEY, '1')
        isNewSession = true
      }
    } catch {
      isNewSession = true
    }

    if (isNewSession) {
      trackEvent({ eventType: 'session_start', meta })
    }

    if (pageViewTrackedThisLoad) return
    pageViewTrackedThisLoad = true
    trackEvent({ eventType: 'page_view', meta })
  } catch {
    // negeer
  }
}
