import { useState, type FormEvent, type ReactNode } from 'react'
import { getSessionEmail } from '../lib/session'

export type KlantGegevens = {
  naam: string
  woonplaats: string
  email: string
  prijsindicatie: boolean
}

interface Props {
  title: ReactNode
  description: string
  submitLabel: string
  showPrijsindicatie?: boolean
  defaultPrijsindicatie?: boolean
  onSubmit: (data: KlantGegevens) => void
  onCancel: () => void
  onBack?: () => void
}

export function KlantGegevensForm({
  title,
  description,
  submitLabel,
  showPrijsindicatie = true,
  defaultPrijsindicatie = true,
  onSubmit,
  onCancel,
  onBack,
}: Props) {
  const [naam, setNaam] = useState('')
  const [woonplaats, setWoonplaats] = useState('')
  const [email, setEmail] = useState(() => getSessionEmail() ?? '')
  const [prijsindicatie, setPrijsindicatie] = useState(defaultPrijsindicatie)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = naam.trim()
    const w = woonplaats.trim()
    const m = email.trim()
    if (!n) {
      setError('Vul uw naam in.')
      return
    }
    if (!w) {
      setError('Vul uw woonplaats in.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) {
      setError('Vul een geldig e-mailadres in.')
      return
    }
    onSubmit({
      naam: n,
      woonplaats: w,
      email: m,
      prijsindicatie: showPrijsindicatie ? prijsindicatie : true,
    })
  }

  return (
    <>
      <h2 className="section-title text-2xl sm:text-3xl">{title}</h2>
      <p className="mt-3 text-[var(--colorDarkGray)]">{description}</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="klant-naam">
            Naam
          </label>
          <input
            id="klant-naam"
            type="text"
            autoComplete="name"
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            className="mt-1 w-full rounded-[var(--inputBorderRadius)] border-[length:var(--inputBorderSize)] border-[var(--inputBorderColor)] px-4 py-3"
            placeholder="Uw naam"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="klant-woonplaats">
            Woonplaats
          </label>
          <input
            id="klant-woonplaats"
            type="text"
            autoComplete="address-level2"
            value={woonplaats}
            onChange={(e) => setWoonplaats(e.target.value)}
            className="mt-1 w-full rounded-[var(--inputBorderRadius)] border-[length:var(--inputBorderSize)] border-[var(--inputBorderColor)] px-4 py-3"
            placeholder="Bijv. Utrecht"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="klant-email">
            E-mailadres
          </label>
          <input
            id="klant-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-[var(--inputBorderRadius)] border-[length:var(--inputBorderSize)] border-[var(--inputBorderColor)] px-4 py-3"
            placeholder="naam@voorbeeld.nl"
            required
          />
        </div>

        {showPrijsindicatie && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={prijsindicatie}
              onChange={(e) => setPrijsindicatie(e.target.checked)}
            />
            <span>
              Ik ontvang graag ook een prijsindicatie van Simon Maree (wij nemen
              contact met u op).
            </span>
          </label>
        )}

        {error && (
          <p className="text-sm text-[var(--colorError)]" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full justify-center">
          {submitLabel}
          <span className="btn-arrow" aria-hidden>
            →
          </span>
        </button>
        {onBack ? (
          <button type="button" className="back-link !mb-0" onClick={onBack}>
            Terug
          </button>
        ) : (
          <button type="button" className="back-link !mb-0" onClick={onCancel}>
            Annuleren
          </button>
        )}
      </form>
    </>
  )
}

interface DialogShellProps {
  children: ReactNode
  labelledBy: string
}

export function DialogShell({ children, labelledBy }: DialogShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[var(--borderRadiusLarge)] bg-white p-6 shadow-xl"
      >
        {children}
      </div>
    </div>
  )
}
