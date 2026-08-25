import { useState, type FormEvent, type ReactNode } from 'react'
import {
  saveAdminTeksten,
  type SituatieTekst,
} from '../lib/adminApi'

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="mt-4 block text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

interface Props {
  initial: SituatieTekst
  onSaved: (next: SituatieTekst) => void
  onError: (msg: string) => void
}

export function AdminTekstenTab({ initial, onSaved, onError }: Props) {
  const [form, setForm] = useState<SituatieTekst>(initial)
  const [saving, setSaving] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    void saveAdminTeksten({
      ...form,
      tips: form.tips.map((t) => t.trim()).filter(Boolean),
      tipsExtra: form.tipsExtra.map((t) => t.trim()).filter(Boolean),
    })
      .then((next) => {
        setForm(next)
        onSaved(next)
      })
      .catch((err: unknown) =>
        onError(err instanceof Error ? err.message : 'Opslaan mislukt'),
      )
      .finally(() => setSaving(false))
  }

  return (
    <div className="mt-6 max-w-2xl">
      <h1 className="section-title text-2xl sm:text-3xl">
        <span className="gold">Teksten</span>
      </h1>
      <p className="mt-1 text-[var(--colorDarkGray)]">
        Pas de tekst op de eerste pagina (foto-upload) aan.
      </p>

      <form
        onSubmit={submit}
        className="mt-6 rounded-xl border border-[var(--colorBorder)] bg-white p-4 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titel (gouden deel)">
            <input
              className="field-input w-full"
              value={form.titelGold}
              onChange={(e) =>
                setForm({ ...form, titelGold: e.target.value })
              }
            />
          </Field>
          <Field label="Titel (rest)">
            <input
              className="field-input w-full"
              value={form.titel}
              onChange={(e) => setForm({ ...form, titel: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Leadtekst">
          <textarea
            className="field-input min-h-24 w-full"
            value={form.lead}
            onChange={(e) => setForm({ ...form, lead: e.target.value })}
          />
        </Field>

        <Field label="Tips (één per regel)">
          <textarea
            className="field-input min-h-28 w-full"
            value={form.tips.join('\n')}
            onChange={(e) =>
              setForm({ ...form, tips: e.target.value.split('\n') })
            }
          />
        </Field>

        <Field label="Subkop onder tips">
          <input
            className="field-input w-full"
            value={form.tipsExtraTitel}
            onChange={(e) =>
              setForm({ ...form, tipsExtraTitel: e.target.value })
            }
          />
        </Field>

        <Field label="Extra tips (één per regel)">
          <textarea
            className="field-input min-h-24 w-full"
            value={form.tipsExtra.join('\n')}
            onChange={(e) =>
              setForm({ ...form, tipsExtra: e.target.value.split('\n') })
            }
          />
        </Field>

        <button
          type="submit"
          className="btn btn-primary mt-6"
          disabled={saving}
        >
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </form>
    </div>
  )
}
