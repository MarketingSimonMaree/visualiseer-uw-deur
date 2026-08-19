import { useState } from 'react'
import {
  DialogShell,
  KlantGegevensForm,
  type KlantGegevens,
} from './KlantGegevensForm'

interface Props {
  onSubmit: (data: KlantGegevens) => Promise<void>
  onCancel: () => void
}

export function OfferteDialog({ onSubmit, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <DialogShell labelledBy="offerte-title">
        <h2 id="offerte-title" className="section-title text-2xl sm:text-3xl">
          <span className="gold">Aanvraag</span> verstuurd
        </h2>
        <p className="mt-3 text-[var(--colorDarkGray)]">
          Bedankt. Wij nemen contact met u op met een prijsindicatie.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-6 w-full justify-center"
          onClick={onCancel}
        >
          Sluiten
        </button>
      </DialogShell>
    )
  }

  return (
    <DialogShell labelledBy="offerte-title">
      {busy ? (
        <>
          <h2 id="offerte-title" className="section-title text-2xl sm:text-3xl">
            <span className="gold">Bezig</span> met versturen…
          </h2>
          <p className="mt-3 text-[var(--colorDarkGray)]">
            Even geduld — wij sturen uw aanvraag door.
          </p>
        </>
      ) : (
        <>
          <KlantGegevensForm
            title={
              <>
                <span className="gold">Prijs</span>indicatie
              </>
            }
            description="Vul uw gegevens in. Wij ontvangen uw visualisatie, keuzes én originele foto en nemen contact met u op."
            submitLabel="Vraag prijsindicatie aan"
            showPrijsindicatie={false}
            defaultPrijsindicatie
            onSubmit={(data) => {
              setError(null)
              setBusy(true)
              void onSubmit(data)
                .then(() => setDone(true))
                .catch((err: unknown) => {
                  setError(
                    err instanceof Error ? err.message : 'Versturen mislukt',
                  )
                })
                .finally(() => setBusy(false))
            }}
            onCancel={onCancel}
          />
          {error && (
            <p className="mt-3 text-sm text-[var(--colorError)]" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </DialogShell>
  )
}
