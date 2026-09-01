import { useMemo, useState } from 'react'
import type { DeurGroep, Montagetype, MontagetypeDef } from '../types/product'
import { FALLBACK_MONTAGETYPES, inferDeurGroep } from '../types/product'

interface Props {
  options?: MontagetypeDef[]
  value: Montagetype | null
  onChange: (t: Montagetype | null) => void
  onContinue: () => void
  onBack: () => void
}

function normalize(m: MontagetypeDef): MontagetypeDef {
  return {
    ...m,
    deurGroep: m.deurGroep === 'buiten' ? 'buiten' : inferDeurGroep(m.id),
  }
}

export function MontagetypeKiezer({
  options,
  value,
  onChange,
  onContinue,
  onBack,
}: Props) {
  const types = useMemo(
    () =>
      (options?.length ? options : FALLBACK_MONTAGETYPES)
        .filter((m) => m.actief !== false)
        .map(normalize),
    [options],
  )

  const initialGroep: DeurGroep | null = value
    ? (types.find((t) => t.id === value)?.deurGroep ?? inferDeurGroep(value))
    : null
  const [groep, setGroep] = useState<DeurGroep | null>(initialGroep)

  const inGroep = useMemo(
    () => (groep ? types.filter((t) => t.deurGroep === groep) : []),
    [types, groep],
  )

  function chooseGroep(next: DeurGroep) {
    setGroep(next)
    if (value) {
      const stillValid = types.some(
        (t) => t.id === value && t.deurGroep === next,
      )
      if (!stillValid) onChange(null)
    }
  }

  function handleBack() {
    if (groep) {
      setGroep(null)
      onChange(null)
      return
    }
    onBack()
  }

  return (
    <section className="page">
      <button type="button" onClick={handleBack} className="back-link">
        ← Wijzig
      </button>

      {!groep ? (
        <>
          <div className="page-intro">
            <h1 className="section-title">
              <span className="gold">Binnen</span> of buiten?
            </h1>
            <p className="lead">
              Kies eerst het soort deur. Daarna ziet u de passende montage-opties.
            </p>
          </div>

          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            <li>
              <button
                type="button"
                onClick={() => chooseGroep('binnen')}
                className="choice-card"
              >
                <span className="block font-semibold">Binnendeur</span>
                <span className="mt-1 block text-sm text-[var(--colorDarkGray)]">
                  Kamerdeur, taatsdeur, schuifdeur
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => chooseGroep('buiten')}
                className="choice-card"
              >
                <span className="block font-semibold">Buitendeur</span>
                <span className="mt-1 block text-sm text-[var(--colorDarkGray)]">
                  Voordeur, tuindeur / achterdeur
                </span>
              </button>
            </li>
          </ul>
        </>
      ) : (
        <>
          <div className="page-intro">
            <h1 className="section-title">
              <span className="gold">Wat</span> gaat hier gebeuren?
            </h1>
            <p className="lead">
              {groep === 'binnen'
                ? 'Kies hoe u de binnendeur wilt plaatsen of vervangen.'
                : 'Kies of het om een voordeur of tuindeur gaat, mét of zonder nieuw kozijn.'}
            </p>
          </div>

          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {inGroep.map((t) => {
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

          {inGroep.length === 0 && (
            <p className="mt-6 text-[var(--colorDarkGray)]">
              Geen actieve opties in deze categorie.
            </p>
          )}

          <div className="cta-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!value || !inGroep.some((t) => t.id === value)}
              onClick={onContinue}
            >
              Kies een deur
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
          </div>
        </>
      )}
    </section>
  )
}
