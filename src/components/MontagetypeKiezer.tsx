import type { Montagetype } from '../types/product'
import type { MontagetypeDef } from '../types/product'
import { FALLBACK_MONTAGETYPES } from '../types/product'

interface Props {
  options?: MontagetypeDef[]
  value: Montagetype | null
  onChange: (t: Montagetype) => void
  onContinue: () => void
  onBack: () => void
}

export function MontagetypeKiezer({
  options,
  value,
  onChange,
  onContinue,
  onBack,
}: Props) {
  const types = (options?.length ? options : FALLBACK_MONTAGETYPES).filter(
    (m) => m.actief !== false,
  )

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
        {types.map((t) => {
          const selected = value === t.id
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onChange(t.id)}
                className={`choice-card ${selected ? 'is-selected' : ''}`}
              >
                <span className="block font-semibold">{t.label}</span>
                <span className="mt-1 block text-sm text-[var(--colorDarkGray)]">
                  {t.hint}
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
