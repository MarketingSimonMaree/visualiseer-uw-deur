import type { AppStep } from '../types/product'

export const FLOW_STEPS = [
  { id: 'situatie', label: 'Huidige situatie', short: 'Situatie' },
  { id: 'plan', label: 'Wat gaat hier gebeuren?', short: 'Plan' },
  { id: 'catalogus', label: 'Deur uitkiezen', short: 'Deur' },
  { id: 'kleur', label: 'Kleur', short: 'Kleur' },
] as const

export type FlowStepId = (typeof FLOW_STEPS)[number]['id']

const ORDER: AppStep[] = ['situatie', 'plan', 'catalogus', 'kleur', 'resultaat']

export function stepIndex(step: AppStep): number {
  if (step === 'resultaat') return FLOW_STEPS.length
  return ORDER.indexOf(step)
}

interface Props {
  current: AppStep
  maxReached: AppStep
  onNavigate: (step: FlowStepId) => void
}

/** Horizontaal stappenplan zoals op simonmaree.nl (afspraakflow). */
export function Stappenplan({ current, maxReached, onNavigate }: Props) {
  const currentIdx = stepIndex(current)
  const maxIdx = stepIndex(maxReached)

  return (
    <nav aria-label="Stappenplan" className="stappenplan">
      <ol className="stappenplan-track">
        {FLOW_STEPS.map((s, i) => {
          const done = i < currentIdx || current === 'resultaat'
          const active =
            i === currentIdx ||
            (current === 'resultaat' && i === FLOW_STEPS.length - 1)
          const reachable = i <= maxIdx
          const state = active ? 'is-active' : done ? 'is-done' : 'is-idle'

          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onNavigate(s.id)}
                className={`stappenplan-item ${state}`}
                aria-current={active ? 'step' : undefined}
              >
                <span className="stappenplan-label">
                  <span className="hidden sm:inline">
                    {i + 1}. {s.label}
                  </span>
                  <span className="sm:hidden">
                    {i + 1}. {s.short}
                  </span>
                </span>
                <span className="stappenplan-line" aria-hidden />
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
