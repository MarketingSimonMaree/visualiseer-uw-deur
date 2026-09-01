import { useEffect, useMemo, useRef, useState } from 'react'
import type { PublicCatalogusFilter } from '../lib/contentApi'
import type { Montagetype, Product } from '../types/product'

interface Props {
  producten: Product[]
  filters: PublicCatalogusFilter[]
  montagetype: Montagetype
  selectedId: string | null
  onSelect: (p: Product) => void
  onContinue: () => void
  onBack: () => void
}

export function ProductKiezer({
  producten,
  filters,
  montagetype,
  selectedId,
  onSelect,
  onContinue,
  onBack,
}: Props) {
  const [query, setQuery] = useState('')
  const [filterId, setFilterId] = useState<string | 'alle'>('alle')
  const scrollerRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    setFilterId('alle')
  }, [montagetype])

  const gefilterdOpType = useMemo(
    () =>
      producten.filter((p) => {
        const types = p.montagetypes?.length ? p.montagetypes : [p.montagetype]
        return types.includes(montagetype)
      }),
    [producten, montagetype],
  )

  const zichtbareFilters = useMemo(() => {
    return filters.filter((f) =>
      gefilterdOpType.some((p) => f.productIds.includes(p.id)),
    )
  }, [filters, gefilterdOpType])

  useEffect(() => {
    if (filterId !== 'alle' && !zichtbareFilters.some((f) => f.id === filterId)) {
      setFilterId('alle')
    }
  }, [filterId, zichtbareFilters])

  const zichtbaar = useMemo(() => {
    const q = query.trim().toLowerCase()
    const activeFilter =
      filterId === 'alle'
        ? null
        : zichtbareFilters.find((f) => f.id === filterId) ?? null
    return gefilterdOpType.filter((p) => {
      if (activeFilter && !activeFilter.productIds.includes(p.id)) return false
      if (!q) return true
      return (
        p.naam.toLowerCase().includes(q) ||
        p.collectie.toLowerCase().includes(q) ||
        p.materiaal.toLowerCase().includes(q)
      )
    })
  }, [gefilterdOpType, filterId, query, zichtbareFilters])

  function scrollByCards(direction: -1 | 1) {
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-product-card]')
    const step = (card?.offsetWidth ?? 200) + 16
    el.scrollBy({ left: direction * step * 2, behavior: 'smooth' })
  }

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
          label="Alles"
          active={filterId === 'alle'}
          onClick={() => setFilterId('alle')}
        />
        {zichtbareFilters.map((f) => (
          <FilterChip
            key={f.id}
            label={f.label}
            active={filterId === f.id}
            onClick={() => setFilterId(f.id)}
          />
        ))}
      </div>

      {zichtbaar.length === 0 ? (
        <p className="mt-10 text-[var(--colorDarkGray)]">
          Geen deuren gevonden. Pas uw zoekopdracht of filter aan.
        </p>
      ) : (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--colorDarkGray)]">
              {zichtbaar.length} deuren · scroll naar rechts
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="product-carousel-nav"
                aria-label="Vorige deuren"
                onClick={() => scrollByCards(-1)}
              >
                ←
              </button>
              <button
                type="button"
                className="product-carousel-nav"
                aria-label="Volgende deuren"
                onClick={() => scrollByCards(1)}
              >
                →
              </button>
            </div>
          </div>

          <ul ref={scrollerRef} className="product-carousel">
            {zichtbaar.map((p) => {
              const selected = selectedId === p.id
              return (
                <li key={p.id} data-product-card className="product-carousel-item">
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className={`teaserProduct teaserProduct--compact w-full text-left ${selected ? 'is-selected' : ''}`}
                  >
                    <div className="product-carousel-image">
                      <img src={p.afbeeldingUrl} alt="" />
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-bold leading-snug">
                        {p.naam}
                      </span>
                      <span className="text-xs text-[var(--colorDarkGray)]">
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
        </div>
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
