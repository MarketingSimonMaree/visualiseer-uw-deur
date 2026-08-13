import type { Product } from '../types/product'

const RAL_HEX: Record<string, string> = {
  'RAL 9010': '#F7F5EC',
  'RAL 9016': '#F7FBF5',
  'RAL 9001': '#F5E9D9',
  'RAL 9005': '#0E0E10',
  'RAL 7021': '#2F3234',
  'RAL 7016': '#383E42',
  'RAL 3004': '#6B1C23',
  'RAL 6009': '#27352A',
  'Eiken natuurlijk': '#C4A574',
  'Eiken gerookt': '#6B5344',
  'Eiken Afrormosia': '#8B5A2B',
}

interface Props {
  product: Product
  value: string | null
  onChange: (kleur: string) => void
  onBack: () => void
  onGenerate: () => void
  generating: boolean
  remaining: number
}

export function KleurKiezer({
  product,
  value,
  onChange,
  onBack,
  onGenerate,
  generating,
  remaining,
}: Props) {
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

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {product.kleuren.map((kleur) => {
          const selected = value === kleur
          const swatch = RAL_HEX[kleur] ?? '#d0d0d0'
          return (
            <li key={kleur}>
              <button
                type="button"
                onClick={() => onChange(kleur)}
                className={`choice-card flex items-center gap-3 !py-3 ${selected ? 'is-selected' : ''}`}
              >
                <span
                  className="h-10 w-10 shrink-0 rounded-md border border-[var(--colorBorder)]"
                  style={{ background: swatch }}
                  aria-hidden
                />
                <span className="text-sm font-medium">{kleur}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="cta-row items-center">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!value || generating}
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
