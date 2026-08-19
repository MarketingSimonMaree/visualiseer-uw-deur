import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  adminLogin,
  changeAdminPasswordApi,
  clearAdminToken,
  fetchAdminKleuren,
  fetchAdminMontagetypes,
  fetchAdminProducten,
  getAdminToken,
  getAdminUsername,
  patchAdminMontagetype,
  patchAdminProductApi,
  saveAdminKleur,
  saveAdminProduct,
  type AdminKleur,
  type AdminProduct,
  type ProductInput,
} from './lib/adminApi'
import {
  MONTAGETYPE_LABELS,
  type Materiaal,
  type Montagetype,
  type MontagetypeDef,
} from './types/product'

type Tab = 'producten' | 'montagetypes' | 'kleuren' | 'profiel'

const MONTAGETYPES = Object.keys(MONTAGETYPE_LABELS) as Montagetype[]
const MATERIALEN: Materiaal[] = ['hout', 'staal', 'aluminium']

const emptyForm = (): ProductInput => ({
  id: '',
  naam: '',
  afbeeldingUrl: '',
  paginaUrl: '',
  montagetypes: ['deur-bestaand-kozijn'],
  materiaal: 'hout',
  collectie: '',
  kleurIds: ['ral-9010', 'ral-9005'],
  actief: true,
})

export default function AdminApp() {
  const [tokenReady, setTokenReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [username, setUsername] = useState('carlton')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loggedInAs, setLoggedInAs] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('producten')
  const [error, setError] = useState<string | null>(null)

  const [producten, setProducten] = useState<AdminProduct[]>([])
  const [montages, setMontages] = useState<MontagetypeDef[]>([])
  const [kleuren, setKleuren] = useState<AdminKleur[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'alle' | 'actief' | 'uit'>('alle')

  const [editing, setEditing] = useState<ProductInput | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editingMontage, setEditingMontage] = useState<MontagetypeDef | null>(null)
  const [editingKleur, setEditingKleur] = useState<AdminKleur | null>(null)
  const [isNewKleur, setIsNewKleur] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null)
  const [passwordErr, setPasswordErr] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    setAuthed(Boolean(getAdminToken()))
    setLoggedInAs(getAdminUsername())
    setTokenReady(true)
  }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [p, m, k] = await Promise.all([
        fetchAdminProducten(),
        fetchAdminMontagetypes(),
        fetchAdminKleuren(),
      ])
      setProducten(p)
      setMontages(m)
      setKleuren(k)
      setAuthed(true)
    } catch (err) {
      setAuthed(false)
      setError(err instanceof Error ? err.message : 'Laden mislukt')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tokenReady && authed) void loadAll()
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

  const ralKleuren = useMemo(
    () => kleuren.filter((k) => k.categorie === 'ral'),
    [kleuren],
  )
  const eikenKleuren = useMemo(
    () => kleuren.filter((k) => k.categorie === 'eiken'),
    [kleuren],
  )

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError(null)
    try {
      await adminLogin(username, password)
      setPassword('')
      setLoggedInAs(username.trim().toLowerCase())
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
      montagetypes: p.montagetypes?.length ? p.montagetypes : [p.montagetype],
      materiaal: p.materiaal,
      collectie: p.collectie,
      kleurIds: p.kleurIds?.length ? p.kleurIds : [],
      actief: p.actief,
    })
  }

  async function onSaveProduct(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    if (!editing.montagetypes.length) {
      setError('Kies minstens één montagetype')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const product = await saveAdminProduct(editing)
      setProducten((prev) => {
        const rest = prev.filter((x) => x.id !== product.id)
        return [product, ...rest].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
      })
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
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
            <label className="mt-6 block text-sm font-medium">
              Gebruikersnaam
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 w-full rounded-[var(--inputBorderRadius)] border-2 border-[var(--inputBorderColor)] px-4 py-3"
                required
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
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
              disabled={loggingIn || !username || !password}
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
        <p className="app-brand">
          Simon Maree · Beheer
          {loggedInAs ? (
            <span className="ml-2 text-sm font-normal text-[var(--colorDarkGray)]">
              ({loggedInAs})
            </span>
          ) : null}
        </p>
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm text-[var(--colorDarkGray)] underline">
            Visualisator
          </a>
          <button
            type="button"
            className="text-sm font-medium text-[var(--colorPrimary)]"
            onClick={() => {
              clearAdminToken()
              setAuthed(false)
              setLoggedInAs(null)
            }}
          >
            Uitloggen
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <nav className="flex flex-wrap gap-2 border-b border-[var(--colorBorder)] pb-3">
          {(
            [
              ['producten', 'Producten'],
              ['montagetypes', 'Montagetypes'],
              ['kleuren', 'Kleuren'],
              ['profiel', 'Profiel'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                tab === id
                  ? 'border-[var(--colorPrimary)] bg-[var(--colorPrimary)] text-white'
                  : 'border-[var(--colorBorder)] bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && (
          <p className="mt-4 text-[var(--colorError)]" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="mt-6 text-[var(--colorDarkGray)]">Laden…</p>}

        {!loading && tab === 'producten' && (
          <>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="section-title text-2xl sm:text-3xl">
                  <span className="gold">Producten</span>
                </h1>
                <p className="mt-1 text-[var(--colorDarkGray)]">
                  {producten.length} producten · meerdere montagetypes mogelijk
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsNew(true)
                  setEditing(emptyForm())
                }}
              >
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
                      {(p.montagetypes ?? [p.montagetype]).join(', ')} ·{' '}
                      {p.collectie}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-[var(--colorBorder)] px-3 py-1.5 text-sm"
                      onClick={() =>
                        void patchAdminProductApi(p.id, { actief: !p.actief }).then(
                          (u) =>
                            setProducten((prev) =>
                              prev.map((x) => (x.id === p.id ? u : x)),
                            ),
                        )
                      }
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
            </ul>
          </>
        )}

        {!loading && tab === 'montagetypes' && (
          <div className="mt-6">
            <h1 className="section-title text-2xl sm:text-3xl">
              <span className="gold">Montagetypes</span>
            </h1>
            <p className="mt-1 text-[var(--colorDarkGray)]">
              Wat de klant kiest én wat de AI meekrijgt bij beeldgeneratie.
            </p>
            <ul className="mt-6 space-y-4">
              {montages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{m.label}</p>
                      <p className="text-xs text-[var(--colorDarkGray)]">{m.id}</p>
                      <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                        {m.hint}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--colorPrimary)] px-3 py-1.5 text-sm font-medium text-[var(--colorPrimary)]"
                      onClick={() => setEditingMontage({ ...m })}
                    >
                      Bewerken
                    </button>
                  </div>
                  <div className="mt-3 rounded-lg bg-[#f7f7f7] p-3 text-sm">
                    <p className="mb-1 font-semibold">Agent-prompt</p>
                    <p className="whitespace-pre-wrap text-[var(--colorDarkGray)]">
                      {m.agentPrompt || '—'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && tab === 'kleuren' && (
          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="section-title text-2xl sm:text-3xl">
                  <span className="gold">Kleuren</span>
                </h1>
                <p className="mt-1 text-[var(--colorDarkGray)]">
                  RAL vs eiken, met optioneel staaltje (afbeelding-URL).
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsNewKleur(true)
                  setEditingKleur({
                    id: '',
                    naam: '',
                    categorie: 'ral',
                    hex: '#cccccc',
                    staaltjeUrl: '',
                    actief: true,
                    sortOrder: 100,
                  })
                }}
              >
                Nieuwe kleur
              </button>
            </div>

            <KleurSectie
              title="RAL-kleuren"
              items={ralKleuren}
              onEdit={(k) => {
                setIsNewKleur(false)
                setEditingKleur({ ...k })
              }}
            />
            <KleurSectie
              title="Eiken / houtkleuren"
              items={eikenKleuren}
              onEdit={(k) => {
                setIsNewKleur(false)
                setEditingKleur({ ...k })
              }}
            />
          </div>
        )}

        {!loading && tab === 'profiel' && (
          <div className="mt-6 max-w-xl">
            <h1 className="section-title text-2xl sm:text-3xl">
              <span className="gold">Profiel</span>
            </h1>
            <p className="mt-1 text-[var(--colorDarkGray)]">
              Ingelogd als <strong>{loggedInAs}</strong>
            </p>
            <form
              onSubmit={onChangePassword}
              className="mt-6 rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-5"
            >
              <h2 className="text-lg font-bold">Wachtwoord wijzigen</h2>
              <label className="mt-4 block text-sm font-medium">
                Huidig wachtwoord
                <input
                  type="password"
                  className="field-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label className="mt-3 block text-sm font-medium">
                Nieuw wachtwoord
                <input
                  type="password"
                  className="field-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              <label className="mt-3 block text-sm font-medium">
                Herhaal nieuw wachtwoord
                <input
                  type="password"
                  className="field-input"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              {passwordErr && (
                <p className="mt-3 text-[var(--colorError)]">{passwordErr}</p>
              )}
              {passwordMsg && (
                <p className="mt-3 text-[var(--colorSuccess)]">{passwordMsg}</p>
              )}
              <button
                type="submit"
                className="btn btn-primary mt-5"
                disabled={changingPassword}
              >
                {changingPassword ? 'Opslaan…' : 'Wachtwoord opslaan'}
              </button>
            </form>
          </div>
        )}
      </main>

      {editing && (
        <Modal title={isNew ? 'Nieuw product' : 'Product bewerken'} onClose={() => setEditing(null)}>
          <form onSubmit={onSaveProduct}>
            <Field label="ID (slug)">
              <input
                required
                disabled={!isNew}
                value={editing.id}
                onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                className="field-input"
              />
            </Field>
            <Field label="Naam">
              <input
                required
                value={editing.naam}
                onChange={(e) => setEditing({ ...editing, naam: e.target.value })}
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
            <Field label="Collectie">
              <input
                value={editing.collectie}
                onChange={(e) =>
                  setEditing({ ...editing, collectie: e.target.value })
                }
                className="field-input"
              />
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
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Montagetypes</legend>
              <div className="mt-2 flex flex-col gap-2">
                {MONTAGETYPES.map((m) => {
                  const checked = editing.montagetypes.includes(m)
                  return (
                    <label key={m} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? editing.montagetypes.filter((x) => x !== m)
                            : [...editing.montagetypes, m]
                          setEditing({ ...editing, montagetypes: next })
                        }}
                      />
                      {MONTAGETYPE_LABELS[m]}
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Kleuren</legend>
              <div className="mt-2 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {kleuren.map((k) => {
                  const checked = editing.kleurIds.includes(k.id)
                  return (
                    <label key={k.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? editing.kleurIds.filter((x) => x !== k.id)
                            : [...editing.kleurIds, k.id]
                          setEditing({ ...editing, kleurIds: next })
                        }}
                      />
                      <span
                        className="inline-block h-4 w-4 rounded border"
                        style={{
                          background: k.staaltjeUrl
                            ? undefined
                            : k.hex || '#ddd',
                          backgroundImage: k.staaltjeUrl
                            ? `url(${k.staaltjeUrl})`
                            : undefined,
                          backgroundSize: 'cover',
                        }}
                      />
                      {k.naam}{' '}
                      <span className="text-xs text-[var(--colorDarkGray)]">
                        ({k.categorie})
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
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
            <div className="mt-6 flex gap-3">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
              <button
                type="button"
                className="rounded-full border px-4 py-2"
                onClick={() => setEditing(null)}
              >
                Annuleren
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingMontage && (
        <Modal title="Montagetype bewerken" onClose={() => setEditingMontage(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void patchAdminMontagetype({
                id: editingMontage.id,
                label: editingMontage.label,
                hint: editingMontage.hint,
                agentPrompt: editingMontage.agentPrompt,
                actief: editingMontage.actief,
              })
                .then((m) => {
                  setMontages((prev) =>
                    prev.map((x) => (x.id === m.id ? m : x)),
                  )
                  setEditingMontage(null)
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Opslaan mislukt'),
                )
            }}
          >
            <Field label="Label">
              <input
                className="field-input"
                value={editingMontage.label}
                onChange={(e) =>
                  setEditingMontage({ ...editingMontage, label: e.target.value })
                }
              />
            </Field>
            <Field label="Hint (klant)">
              <input
                className="field-input"
                value={editingMontage.hint}
                onChange={(e) =>
                  setEditingMontage({ ...editingMontage, hint: e.target.value })
                }
              />
            </Field>
            <Field label="Agent-prompt (Engels, voor beeldgeneratie)">
              <textarea
                className="field-input min-h-32"
                value={editingMontage.agentPrompt}
                onChange={(e) =>
                  setEditingMontage({
                    ...editingMontage,
                    agentPrompt: e.target.value,
                  })
                }
              />
            </Field>
            <div className="mt-6 flex gap-3">
              <button type="submit" className="btn btn-primary">
                Opslaan
              </button>
              <button
                type="button"
                className="rounded-full border px-4 py-2"
                onClick={() => setEditingMontage(null)}
              >
                Annuleren
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingKleur && (
        <Modal
          title={isNewKleur ? 'Nieuwe kleur' : 'Kleur bewerken'}
          onClose={() => setEditingKleur(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void saveAdminKleur({
                id: editingKleur.id || undefined,
                naam: editingKleur.naam,
                categorie: editingKleur.categorie,
                hex: editingKleur.hex,
                staaltjeUrl: editingKleur.staaltjeUrl,
                actief: editingKleur.actief,
                sortOrder: editingKleur.sortOrder,
              })
                .then((k) => {
                  setKleuren((prev) => {
                    const rest = prev.filter((x) => x.id !== k.id)
                    return [...rest, k].sort((a, b) => a.sortOrder - b.sortOrder)
                  })
                  setEditingKleur(null)
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Opslaan mislukt'),
                )
            }}
          >
            <Field label="Naam">
              <input
                required
                className="field-input"
                value={editingKleur.naam}
                onChange={(e) =>
                  setEditingKleur({ ...editingKleur, naam: e.target.value })
                }
              />
            </Field>
            {!isNewKleur && (
              <p className="mt-2 text-xs text-[var(--colorDarkGray)]">
                ID: {editingKleur.id}
              </p>
            )}
            <Field label="Categorie">
              <select
                className="field-input"
                value={editingKleur.categorie}
                onChange={(e) =>
                  setEditingKleur({
                    ...editingKleur,
                    categorie: e.target.value,
                  })
                }
              >
                <option value="ral">RAL</option>
                <option value="eiken">Eiken</option>
              </select>
            </Field>
            <Field label="Hex (fallback-swatch)">
              <input
                className="field-input"
                value={editingKleur.hex ?? ''}
                onChange={(e) =>
                  setEditingKleur({ ...editingKleur, hex: e.target.value })
                }
                placeholder="#F7F5EC"
              />
            </Field>
            <Field label="Staaltje-URL (afbeelding)">
              <input
                className="field-input"
                value={editingKleur.staaltjeUrl ?? ''}
                onChange={(e) =>
                  setEditingKleur({
                    ...editingKleur,
                    staaltjeUrl: e.target.value,
                  })
                }
                placeholder="https://…/staaltje.jpg"
              />
            </Field>
            {(editingKleur.staaltjeUrl || editingKleur.hex) && (
              <div className="mt-3 flex items-center gap-3">
                <span
                  className="h-12 w-12 rounded border"
                  style={{
                    background: editingKleur.staaltjeUrl
                      ? undefined
                      : editingKleur.hex || '#ddd',
                    backgroundImage: editingKleur.staaltjeUrl
                      ? `url(${editingKleur.staaltjeUrl})`
                      : undefined,
                    backgroundSize: 'cover',
                  }}
                />
                <span className="text-sm text-[var(--colorDarkGray)]">
                  Voorbeeldstaaltje
                </span>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button type="submit" className="btn btn-primary">
                Opslaan
              </button>
              <button
                type="button"
                className="rounded-full border px-4 py-2"
                onClick={() => setEditingKleur(null)}
              >
                Annuleren
              </button>
            </div>
          </form>
        </Modal>
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

function KleurSectie({
  title,
  items,
  onEdit,
}: {
  title: string
  items: AdminKleur[]
  onEdit: (k: AdminKleur) => void
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {items.map((k) => (
          <li
            key={k.id}
            className="flex items-center gap-3 rounded-[var(--borderRadius)] border border-[var(--colorBorder)] bg-white p-3"
          >
            <span
              className="h-12 w-12 shrink-0 rounded border"
              style={{
                background: k.staaltjeUrl ? undefined : k.hex || '#ddd',
                backgroundImage: k.staaltjeUrl ? `url(${k.staaltjeUrl})` : undefined,
                backgroundSize: 'cover',
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{k.naam}</p>
              <p className="text-xs text-[var(--colorDarkGray)]">{k.id}</p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-[var(--colorPrimary)]"
              onClick={() => onEdit(k)}
            >
              Bewerk
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[var(--borderRadiusLarge)] bg-white p-5 sm:rounded-[var(--borderRadiusLarge)] sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" className="text-sm underline" onClick={onClose}>
            Sluiten
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block text-sm font-medium">
      {label}
      {children}
    </label>
  )
}
