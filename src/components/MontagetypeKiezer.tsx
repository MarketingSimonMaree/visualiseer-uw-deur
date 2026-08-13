import type { Montagetype } from '../types/product'
import { MONTAGETYPE_HINTS, MONTAGETYPE_LABELS } from '../types/product'

const TYPES: Montagetype[] = [
  'deur-bestaand-kozijn',
  'deur-met-kozijn',
  'taatsdeur',
  'schuifdeur',
  'voordeur',
  'voordeur-met-kozijn',
]

interface Props {
  value: Montagetype | null
  onChange: (t: Montagetype) => void
  onContinue: () => void
  onBack: () => void
}

export function MontagetypeKiezer({ value, onChange, onContinue, onBack }: Props) {
  return (
    <section className="page">
      <button type="button" onClick={onBack} className="back-link">
        ← Wijzig
      </button>

      <div className="page-intro">
        <h1 className="section-title">
          <span className="gold">Wat</span> gaat hier gebeuren?
        </h1>
        <p className="lead">
          Vertel wat u wilt vervangen of plaatsen. Dan tonen we de juiste deuren.
        </p>
      </div>

      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {TYPES.map((t) => {
          const selected = value === t
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => onChange(t)}
                className={`choice-card ${selected ? 'is-selected' : ''}`}
              >
                <span className="block font-semibold">{MONTAGETYPE_LABELS[t]}</span>
                <span className="mt-1 block text-sm text-[var(--colorDarkGray)]">
                  {MONTAGETYPE_HINTS[t]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="cta-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!value}
          onClick={onContinue}
        >
          Kies een deur
          <span className="btn-arrow" aria-hidden>
            →
          </span>
        </button>
      </div>
    </section>
  )
}
