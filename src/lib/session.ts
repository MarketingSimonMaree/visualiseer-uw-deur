import {
  DAILY_GENERATION_LIMIT,
  SESSION_GENERATION_LIMIT,
} from '../config'

const COUNT_KEY = 'sm-viz-gen-count'
const EMAIL_KEY = 'sm-viz-email'
const DAILY_KEY = 'sm-viz-daily'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

type DailyStore = { date: string; count: number }

function readDaily(): DailyStore {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    if (!raw) return { date: todayKey(), count: 0 }
    const parsed = JSON.parse(raw) as DailyStore
    if (parsed.date !== todayKey()) return { date: todayKey(), count: 0 }
    return {
      date: parsed.date,
      count: Number.isFinite(parsed.count) ? parsed.count : 0,
    }
  } catch {
    return { date: todayKey(), count: 0 }
  }
}

function writeDaily(store: DailyStore): void {
  localStorage.setItem(DAILY_KEY, JSON.stringify(store))
}

export function getDailyGenerationCount(): number {
  return readDaily().count
}

export function incrementDailyGenerationCount(): number {
  const store = readDaily()
  store.count += 1
  writeDaily(store)
  return store.count
}

export function remainingDailyGenerations(): number {
  return Math.max(0, DAILY_GENERATION_LIMIT - getDailyGenerationCount())
}

/** Harde stop: 20 generaties per kalenderdag. */
export function isDailyLimitReached(): boolean {
  return getDailyGenerationCount() >= DAILY_GENERATION_LIMIT
}

export function getGenerationCount(): number {
  const n = Number(sessionStorage.getItem(COUNT_KEY) ?? '0')
  return Number.isFinite(n) ? n : 0
}

export function incrementGenerationCount(): number {
  const next = getGenerationCount() + 1
  sessionStorage.setItem(COUNT_KEY, String(next))
  return next
}

export function getSessionEmail(): string | null {
  return sessionStorage.getItem(EMAIL_KEY)
}

export function setSessionEmail(email: string): void {
  sessionStorage.setItem(EMAIL_KEY, email.trim().toLowerCase())
}

/** Limiet bereikt én nog geen e-mail → gate tonen. */
export function needsEmailGate(): boolean {
  return getGenerationCount() >= SESSION_GENERATION_LIMIT && !getSessionEmail()
}

/** Resterende sessiegeneraties (vóór e-mail). Dagelijks limiet apart. */
export function remainingGenerations(): number {
  if (getSessionEmail()) {
    return remainingDailyGenerations()
  }
  return Math.min(
    Math.max(0, SESSION_GENERATION_LIMIT - getGenerationCount()),
    remainingDailyGenerations(),
  )
}
