import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  deleteAdminFilter,
  saveAdminFilter,
  type AdminProduct,
  type CatalogusFilter,
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
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-[var(--borderRadiusLarge)] bg-white p-6 shadow-xl"
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

interface Props {
  filters: CatalogusFilter[]
  producten: AdminProduct[]
  onChange: (next: CatalogusFilter[]) => void
  onError: (msg: string) => void
}

export function AdminFiltersTab({
  filters,
  producten,
  onChange,
  onError,
}: Props) {
  const [editing, setEditing] = useState<CatalogusFilter | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [productQuery, setProductQuery] = useState('')

  const zichtbareProducten = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    return producten
      .filter((p) => p.actief !== false)
      .filter((p) => {
        if (!q) return true
        return (
          p.naam.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.collectie.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  }, [producten, productQuery])

  function openNew() {
    setIsNew(true)
    setProductQuery('')
    setEditing({
      id: '',
      label: '',
      sortOrder: 100,
      actief: true,
      productIds: [],
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!editing?.label.trim()) {
      onError('Label is verplicht')
      return
    }
    void saveAdminFilter(
      {
        id: editing.id || undefined,
        label: editing.label.trim(),
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
            Catalogusfilters voor klanten. Vink per filter aan welke producten
            erbij horen.
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
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--colorBorder)] p-2">
                {zichtbareProducten.map((p) => {
                  const checked = editing.productIds.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[#f7f7f7]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? editing.productIds.filter((x) => x !== p.id)
                            : [...editing.productIds, p.id]
                          setEditing({ ...editing, productIds: next })
                        }}
                      />
                      <span className="flex-1">{p.naam}</span>
                      <span className="text-xs text-[var(--colorDarkGray)]">
                        {p.collectie}
                      </span>
                    </label>
                  )
                })}
              </div>
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
