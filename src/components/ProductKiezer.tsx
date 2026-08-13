import { useMemo, useState } from 'react'
import { collectiesVan } from '../data/producten'
import type { Montagetype, Product } from '../types/product'

interface Props {
  producten: Product[]
  montagetype: Montagetype
  selectedId: string | null
  onSelect: (p: Product) => void
  onContinue: () => void
  onBack: () => void
}

export function ProductKiezer({
  producten,
  montagetype,
  selectedId,
  onSelect,
  onContinue,
  onBack,
}: Props) {
  const [query, setQuery] = useState('')
  const [collectie, setCollectie] = useState<string | 'alle'>('alle')

  const gefilterdOpType = useMemo(
    () => producten.filter((p) => p.montagetype === montagetype),
    [producten, montagetype],
  )

  const collecties = useMemo(() => collectiesVan(gefilterdOpType), [gefilterdOpType])

  const zichtbaar = useMemo(() => {
    const q = query.trim().toLowerCase()
    return gefilterdOpType.filter((p) => {
      if (collectie !== 'alle' && p.collectie !== collectie) return false
      if (!q) return true
      return (
        p.naam.toLowerCase().includes(q) ||
        p.collectie.toLowerCase().includes(q) ||
        p.materiaal.toLowerCase().includes(q)
      )
    })
  }, [gefilterdOpType, collectie, query])

  return (
    <section className="page" style={{ maxWidth: 1100 }}>
      <button type="button" onClick={onBack} className="back-link">
        ← Wijzig
      </button>

      <div className="page-intro">
        <h1 className="section-title">
          <span className="gold">Deur</span> uitkiezen
        </h1>
        <p className="lead">
          Zoek en filter — genereren gebeurt pas als u op Bekijk in uw ruimte
          klikt.
        </p>
      </div>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op naam of collectie"
          className="w-full max-w-md rounded-[var(--inputBorderRadius)] border-2 border-[var(--inputBorderColor)] bg-white px-4 py-3 text-base placeholder:text-[var(--inputPlaceholderColor)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--colorPrimary)]"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip
          label="Alle collecties"
          active={collectie === 'alle'}
          onClick={() => setCollectie('alle')}
        />
        {collecties.map((c) => (
          <FilterChip
            key={c}
            label={c}
            active={collectie === c}
            onClick={() => setCollectie(c)}
          />
        ))}
      </div>

      {zichtbaar.length === 0 ? (
        <p className="mt-10 text-[var(--colorDarkGray)]">
          Geen deuren gevonden. Pas uw zoekopdracht of filter aan.
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {zichtbaar.map((p) => {
            const selected = selectedId === p.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className={`teaserProduct w-full text-left ${selected ? 'is-selected' : ''}`}
                >
                  <div className="flex aspect-[3/4] items-center justify-center bg-[#f0f0f0] p-3">
                    <img
                      src={p.afbeeldingUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
                    <span className="font-bold leading-snug">{p.naam}</span>
                    <span className="text-sm text-[var(--colorDarkGray)]">
                      {p.collectie}
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-[var(--colorPrimary)]">
                      Selecteer
                      <span aria-hidden>→</span>
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="cta-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!selectedId}
          onClick={onContinue}
        >
          Kies een kleur
          <span className="btn-arrow" aria-hidden>
            →
          </span>
        </button>
      </div>
    </section>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-[var(--transition)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--colorPrimary)] ${
        active
          ? 'border-[var(--colorPrimary)] bg-[var(--colorPrimary)] text-white'
          : 'border-[var(--colorBorder)] bg-white text-[var(--colorText)]'
      }`}
    >
      {label}
    </button>
  )
}
