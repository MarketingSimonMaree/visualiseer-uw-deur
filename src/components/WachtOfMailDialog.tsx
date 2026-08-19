import { useState } from 'react'
import {
  DialogShell,
  KlantGegevensForm,
  type KlantGegevens,
} from './KlantGegevensForm'

export type DeliveryChoice =
  | { mode: 'wait' }
  | {
      mode: 'mail'
      naam: string
      woonplaats: string
      email: string
      prijsindicatie: boolean
    }

interface Props {
  onChoose: (choice: DeliveryChoice) => void
  onCancel: () => void
}

export function WachtOfMailDialog({ onChoose, onCancel }: Props) {
  const [phase, setPhase] = useState<'keuze' | 'mail'>('keuze')

  return (
    <DialogShell labelledBy="wacht-mail-title">
      {phase === 'keuze' ? (
        <>
          <h2 id="wacht-mail-title" className="section-title text-2xl sm:text-3xl">
            <span className="gold">Even</span> geduld?
          </h2>
          <p className="mt-3 text-[var(--colorDarkGray)]">
            Een visualisatie duurt meestal 15–30 seconden. Wilt u even wachten,
            of het resultaat per e-mail ontvangen — eventueel met een
            prijsindicatie van ons?
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              className="choice-card"
              onClick={() => onChoose({ mode: 'wait' })}
            >
              <p className="font-semibold">Ik wacht even</p>
              <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                Direct op het scherm zien wanneer het klaar is.
              </p>
            </button>
            <button
              type="button"
              className="choice-card"
              onClick={() => setPhase('mail')}
            >
              <p className="font-semibold">Per e-mail ontvangen</p>
              <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                Vul naam, woonplaats en e-mail in. Wij sturen de visualisatie
                toe.
              </p>
            </button>
          </div>

          <button
            type="button"
            className="back-link mt-5 !mb-0"
            onClick={onCancel}
          >
            Annuleren
          </button>
        </>
      ) : (
        <div id="wacht-mail-title">
          <KlantGegevensForm
            title={
              <>
                <span className="gold">Per</span> e-mail
              </>
            }
            description="Vul uw gegevens in. Wij maken de visualisatie en sturen die toe. Uw gegevens worden niet bewaard na verzending."
            submitLabel="Verstuur naar mijn mail"
            onSubmit={(data: KlantGegevens) =>
              onChoose({ mode: 'mail', ...data })
            }
            onCancel={onCancel}
            onBack={() => setPhase('keuze')}
          />
        </div>
      )}
    </DialogShell>
  )
}
