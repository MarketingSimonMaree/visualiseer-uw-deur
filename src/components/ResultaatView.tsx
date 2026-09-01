import { useState } from 'react'
import { OfferteDialog } from './OfferteDialog'
import { downloadResultaat } from '../lib/download'
import type { GeneratieResultaat, Product } from '../types/product'
import { ResultaatStrip } from './ResultaatStrip'
import type { KlantGegevens } from './KlantGegevensForm'
import { BESLAG_KLEUREN } from '../data/beslagKleuren'

interface Props {
  resultaat: GeneratieResultaat
  product: Product
  geschiedenis: GeneratieResultaat[]
  onSelectResultaat: (id: string) => void
  onRetry: () => void
  onAndereDeur: () => void
  onOfferte: (data: KlantGegevens) => Promise<void>
  mock?: boolean
}

export function ResultaatView({
  resultaat,
  product,
  geschiedenis,
  onSelectResultaat,
  onRetry,
  onAndereDeur,
  onOfferte,
  mock,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOfferte, setShowOfferte] = useState(false)
  const beslagNaam =
    BESLAG_KLEUREN.find((b) => b.id === resultaat.beslagKleur)?.naam ?? null

  async function handleDownload() {
    setError(null)
    setBusy(true)
    try {
      await downloadResultaat(resultaat.imageUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download mislukt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="page flex-1">
        <div className="page-intro">
          <h1 className="section-title">
            <span className="gold">Uw</span> deur in beeld
          </h1>
          <p className="lead">
            {product.naam} · {resultaat.kleur}
            {beslagNaam ? ` · beslag ${beslagNaam}` : ''}
            {resultaat.fromCache ? ' · uit cache' : ''}
          </p>
        </div>

        {mock && (
          <p className="note-banner mb-5 text-sm">
            Demo-modus: zet <code>OPENAI_API_KEY</code> in <code>.env.local</code> voor
            echte generaties.
          </p>
        )}

        <div className="overflow-hidden rounded-[var(--borderRadiusLarge)] border border-[var(--colorGray)] bg-[var(--canvasBg)]">
          <img
            src={resultaat.imageUrl}
            alt={`Visualisatie van ${product.naam} in ${resultaat.kleur}`}
            className="mx-auto max-h-[65vh] w-full object-contain"
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-[var(--colorError)]" role="alert">
            {error}
          </p>
        )}

        <div className="cta-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void handleDownload()}
          >
            {busy ? 'Bezig…' : 'Download foto'}
            <span className="btn-arrow" aria-hidden>
              →
            </span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowOfferte(true)}
          >
            Offerte
            <span className="btn-arrow" aria-hidden>
              →
            </span>
          </button>
          <button type="button" className="choice-card !w-auto !py-3" onClick={onRetry}>
            Opnieuw proberen
          </button>
          <button type="button" className="back-link !mb-0" onClick={onAndereDeur}>
            Andere deur kiezen
          </button>
        </div>

        <p className="mt-4 text-sm text-[var(--colorDarkGray)]">
          Ziet het er niet goed uit? Gebruik Opnieuw proberen — dat telt niet mee
          voor uw sessielimiet.
        </p>
      </section>

      <ResultaatStrip
        items={geschiedenis}
        activeId={resultaat.id}
        onSelect={onSelectResultaat}
      />

      {showOfferte && (
        <OfferteDialog
          onCancel={() => setShowOfferte(false)}
          onSubmit={onOfferte}
        />
      )}
    </div>
  )
}
