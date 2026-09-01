import type { KleurOptie, Product } from '../types/product'
import { BESLAG_KLEUREN } from '../data/beslagKleuren'

interface Props {
  product: Product
  value: string | null
  onChange: (kleur: string) => void
  beslagKleur: string | null
  onBeslagKleurChange: (kleurId: string) => void
  onBack: () => void
  onGenerate: () => void
  generating: boolean
  remaining: number
}

function normalizeKleuren(product: Product): KleurOptie[] {
  return (product.kleuren ?? []).map((k) =>
    typeof k === 'string'
      ? {
          id: k,
          naam: k,
          categorie: /eiken|hout/i.test(k) ? 'eiken' : 'ral',
          hex: null,
          staaltjeUrl: null,
        }
      : k,
  )
}

export function KleurKiezer({
  product,
  value,
  onChange,
  beslagKleur,
  onBeslagKleurChange,
  onBack,
  onGenerate,
  generating,
  remaining,
}: Props) {
  const kleuren = normalizeKleuren(product)
  const ral = kleuren.filter((k) => k.categorie !== 'eiken')
  const eiken = kleuren.filter((k) => k.categorie === 'eiken')

  return (
    <section className="page">
      <button type="button" onClick={onBack} className="back-link">
        ← Wijzig
      </button>

      <div className="page-intro">
        <h1 className="section-title">
          <span className="gold">Kies</span> een kleur
        </h1>
      </div>

      <div className="flex items-center gap-4 rounded-[var(--borderRadius)] border border-[var(--colorGray)] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
        <img
          src={product.afbeeldingUrl}
          alt=""
          className="h-28 w-20 object-contain"
        />
        <div>
          <p className="font-bold">{product.naam}</p>
          <p className="text-sm text-[var(--colorDarkGray)]">{product.collectie}</p>
        </div>
      </div>

      <div className="note-banner mt-5" role="note">
        Kleuren zijn indicatief. Niet elke deur is in elke kleur leverbaar — we
        controleren dit bij uw aanvraag.
      </div>

      {ral.length > 0 && (
        <KleurGrid
          title="RAL-kleuren"
          items={ral}
          value={value}
          onChange={onChange}
        />
      )}
      {eiken.length > 0 && (
        <KleurGrid
          title="Eiken / houtkleuren"
          items={eiken}
          value={value}
          onChange={onChange}
        />
      )}

      <div className="mt-10 border-t border-[var(--colorBorder)] pt-8">
        <h2 className="section-title text-2xl sm:text-3xl">
          <span className="gold">Deurbeslag</span>
        </h2>
        <p className="mt-2 text-[var(--colorDarkGray)]">
          Kies de kleur van het beslag. Knop, rozet, brievenbus, greep en ander
          beslag krijgen allemaal dezelfde afwerking.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BESLAG_KLEUREN.map((optie) => {
            const selected = beslagKleur === optie.id
            return (
              <li key={optie.id}>
                <button
                  type="button"
                  onClick={() => onBeslagKleurChange(optie.id)}
                  className={`choice-card flex items-center gap-3 !py-3 ${selected ? 'is-selected' : ''}`}
                >
                  <span
                    className="h-10 w-10 shrink-0 rounded-md border border-[var(--colorBorder)]"
                    style={{ background: optie.hex }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium">{optie.naam}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="cta-row items-center">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!value || !beslagKleur || generating}
          onClick={onGenerate}
        >
          {generating ? 'Bezig…' : 'Bekijk in uw ruimte'}
          <span className="btn-arrow" aria-hidden>
            →
          </span>
        </button>
        {Number.isFinite(remaining) && (
          <p className="text-sm text-[var(--colorDarkGray)]">
            Nog {remaining} visualisatie{remaining === 1 ? '' : 's'} beschikbaar
          </p>
        )}
      </div>
    </section>
  )
}

function KleurGrid({
  title,
  items,
  value,
  onChange,
}: {
  title: string
  items: KleurOptie[]
  value: string | null
  onChange: (kleur: string) => void
}) {
  return (
    <div className="mt-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((kleur) => {
          const selected = value === kleur.naam || value === kleur.id
          return (
            <li key={kleur.id}>
              <button
                type="button"
                onClick={() => onChange(kleur.naam)}
                className={`choice-card flex items-center gap-3 !py-3 ${selected ? 'is-selected' : ''}`}
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-md border border-[var(--colorBorder)]"
                  style={{
                    background: kleur.staaltjeUrl
                      ? undefined
                      : kleur.hex || '#d0d0d0',
                    backgroundImage: kleur.staaltjeUrl
                      ? `url(${kleur.staaltjeUrl})`
                      : undefined,
                    backgroundSize: 'cover',
                  }}
                  aria-hidden
                />
                <span className="text-sm font-medium">{kleur.naam}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
