import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  adminLogin,
  changeAdminPasswordApi,
  clearAdminToken,
  createAdminBeslag,
  fetchAdminBeslag,
  fetchAdminCollecties,
  fetchAdminFilters,
  fetchAdminKleuren,
  fetchAdminMail,
  fetchAdminMontagetypes,
  fetchAdminProducten,
  fetchAdminTeksten,
  getAdminToken,
  getAdminUsername,
  patchAdminBeslag,
  patchAdminMailTemplate,
  patchAdminProductApi,
  saveAdminCollectie,
  saveAdminKleur,
  saveAdminMontagetype,
  saveAdminProduct,
  AdminApiError,
  type AdminBeslag,
  type AdminKleur,
  type AdminMailMeta,
  type AdminMailTemplate,
  type AdminProduct,
  type CatalogusFilter,
  type CollectieDefault,
  type ProductInput,
  type SituatieTekst,
} from './lib/adminApi'
import { AdminFiltersTab } from './components/AdminFiltersTab'
import { AdminTekstenTab } from './components/AdminTekstenTab'
import {
  MONTAGETYPE_LABELS,
  type Materiaal,
  type Montagetype,
  type MontagetypeDef,
} from './types/product'

type Tab =
  | 'producten'
  | 'collecties'
  | 'montagetypes'
  | 'beslag'
  | 'kleuren'
  | 'filters'
  | 'teksten'
  | 'mail'
  | 'profiel'

const DEFAULT_SITUATIE: SituatieTekst = {
  titelGold: 'Huidige',
  titel: 'situatie',
  lead:
    'Upload een foto van de deuropening zoals die nu is. Zo ziet u straks precies hoe de nieuwe deur past.',
  tips: [
    'Houd de deur recht en in het midden',
    'Breng de volledige deur en het kozijn in beeld',
    'Zorg voor voldoende ruimte rondom',
  ],
  tipsExtraTitel: 'Let daarnaast op:',
  tipsExtra: [
    'Zorg dat de deur gesloten is',
    'Maak de foto bij voldoende licht en zonder obstakels',
  ],
}

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
  beslagId: null,
  agentExtra: '',
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
  const [beslagLijst, setBeslagLijst] = useState<AdminBeslag[]>([])
  const [collectieDefaults, setCollectieDefaults] = useState<CollectieDefault[]>(
    [],
  )
  const [mailMeta, setMailMeta] = useState<AdminMailMeta | null>(null)
  const [situatieTekst, setSituatieTekst] =
    useState<SituatieTekst>(DEFAULT_SITUATIE)
  const [catalogusFilters, setCatalogusFilters] = useState<CatalogusFilter[]>(
    [],
  )
  const [editingMail, setEditingMail] = useState<AdminMailTemplate | null>(null)
  const [editingCollectie, setEditingCollectie] =
    useState<CollectieDefault | null>(null)
  const [applyCollectieToProducts, setApplyCollectieToProducts] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'alle' | 'actief' | 'uit'>('alle')

  const [editing, setEditing] = useState<ProductInput | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editingMontage, setEditingMontage] = useState<MontagetypeDef | null>(null)
  const [editingBeslag, setEditingBeslag] = useState<AdminBeslag | null>(null)
  const [isNewBeslag, setIsNewBeslag] = useState(false)
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
      const results = await Promise.allSettled([
        fetchAdminProducten(),
        fetchAdminMontagetypes(),
        fetchAdminKleuren(),
        fetchAdminBeslag(),
        fetchAdminMail(),
        fetchAdminCollecties(),
        fetchAdminTeksten(),
        fetchAdminFilters(),
      ])

      const authFail = results.find(
        (r) =>
          r.status === 'rejected' &&
          r.reason instanceof AdminApiError &&
          r.reason.status === 401,
      )
      if (authFail) {
        clearAdminToken()
        setAuthed(false)
        setLoggedInAs(null)
        setError('Sessie verlopen. Log opnieuw in.')
        return
      }

      const labels = [
        'producten',
        'montagetypes',
        'kleuren',
        'beslag',
        'e-mail',
        'collecties',
        'teksten',
        'filters',
      ] as const
      const failures = results
        .map((r, i) =>
          r.status === 'rejected'
            ? `${labels[i]}: ${r.reason instanceof Error ? r.reason.message : 'mislukt'}`
            : null,
        )
        .filter(Boolean)

      if (results[0].status === 'fulfilled') setProducten(results[0].value)
      if (results[1].status === 'fulfilled') setMontages(results[1].value)
      if (results[2].status === 'fulfilled') setKleuren(results[2].value)
      if (results[3].status === 'fulfilled') {
        setBeslagLijst(results[3].value.beslag)
      }
      if (results[4].status === 'fulfilled') setMailMeta(results[4].value)
      if (results[5].status === 'fulfilled') {
        setCollectieDefaults(results[5].value)
      }
      if (results[6].status === 'fulfilled') {
        setSituatieTekst(results[6].value.situatie)
      }
      if (results[7].status === 'fulfilled') {
        setCatalogusFilters(results[7].value)
      }

      // Blijf ingelogd zolang de sessie geldig is — ook als optionele routes falen
      setAuthed(true)
      if (failures.length) {
        setError(
          `Sommige onderdelen konden niet laden (${failures.join(' · ')}). De rest werkt wel.`,
        )
      }
    } catch (err) {
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
      beslagId: p.beslagId ?? null,
      agentExtra: p.agentExtra ?? '',
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
              ['collecties', 'Collecties'],
              ['filters', 'Filters'],
              ['montagetypes', 'Montagetypes'],
              ['beslag', 'Beslag'],
              ['kleuren', 'Kleuren'],
              ['teksten', 'Teksten'],
              ['mail', 'E-mail'],
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

        {!loading && tab === 'collecties' && (
          <div className="mt-6">
            <h1 className="section-title text-2xl sm:text-3xl">
              <span className="gold">Collecties</span>
            </h1>
            <p className="mt-1 text-[var(--colorDarkGray)]">
              Standaarden per categorie (bijv. Aluminium voordeuren): montagetypes,
              kleuren, beslag en extra info voor de image-agent. Lege
              productvelden nemen deze over. Met “toepassen” schrijf je ze ook
              door naar alle producten in die collectie.
            </p>
            <ul className="mt-8 flex flex-col gap-3">
              {collectieDefaults.map((c) => {
                const collectieProducten = producten
                  .filter((p) => p.collectie === c.collectie)
                  .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
                return (
                  <li
                    key={c.collectie}
                    className="rounded-xl border border-[var(--colorBorder)] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{c.collectie}</p>
                        <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                          {collectieProducten.length} producten ·{' '}
                          {c.montagetypes.length
                            ? c.montagetypes
                                .map((id) => MONTAGETYPE_LABELS[id as Montagetype] ?? id)
                                .join(', ')
                            : 'geen montage-default'}{' '}
                          ·{' '}
                          {c.kleurIds.length
                            ? `${c.kleurIds.length} kleuren`
                            : 'geen kleur-default'}{' '}
                          ·{' '}
                          {beslagLijst.find((b) => b.id === c.beslagId)?.label ??
                            'geen beslag-default'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-[var(--colorPrimary)] px-3 py-1.5 text-sm font-medium text-[var(--colorPrimary)]"
                        onClick={() => {
                          setApplyCollectieToProducts(false)
                          setEditingCollectie({
                            ...c,
                            montagetypes: c.montagetypes ?? [],
                            kleurIds: c.kleurIds ?? [],
                          })
                        }}
                      >
                        Bewerken
                      </button>
                    </div>
                    {collectieProducten.length > 0 && (
                      <ul className="mt-4 divide-y divide-[var(--colorBorder)] rounded-lg border border-[var(--colorBorder)]">
                        {collectieProducten.map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center gap-3 px-3 py-2"
                          >
                            <div className="h-12 w-9 flex-shrink-0 overflow-hidden rounded bg-[#eee]">
                              {p.afbeeldingUrl ? (
                                <img
                                  src={p.afbeeldingUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {p.naam}
                              </p>
                              {!p.actief && (
                                <p className="text-xs text-[var(--colorDarkGray)]">
                                  inactief
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.agentExtra && (
                      <p className="mt-3 rounded-lg bg-[#f7f7f7] p-3 text-sm text-[var(--colorDarkGray)]">
                        Agent: {c.agentExtra}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {!loading && tab === 'montagetypes' && (
          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="section-title text-2xl sm:text-3xl">
                  <span className="gold">Montagetypes</span>
                </h1>
                <p className="mt-1 text-[var(--colorDarkGray)]">
                  Wat de klant kiest én wat de AI meekrijgt. Voordeuren: geen
                  klink. Tuindeuren: klink mag.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  setEditingMontage({
                    id: '',
                    label: '',
                    hint: '',
                    agentPrompt: '',
                    sortOrder: 100,
                    actief: true,
                    neverLeverHandle: false,
                    deurGroep: 'binnen',
                  })
                }
              >
                Nieuw montagetype
              </button>
            </div>
            <ul className="mt-6 space-y-4">
              {montages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-[var(--borderRadiusLarge)] border border-[var(--colorBorder)] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {m.label}{' '}
                        {!m.actief && (
                          <span className="text-sm font-normal text-[var(--colorDarkGray)]">
                            (uit)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--colorDarkGray)]">
                        {m.id}
                        {m.deurGroep === 'buiten' ? 'buiten' : 'binnen'}
                        {m.neverLeverHandle ? ' · geen klink' : ' · klink mag'}
                      </p>
                      <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                        {m.hint}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--colorPrimary)] px-3 py-1.5 text-sm font-medium text-[var(--colorPrimary)]"
                      onClick={() =>
                        setEditingMontage({
                          ...m,
                          neverLeverHandle: Boolean(m.neverLeverHandle),
                          deurGroep:
                            m.deurGroep === 'buiten' ? 'buiten' : 'binnen',
                        })
                      }
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

        {!loading && tab === 'beslag' && (
          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="section-title text-2xl sm:text-3xl">
                  <span className="gold">Beslag</span>
                </h1>
                <p className="mt-1 text-[var(--colorDarkGray)]">
                  Vooraf bepalen welk beslag bij een deur hoort. Collectie-defaults
                  gelden als een product geen eigen beslag heeft.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsNewBeslag(true)
                  setEditingBeslag({
                    id: '',
                    label: '',
                    hint: '',
                    agentPrompt: '',
                    actief: true,
                    sortOrder: 100,
                  })
                }}
              >
                Nieuw beslag
              </button>
            </div>

            <p className="mt-8 text-sm text-[var(--colorDarkGray)]">
              Standaard beslag, kleuren, montagetypes en agent-info per categorie
              stel je in onder <strong>Collecties</strong>.
            </p>

            <ul className="mt-8 flex flex-col gap-4">
              {beslagLijst.map((b) => (
                <li
                  key={b.id}
                  className="rounded-xl border border-[var(--colorBorder)] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{b.label}</p>
                      <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                        {b.hint}
                      </p>
                      <p className="mt-1 text-xs text-[var(--colorDarkGray)]">
                        {b.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--colorPrimary)] px-3 py-1.5 text-sm font-medium text-[var(--colorPrimary)]"
                      onClick={() => {
                        setIsNewBeslag(false)
                        setEditingBeslag({ ...b })
                      }}
                    >
                      Bewerken
                    </button>
                  </div>
                  <div className="mt-3 rounded-lg bg-[#f7f7f7] p-3 text-sm">
                    <p className="mb-1 font-semibold">Agent-prompt</p>
                    <p className="whitespace-pre-wrap text-[var(--colorDarkGray)]">
                      {b.agentPrompt || '—'}
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

        {!loading && tab === 'mail' && mailMeta && (
          <div className="mt-6">
            <h1 className="section-title text-2xl sm:text-3xl">
              <span className="gold">E-mail</span>
            </h1>
            <p className="mt-1 text-[var(--colorDarkGray)]">
              Opmaak van klant- en lead-mails. Klantgegevens (naam, woonplaats,
              e-mail) gaan alleen mee in de mail en worden niet opgeslagen.
            </p>

            <div className="mt-6 rounded-xl border border-[var(--colorBorder)] bg-[#fbf8f0] p-4 text-sm text-[var(--colorDarkGray)]">
              <p className="font-semibold text-[var(--colorBlack)]">
                Wat gaat mee
              </p>
              <p className="mt-2">{mailMeta.privacy}</p>
              <p className="mt-3 font-medium text-[var(--colorBlack)]">Velden</p>
              <ul className="mt-1 list-disc pl-5">
                {mailMeta.velden.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
              <p className="mt-3 font-medium text-[var(--colorBlack)]">
                Bijlagen
              </p>
              <ul className="mt-1 list-disc pl-5">
                <li>
                  Klantmail:{' '}
                  {mailMeta.bijlagen.klant.join(', ')}
                </li>
                <li>
                  Lead-mail:{' '}
                  {mailMeta.bijlagen.leads.join(', ')}
                </li>
              </ul>
              <p className="mt-3 font-medium text-[var(--colorBlack)]">
                Placeholders
              </p>
              <ul className="mt-1 list-disc pl-5">
                {mailMeta.placeholders.map((p) => (
                  <li key={p.key}>
                    <code>{p.key}</code> — {p.beschrijving}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                Optioneel blok:{' '}
                <code>{'{{#prijsindicatie}}…{{/prijsindicatie}}'}</code> (alleen
                zichtbaar als prijsindicatie = ja).
              </p>
            </div>

            <ul className="mt-8 flex flex-col gap-4">
              {mailMeta.templates.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-[var(--colorBorder)] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{t.label}</p>
                      <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                        Onderwerp: {t.subject}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--colorPrimary)] px-3 py-1.5 text-sm font-medium text-[var(--colorPrimary)]"
                      onClick={() => setEditingMail({ ...t })}
                    >
                      Bewerken
                    </button>
                  </div>
                  <div className="mt-3 rounded-lg bg-[#f7f7f7] p-3 text-sm">
                    <p className="mb-1 font-semibold">HTML</p>
                    <pre className="whitespace-pre-wrap font-sans text-[var(--colorDarkGray)]">
                      {t.html}
                    </pre>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && tab === 'filters' && (
          <AdminFiltersTab
            filters={catalogusFilters}
            producten={producten}
            onChange={setCatalogusFilters}
            onError={setError}
          />
        )}

        {!loading && tab === 'teksten' && (
          <AdminTekstenTab
            key={JSON.stringify(situatieTekst)}
            initial={situatieTekst}
            onSaved={setSituatieTekst}
            onError={setError}
          />
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
                {(montages.length
                  ? montages
                  : (Object.keys(MONTAGETYPE_LABELS) as Montagetype[]).map(
                      (id) => ({
                        id,
                        label: MONTAGETYPE_LABELS[id]!,
                        hint: '',
                        agentPrompt: '',
                        sortOrder: 0,
                        actief: true,
                        neverLeverHandle: false,
                        deurGroep: 'binnen' as const,
                      }),
                    )
                ).map((m) => {
                  const checked = editing.montagetypes.includes(m.id)
                  return (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? editing.montagetypes.filter((x) => x !== m.id)
                            : [...editing.montagetypes, m.id]
                          setEditing({ ...editing, montagetypes: next })
                        }}
                      />
                      {m.label}
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
            <Field label="Beslag (optioneel, overschrijft collectie-default)">
              <select
                value={editing.beslagId ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    beslagId: e.target.value || null,
                  })
                }
              >
                <option value="">Collectie-default / geen</option>
                {beslagLijst.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Extra info voor de image-agent (dit product)">
              <textarea
                rows={3}
                value={editing.agentExtra ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, agentExtra: e.target.value })
                }
                placeholder="Bijv. altijd mat zwarte trekstang, geen deurkruk…"
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

      {editingCollectie && (
        <Modal
          title={`Collectie: ${editingCollectie.collectie}`}
          onClose={() => setEditingCollectie(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void saveAdminCollectie({
                ...editingCollectie,
                applyToProducts: applyCollectieToProducts,
              })
                .then(({ collectie }) => {
                  setCollectieDefaults((prev) =>
                    prev.map((x) =>
                      x.collectie === collectie.collectie ? collectie : x,
                    ),
                  )
                  setEditingCollectie(null)
                  if (applyCollectieToProducts) {
                    void loadAll()
                  }
                })
                .catch((err: unknown) =>
                  setError(
                    err instanceof Error ? err.message : 'Opslaan mislukt',
                  ),
                )
            }}
          >
            <fieldset className="mt-2">
              <legend className="text-sm font-medium">Montagetypes</legend>
              <div className="mt-2 flex flex-col gap-2">
                {(montages.length
                  ? montages
                  : (Object.keys(MONTAGETYPE_LABELS) as Montagetype[]).map(
                      (id) => ({
                        id,
                        label: MONTAGETYPE_LABELS[id]!,
                        hint: '',
                        agentPrompt: '',
                        sortOrder: 0,
                        actief: true,
                        neverLeverHandle: false,
                        deurGroep: 'binnen' as const,
                      }),
                    )
                ).map((m) => {
                  const checked = editingCollectie.montagetypes.includes(m.id)
                  return (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? editingCollectie.montagetypes.filter(
                                (x) => x !== m.id,
                              )
                            : [...editingCollectie.montagetypes, m.id]
                          setEditingCollectie({
                            ...editingCollectie,
                            montagetypes: next,
                          })
                        }}
                      />
                      {m.label}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Kleuren</legend>
              <div className="mt-2 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {kleuren.map((k) => {
                  const checked = editingCollectie.kleurIds.includes(k.id)
                  return (
                    <label key={k.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? editingCollectie.kleurIds.filter((x) => x !== k.id)
                            : [...editingCollectie.kleurIds, k.id]
                          setEditingCollectie({
                            ...editingCollectie,
                            kleurIds: next,
                          })
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
                      {k.naam}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <Field label="Beslag">
              <select
                value={editingCollectie.beslagId ?? ''}
                onChange={(e) =>
                  setEditingCollectie({
                    ...editingCollectie,
                    beslagId: e.target.value || null,
                  })
                }
              >
                <option value="">Geen default</option>
                {beslagLijst.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Extra info voor de image-agent">
              <textarea
                rows={3}
                value={editingCollectie.agentExtra}
                onChange={(e) =>
                  setEditingCollectie({
                    ...editingCollectie,
                    agentExtra: e.target.value,
                  })
                }
                placeholder="Bijv. aluminium voordeur: strakke greep, geen trekstang…"
              />
            </Field>

            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={applyCollectieToProducts}
                onChange={(e) =>
                  setApplyCollectieToProducts(e.target.checked)
                }
              />
              <span>
                Ook doorzetten naar alle producten in deze collectie (overschrijft
                montage/kleuren/beslag/agent-extra op die producten).
              </span>
            </label>

            <div className="mt-6 flex gap-3">
              <button type="submit" className="btn btn-primary">
                Opslaan
              </button>
              <button
                type="button"
                className="rounded-full border px-4 py-2"
                onClick={() => setEditingCollectie(null)}
              >
                Annuleren
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingBeslag && (
        <Modal
          title={isNewBeslag ? 'Nieuw beslag' : 'Beslag bewerken'}
          onClose={() => setEditingBeslag(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const save = isNewBeslag
                ? createAdminBeslag({
                    id: editingBeslag.id || undefined,
                    label: editingBeslag.label,
                    hint: editingBeslag.hint,
                    agentPrompt: editingBeslag.agentPrompt,
                    sortOrder: editingBeslag.sortOrder,
                  })
                : patchAdminBeslag({
                    id: editingBeslag.id,
                    label: editingBeslag.label,
                    hint: editingBeslag.hint,
                    agentPrompt: editingBeslag.agentPrompt,
                    actief: editingBeslag.actief,
                    sortOrder: editingBeslag.sortOrder,
                  })
              void save
                .then((b) => {
                  setBeslagLijst((prev) => {
                    const rest = prev.filter((x) => x.id !== b.id)
                    return [...rest, b].sort(
                      (a, c) => a.sortOrder - c.sortOrder || a.label.localeCompare(c.label, 'nl'),
                    )
                  })
                  setEditingBeslag(null)
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Opslaan mislukt'),
                )
            }}
          >
            {isNewBeslag && (
              <Field label="ID (optioneel, anders uit label)">
                <input
                  className="field-input"
                  value={editingBeslag.id}
                  onChange={(e) =>
                    setEditingBeslag({ ...editingBeslag, id: e.target.value })
                  }
                  placeholder="bijv. trekstang-verticaal"
                />
              </Field>
            )}
            <Field label="Label">
              <input
                className="field-input"
                required
                value={editingBeslag.label}
                onChange={(e) =>
                  setEditingBeslag({ ...editingBeslag, label: e.target.value })
                }
              />
            </Field>
            <Field label="Hint (intern)">
              <input
                className="field-input"
                value={editingBeslag.hint}
                onChange={(e) =>
                  setEditingBeslag({ ...editingBeslag, hint: e.target.value })
                }
              />
            </Field>
            <Field label="Agent-prompt (Engels, voor beeldgeneratie)">
              <textarea
                className="field-input min-h-32"
                value={editingBeslag.agentPrompt}
                onChange={(e) =>
                  setEditingBeslag({
                    ...editingBeslag,
                    agentPrompt: e.target.value,
                  })
                }
              />
            </Field>
            {!isNewBeslag && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingBeslag.actief}
                  onChange={(e) =>
                    setEditingBeslag({
                      ...editingBeslag,
                      actief: e.target.checked,
                    })
                  }
                />
                Actief
              </label>
            )}
            <div className="mt-6 flex gap-3">
              <button type="submit" className="btn btn-primary">
                Opslaan
              </button>
              <button
                type="button"
                className="rounded-full border px-4 py-2"
                onClick={() => setEditingBeslag(null)}
              >
                Annuleren
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingMail && (
        <Modal
          title={`${editingMail.label} bewerken`}
          onClose={() => setEditingMail(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void patchAdminMailTemplate({
                id: editingMail.id,
                label: editingMail.label,
                subject: editingMail.subject,
                html: editingMail.html,
              })
                .then((t) => {
                  setMailMeta((prev) =>
                    prev
                      ? {
                          ...prev,
                          templates: prev.templates.map((x) =>
                            x.id === t.id ? t : x,
                          ),
                        }
                      : prev,
                  )
                  setEditingMail(null)
                })
                .catch((err: unknown) =>
                  setError(
                    err instanceof Error ? err.message : 'Opslaan mislukt',
                  ),
                )
            }}
          >
            <Field label="Label">
              <input
                className="field-input"
                value={editingMail.label}
                onChange={(e) =>
                  setEditingMail({ ...editingMail, label: e.target.value })
                }
              />
            </Field>
            <Field label="Onderwerp">
              <input
                className="field-input"
                value={editingMail.subject}
                onChange={(e) =>
                  setEditingMail({ ...editingMail, subject: e.target.value })
                }
              />
            </Field>
            <Field label="HTML-inhoud">
              <textarea
                className="field-input min-h-48 font-mono text-sm"
                value={editingMail.html}
                onChange={(e) =>
                  setEditingMail({ ...editingMail, html: e.target.value })
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
                onClick={() => setEditingMail(null)}
              >
                Annuleren
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingMontage && (
        <Modal
          title={
            editingMontage.id && montages.some((m) => m.id === editingMontage.id)
              ? 'Montagetype bewerken'
              : 'Nieuw montagetype'
          }
          onClose={() => setEditingMontage(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!editingMontage.label.trim()) {
                setError('Label is verplicht')
                return
              }
              const isNew = !montages.some((m) => m.id === editingMontage.id)
              void saveAdminMontagetype(
                {
                  id: editingMontage.id || undefined,
                  label: editingMontage.label.trim(),
                  hint: editingMontage.hint,
                  agentPrompt: editingMontage.agentPrompt,
                  actief: editingMontage.actief,
                  sortOrder: editingMontage.sortOrder,
                  neverLeverHandle: editingMontage.neverLeverHandle,
                  deurGroep: editingMontage.deurGroep,
                },
                isNew || !editingMontage.id,
              )
                .then((m) => {
                  setMontages((prev) =>
                    [...prev.filter((x) => x.id !== m.id), m].sort(
                      (a, b) =>
                        a.sortOrder - b.sortOrder ||
                        a.label.localeCompare(b.label, 'nl'),
                    ),
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
                required
                value={editingMontage.label}
                onChange={(e) =>
                  setEditingMontage({ ...editingMontage, label: e.target.value })
                }
                placeholder="Bijv. Nieuwe tuindeur in bestaand kozijn"
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
            <Field label="Volgorde">
              <input
                type="number"
                className="field-input"
                value={editingMontage.sortOrder}
                onChange={(e) =>
                  setEditingMontage({
                    ...editingMontage,
                    sortOrder: Number(e.target.value) || 0,
                  })
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
            <Field label="Categorie">
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-normal">
                  <input
                    type="radio"
                    name="deur-groep"
                    checked={editingMontage.deurGroep !== 'buiten'}
                    onChange={() =>
                      setEditingMontage({
                        ...editingMontage,
                        deurGroep: 'binnen',
                      })
                    }
                  />
                  Binnendeur
                </label>
                <label className="flex items-center gap-2 text-sm font-normal">
                  <input
                    type="radio"
                    name="deur-groep"
                    checked={editingMontage.deurGroep === 'buiten'}
                    onChange={() =>
                      setEditingMontage({
                        ...editingMontage,
                        deurGroep: 'buiten',
                      })
                    }
                  />
                  Buitendeur (voordeur / tuindeur)
                </label>
              </div>
            </Field>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editingMontage.neverLeverHandle}
                onChange={(e) =>
                  setEditingMontage({
                    ...editingMontage,
                    neverLeverHandle: e.target.checked,
                  })
                }
              />
              Nooit een klink (voordeuren / entree) — knop of stang i.p.v. deurkruk
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editingMontage.actief}
                onChange={(e) =>
                  setEditingMontage({
                    ...editingMontage,
                    actief: e.target.checked,
                  })
                }
              />
              Actief (zichtbaar voor klanten)
            </label>
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
