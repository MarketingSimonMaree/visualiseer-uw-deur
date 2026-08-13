import type { FormEvent } from 'react'
import { useState } from 'react'
import { setSessionEmail } from '../lib/session'

interface Props {
  onDone: (email: string) => void
}

export function EmailGate({ onDone }: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Vul een geldig e-mailadres in.')
      return
    }
    setSessionEmail(trimmed)
    onDone(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="email-gate-title"
        className="w-full max-w-md rounded-[var(--borderRadiusLarge)] bg-white p-6 shadow-xl"
      >
        <h2 id="email-gate-title" className="section-title text-2xl">
          <span className="gold">Bijna</span> klaar
        </h2>
        <p className="mt-3 text-[var(--colorDarkGray)]">
          U heeft 5 visualisaties gemaakt. Laat uw e-mailadres achter om verder te
          gaan — we sturen u desgewenst tips of een vervolg.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">
            E-mailadres
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[var(--inputBorderRadius)] border-[length:var(--inputBorderSize)] border-[var(--inputBorderColor)] px-4 py-3"
            placeholder="naam@voorbeeld.nl"
            required
          />
          {error && (
            <p className="text-sm text-[var(--colorError)]" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full justify-center">
            Verder visualiseren
            <span className="btn-arrow" aria-hidden>
              →
            </span>
          </button>
        </form>
      </div>
    </div>
  )
}
