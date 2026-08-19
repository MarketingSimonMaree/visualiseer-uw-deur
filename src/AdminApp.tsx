import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  adminLogin,
  changeAdminPasswordApi,
  clearAdminToken,
  fetchAdminProducten,
  getAdminToken,
  patchAdminProductApi,
  saveAdminProduct,
  type AdminProduct,
  type ProductInput,
} from './lib/adminApi'
import { MONTAGETYPE_LABELS, type Materiaal, type Montagetype } from './types/product'

const MONTAGETYPES = Object.keys(MONTAGETYPE_LABELS) as Montagetype[]
const MATERIALEN: Materiaal[] = ['hout', 'staal', 'aluminium']

const emptyForm = (): ProductInput => ({
  id: '',
  naam: '',
  afbeeldingUrl: '',
  paginaUrl: '',
  montagetype: 'deur-bestaand-kozijn',
  materiaal: 'hout',
  collectie: '',
  kleuren: ['RAL 9010', 'RAL 9005'],
  actief: true,
})

export default function AdminApp() {
  const [tokenReady, setTokenReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  const [producten, setProducten] = useState<AdminProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'alle' | 'actief' | 'uit'>('alle')

  const [editing, setEditing] = useState<ProductInput | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [passwordErr, setPasswordErr] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    setAuthed(Boolean(getAdminToken()))
    setTokenReady(true)
  }, [])

  async function loadProducten() {
    setLoading(true)
    setError(null)
    try {
      setProducten(await fetchAdminProducten())
      setAuthed(true)
    } catch (err) {
      setAuthed(false)
      setError(err instanceof Error ? err.message : 'Laden mislukt')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tokenReady && authed) void loadProducten()
  }, [tokenReady, authed])

  const zichtbaar = useMemo(() => {
    const q = query.trim().toLowerCase()
    return producten.filter((p) => {
      if (filter === 'actief' && !p.actief) return false
      if (filter === 'uit' && p.actief) return false
      if (!q) return true
      return (
        p.naam.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.collectie.toLowerCase().includes(q)
      )
    })
  }, [producten, query, filter])

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError(null)
    try {
      await adminLogin(password)
      setPassword('')
      setAuthed(true)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Inloggen mislukt')
    } finally {
      setLoggingIn(false)
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordErr(null)
    setPasswordMsg(null)
    if (newPassword.length < 6) {
      setPasswordErr('Nieuw wachtwoord moet minimaal 6 tekens zijn')
      return
    }
    if (newPassword !== newPassword2) {
      setPasswordErr('Nieuwe wachtwoorden komen niet overeen')
      return
    }
    setChangingPassword(true)
    try {
      await changeAdminPasswordApi(currentPassword, newPassword)
      setPasswordMsg('Wachtwoord is gewijzigd')
      setCurrentPassword('')
      setNewPassword('')
      setNewPassword2('')
    } catch (err) {
      setPasswordErr(
        err instanceof Error ? err.message : 'Wachtwoord wijzigen mislukt',
      )
    } finally {
      setChangingPassword(false)
    }
  }

  function startEdit(p: AdminProduct) {
    setIsNew(false)
    setEditing({
      id: p.id,
      naam: p.naam,
      afbeeldingUrl: p.afbeeldingUrl,
      paginaUrl: p.paginaUrl,
      montagetype: p.montagetype,
      materiaal: p.materiaal,
      collectie: p.collectie,
      kleuren: p.kleuren,
      actief: p.actief,
    })
  }

  function startNew() {
    setIsNew(true)
    setEditing(emptyForm())
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const product = await saveAdminProduct(editing)
      setProducten((prev) => {
        const rest = prev.filter((x) => x.id !== product.id)
        return [product, ...rest].sort((a, b) =>
          a.naam.localeCompare(b.naam, 'nl'),
        )
      })
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActief(p: AdminProduct) {
    try {
      const updated = await patchAdminProductApi(p.id, { actief: !p.actief })
      setProducten((prev) => prev.map((x) => (x.id === p.id ? updated : x)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wijzigen mislukt')
    }
  }

  if (!tokenReady) return null

  if (!authed) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <p className="app-brand">Simon Maree · Beheer</p>
          <a href="/" className="text-sm text-[var(--colorDarkGray)] underline">
            Terug naar visualisator
          </a>
        </header>
        <main className="flex flex-1 items-start justify-center p-6">
          <form
            onSubmit={onLogin}
            className="w-full max-w-md rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-6 shadow-sm"
          >
            <h1 className="section-title text-2xl">
              <span className="gold">Inloggen</span>
            </h1>
            <p className="mt-2 text-[var(--colorDarkGray)]">
              Beheer van de productcatalogus voor de deurvisualisator.
            </p>
            <label className="mt-6 block text-sm font-medium">
              Wachtwoord
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-[var(--inputBorderRadius)] border-2 border-[var(--inputBorderColor)] px-4 py-3"
                required
              />
            </label>
            {loginError && (
              <p className="mt-3 text-[var(--colorError)]" role="alert">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary mt-6 w-full"
              disabled={loggingIn || !password}
            >
              {loggingIn ? 'Bezig…' : 'Inloggen'}
            </button>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-brand">Simon Maree · Beheer</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-sm font-medium text-[var(--colorDarkGray)] underline"
            onClick={() => {
              setShowPasswordForm((v) => !v)
              setPasswordErr(null)
              setPasswordMsg(null)
            }}
          >
            Wachtwoord
          </button>
          <a href="/" className="text-sm text-[var(--colorDarkGray)] underline">
            Visualisator
          </a>
          <button
            type="button"
            className="text-sm font-medium text-[var(--colorPrimary)]"
            onClick={() => {
              clearAdminToken()
              setAuthed(false)
              setProducten([])
            }}
          >
            Uitloggen
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {showPasswordForm && (
          <form
            onSubmit={onChangePassword}
            className="mb-6 rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4 sm:p-5"
          >
            <h2 className="text-lg font-bold">Wachtwoord wijzigen</h2>
            <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
              Na opslaan geldt het nieuwe wachtwoord direct (ook op Vercel).
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                Huidig
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="field-input"
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Nieuw
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="field-input"
                  required
                  minLength={6}
                />
              </label>
              <label className="block text-sm font-medium">
                Herhaal nieuw
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  className="field-input"
                  required
                  minLength={6}
                />
              </label>
            </div>
            {passwordErr && (
              <p className="mt-3 text-[var(--colorError)]" role="alert">
                {passwordErr}
              </p>
            )}
            {passwordMsg && (
              <p className="mt-3 text-[var(--colorSuccess)]">{passwordMsg}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={changingPassword}
              >
                {changingPassword ? 'Opslaan…' : 'Wachtwoord opslaan'}
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--colorBorder)] px-4 py-2 text-sm"
                onClick={() => setShowPasswordForm(false)}
              >
                Sluiten
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="section-title text-2xl sm:text-3xl">
              <span className="gold">Producten</span>
            </h1>
            <p className="mt-1 text-[var(--colorDarkGray)]">
              {producten.length} producten in de database
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={startNew}>
            Nieuw product
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op naam, id of collectie"
            className="w-full max-w-md rounded-[var(--inputBorderRadius)] border-2 border-[var(--inputBorderColor)] px-4 py-3"
          />
          <div className="flex gap-2">
            {(
              [
                ['alle', 'Alle'],
                ['actief', 'Actief'],
                ['uit', 'Uitgeschakeld'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  filter === value
                    ? 'border-[var(--colorPrimary)] bg-[var(--colorPrimary)] text-white'
                    : 'border-[var(--colorBorder)] bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-4 text-[var(--colorError)]" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="mt-6 text-[var(--colorDarkGray)]">Laden…</p>}

        {!loading && (
          <ul className="mt-6 divide-y divide-[var(--colorBorder)] rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white">
            {zichtbaar.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
              >
                <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-[#f3f3f3]">
                  <img
                    src={p.afbeeldingUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{p.naam}</p>
                  <p className="text-sm text-[var(--colorDarkGray)]">
                    {p.collectie} · {p.montagetype} · {p.materiaal}
                  </p>
                  <p className="truncate text-xs text-[var(--colorDarkGray)]">
                    {p.id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      p.actief
                        ? 'bg-[var(--colorGreen)]/15 text-[var(--colorGreen)]'
                        : 'bg-[var(--colorGray)] text-[var(--colorDarkGray)]'
                    }`}
                  >
                    {p.actief ? 'Actief' : 'Uit'}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--colorBorder)] px-3 py-1.5 text-sm"
                    onClick={() => void toggleActief(p)}
                  >
                    {p.actief ? 'Uitschakelen' : 'Activeren'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[var(--colorPrimary)] px-3 py-1.5 text-sm font-medium text-[var(--colorPrimary)]"
                    onClick={() => startEdit(p)}
                  >
                    Bewerken
                  </button>
                </div>
              </li>
            ))}
            {zichtbaar.length === 0 && (
              <li className="p-6 text-[var(--colorDarkGray)]">
                Geen producten gevonden.
              </li>
            )}
          </ul>
        )}
      </main>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
          <form
            onSubmit={onSave}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--borderRadiusLarge)] bg-white p-5 sm:rounded-[var(--borderRadiusLarge)] sm:p-6"
          >
            <h2 className="text-xl font-bold">
              {isNew ? 'Nieuw product' : 'Product bewerken'}
            </h2>

            <Field label="ID (slug)">
              <input
                required
                disabled={!isNew}
                value={editing.id}
                onChange={(e) =>
                  setEditing({ ...editing, id: e.target.value })
                }
                className="field-input"
              />
            </Field>
            <Field label="Naam">
              <input
                required
                value={editing.naam}
                onChange={(e) =>
                  setEditing({ ...editing, naam: e.target.value })
                }
                className="field-input"
              />
            </Field>
            <Field label="Afbeelding-URL">
              <input
                required
                value={editing.afbeeldingUrl}
                onChange={(e) =>
                  setEditing({ ...editing, afbeeldingUrl: e.target.value })
                }
                className="field-input"
              />
            </Field>
            <Field label="Productpagina-URL">
              <input
                value={editing.paginaUrl ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, paginaUrl: e.target.value })
                }
                className="field-input"
              />
            </Field>
            <Field label="Collectie">
              <input
                value={editing.collectie}
                onChange={(e) =>
                  setEditing({ ...editing, collectie: e.target.value })
                }
                className="field-input"
              />
            </Field>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Montagetype">
                <select
                  value={editing.montagetype}
                  onChange={(e) =>
                    setEditing({ ...editing, montagetype: e.target.value })
                  }
                  className="field-input"
                >
                  {MONTAGETYPES.map((m) => (
                    <option key={m} value={m}>
                      {MONTAGETYPE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Materiaal">
                <select
                  value={editing.materiaal}
                  onChange={(e) =>
                    setEditing({ ...editing, materiaal: e.target.value })
                  }
                  className="field-input"
                >
                  {MATERIALEN.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Kleuren (kommagescheiden)">
              <input
                value={
                  Array.isArray(editing.kleuren)
                    ? editing.kleuren.join(', ')
                    : String(editing.kleuren)
                }
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    kleuren: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="field-input"
              />
            </Field>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.actief !== false}
                onChange={(e) =>
                  setEditing({ ...editing, actief: e.target.checked })
                }
              />
              Actief in de visualisator
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--colorBorder)] px-4 py-2"
                onClick={() => setEditing(null)}
              >
                Annuleren
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .field-input {
          margin-top: 0.35rem;
          width: 100%;
          border-radius: var(--inputBorderRadius);
          border: 2px solid var(--inputBorderColor);
          padding: 0.65rem 0.9rem;
          font-size: 1rem;
        }
      `}</style>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="mt-3 block text-sm font-medium">
      {label}
      {children}
    </label>
  )
}
