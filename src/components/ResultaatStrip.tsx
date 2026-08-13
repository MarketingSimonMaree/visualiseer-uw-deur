import type { GeneratieResultaat } from '../types/product'

interface Props {
  items: GeneratieResultaat[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function ResultaatStrip({ items, activeId, onSelect }: Props) {
  if (items.length === 0) return null

  return (
    <section
      className="border-t border-[var(--colorGray)] bg-white px-4 py-4 sm:px-8"
      aria-label="Eerdere visualisaties"
    >
      <p className="mb-3 text-sm font-semibold text-[var(--colorDarkGray)]">
        Uw resultaten — tik om te vergelijken
      </p>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`w-24 overflow-hidden rounded-[var(--borderRadius)] border-2 text-left transition-colors ${
                  active
                    ? 'border-[var(--colorPrimary)]'
                    : 'border-[var(--colorGray)]'
                }`}
              >
                <img
                  src={item.imageUrl}
                  alt={`${item.productNaam} in ${item.kleur}`}
                  className="aspect-[3/4] w-full object-cover"
                />
                <span className="block truncate px-1.5 py-1 text-[10px] font-medium">
                  {item.kleur}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
