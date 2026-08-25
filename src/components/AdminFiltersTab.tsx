import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  deleteAdminFilter,
  saveAdminFilter,
  type AdminProduct,
  type CatalogusFilter,
} from '../lib/adminApi'
import {
  MONTAGETYPE_LABELS,
  type Montagetype,
  type MontagetypeDef,
} from '../types/product'

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-[var(--borderRadiusLarge)] bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="section-title text-2xl">{title}</h2>
          <button type="button" className="back-link !mb-0" onClick={onClose}>
            Sluiten
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function productTypes(p: AdminProduct): string[] {
  if (p.montagetypes?.length) return p.montagetypes.map(String)
  return p.montagetype ? [String(p.montagetype)] : []
}

function montageLabel(
  id: string,
  montages: MontagetypeDef[],
): string {
  const fromDb = montages.find((m) => m.id === id)
  if (fromDb?.label) return fromDb.label
  return MONTAGETYPE_LABELS[id as Montagetype] ?? id
}

interface Props {
  filters: CatalogusFilter[]
  producten: AdminProduct[]
  montages: MontagetypeDef[]
  onChange: (next: CatalogusFilter[]) => void
  onError: (msg: string) => void
}

export function AdminFiltersTab({
  filters,
  producten,
  montages,
  onChange,
  onError,
}: Props) {
  const [editing, setEditing] = useState<CatalogusFilter | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [productQuery, setProductQuery] = useState('')

  const montageOpties = useMemo(() => {
    const active = montages.filter((m) => m.actief !== false)
    if (active.length) return active
    return (Object.keys(MONTAGETYPE_LABELS) as Montagetype[]).map((id) => ({
      id,
      label: MONTAGETYPE_LABELS[id],
      hint: '',
      agentPrompt: '',
      sortOrder: 0,
      actief: true,
    }))
  }, [montages])

  const zichtbareProducten = useMemo(() => {
    if (!editing?.montagetype) return []
    const q = productQuery.trim().toLowerCase()
    return producten
      .filter((p) => p.actief !== false)
      .filter((p) => productTypes(p).includes(editing.montagetype))
      .filter((p) => {
        if (!q) return true
        return (
          p.naam.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.collectie.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  }, [producten, productQuery, editing?.montagetype])

  function openNew() {
    setIsNew(true)
    setProductQuery('')
    setEditing({
      id: '',
      label: '',
      montagetype: String(montageOpties[0]?.id ?? 'deur-bestaand-kozijn'),
      sortOrder: 100,
      actief: true,
      productIds: [],
    })
  }

  function setMontagetype(next: string) {
    if (!editing) return
    const allowed = new Set(
      producten
        .filter((p) => productTypes(p).includes(next))
        .map((p) => p.id),
    )
    setEditing({
      ...editing,
      montagetype: next,
      productIds: editing.productIds.filter((id) => allowed.has(id)),
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!editing?.label.trim()) {
      onError('Label is verplicht')
      return
    }
    if (!editing.montagetype) {
      onError('Montagetype is verplicht')
      return
    }
    void saveAdminFilter(
      {
        id: editing.id || undefined,
        label: editing.label.trim(),
        montagetype: editing.montagetype,
        sortOrder: editing.sortOrder,
        actief: editing.actief,
        productIds: editing.productIds,
      },
      isNew,
    )
      .then((f) => {
        onChange(
          [...filters.filter((x) => x.id !== f.id), f].sort(
            (a, b) =>
              a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'nl'),
          ),
        )
        setEditing(null)
      })
      .catch((err: unknown) =>
        onError(err instanceof Error ? err.message : 'Opslaan mislukt'),
      )
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title text-2xl sm:text-3xl">
            <span className="gold">Filters</span>
          </h1>
          <p className="mt-1 text-[var(--colorDarkGray)]">
            Per montagetype: kies welke deuren bij een filter horen.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNew}>
          Nieuwe filter
        </button>
      </div>

      <ul className="mt-8 flex flex-col gap-3">
        {filters.map((f) => (
          <li
            key={f.id}
            className="rounded-xl border border-[var(--colorBorder)] bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {f.label}{' '}
                  {!f.actief && (
                    <span className="text-sm font-normal text-[var(--colorDarkGray)]">
                      (uit)
                    </span>
                  )}
                </p>
                <p className="mt-1 text-sm text-[var(--colorDarkGray)]">
                  {montageLabel(f.montagetype, montages)} ·{' '}
                  {f.productIds.length} producten · volgorde {f.sortOrder}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full border border-[var(--colorPrimary)] px-3 py-1.5 text-sm font-medium text-[var(--colorPrimary)]"
                  onClick={() => {
                    setIsNew(false)
                    setProductQuery('')
                    setEditing({ ...f })
                  }}
                >
                  Bewerken
                </button>
                <button
                  type="button"
                  className="rounded-full border px-3 py-1.5 text-sm"
                  onClick={() => {
                    if (!confirm(`Filter “${f.label}” verwijderen?`)) return
                    void deleteAdminFilter(f.id)
                      .then(() =>
                        onChange(filters.filter((x) => x.id !== f.id)),
                      )
                      .catch((err: unknown) =>
                        onError(
                          err instanceof Error
                            ? err.message
                            : 'Verwijderen mislukt',
                        ),
                      )
                  }}
                >
                  Verwijderen
                </button>
              </div>
            </div>
          </li>
        ))}
        {filters.length === 0 && (
          <li className="text-[var(--colorDarkGray)]">
            Nog geen filters. Maak er een aan en vink producten aan.
          </li>
        )}
      </ul>

      {editing && (
        <Modal
          title={isNew ? 'Nieuwe filter' : 'Filter bewerken'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit}>
            <Field label="Label">
              <input
                className="field-input w-full"
                required
                value={editing.label}
                onChange={(e) =>
                  setEditing({ ...editing, label: e.target.value })
                }
                placeholder="Bijv. Steel look"
              />
            </Field>

            <Field label="Montagetype">
              <select
                className="field-input w-full"
                required
                value={editing.montagetype}
                onChange={(e) => setMontagetype(e.target.value)}
              >
                {montageOpties.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Volgorde">
              <input
                type="number"
                className="field-input w-full"
                value={editing.sortOrder}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    sortOrder: Number(e.target.value) || 0,
                  })
                }
              />
            </Field>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.actief}
                onChange={(e) =>
                  setEditing({ ...editing, actief: e.target.checked })
                }
              />
              Actief in de catalogus
            </label>

            <Field label="Producten in deze filter">
              <input
                type="search"
                className="field-input mb-2 w-full"
                placeholder="Zoek producten…"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                disabled={!editing.montagetype}
              />
              {!editing.montagetype ? (
                <p className="text-sm text-[var(--colorDarkGray)]">
                  Kies eerst een montagetype.
                </p>
              ) : zichtbareProducten.length === 0 ? (
                <p className="text-sm text-[var(--colorDarkGray)]">
                  Geen actieve producten voor dit montagetype.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--colorBorder)] p-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {zichtbareProducten.map((p) => {
                      const checked = editing.productIds.includes(p.id)
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                            checked
                              ? 'border-[var(--colorPrimary)] bg-[#fdf6f7]'
                              : 'border-[var(--colorBorder)] bg-white hover:bg-[#f7f7f7]'
                          }`}
                        >
                          <div className="relative aspect-[3/4] bg-[#eee]">
                            {p.afbeeldingUrl ? (
                              <img
                                src={p.afbeeldingUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : null}
                            <input
                              type="checkbox"
                              className="absolute left-2 top-2 h-4 w-4"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? editing.productIds.filter((x) => x !== p.id)
                                  : [...editing.productIds, p.id]
                                setEditing({ ...editing, productIds: next })
                              }}
                            />
                          </div>
                          <span className="line-clamp-2 px-2 py-1.5 text-xs font-medium leading-snug">
                            {p.naam}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
              <p className="mt-2 text-xs text-[var(--colorDarkGray)]">
                {editing.productIds.length} geselecteerd
              </p>
            </Field>

            <div className="mt-6 flex gap-3">
              <button type="submit" className="btn btn-primary">
                Opslaan
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
    </div>
  )
}
