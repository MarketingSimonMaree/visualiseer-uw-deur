import { useEffect, useState } from 'react'
import type { Product } from '../types/product'

interface Props {
  product: Product
  kleur: string
  roomPreviewUrl: string
  forMail?: boolean
}

const TIPS = [
  'Deur altijd dicht, met deurkruk…',
  'Glas blijft doorzichtig…',
  'Muren, vloer en licht blijven hetzelfde…',
  'Bijna klaar — even geduld…',
]

export function GeneratieVoortgang({
  product,
  kleur,
  roomPreviewUrl,
  forMail,
}: Props) {
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length)
    }, 4000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section className="page">
      <div className="page-intro">
        <h1 className="section-title">
          <span className="gold">Bezig</span> met uw visualisatie
        </h1>
        <p className="lead">
          {forMail
            ? 'Dit duurt meestal 15–30 seconden. Daarna sturen wij het resultaat naar uw e-mail.'
            : 'Dit duurt meestal 15–30 seconden. Uw foto en gekozen deur blijven zichtbaar.'}
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-[var(--borderRadius)] border border-[var(--colorGray)] bg-[var(--canvasBg)]">
          <img
            src={roomPreviewUrl}
            alt="Uw kamerfoto"
            className="aspect-[3/4] w-full object-cover"
          />
          <p className="border-t border-[var(--colorGray)] px-3 py-2 text-sm">Uw foto</p>
        </div>
        <div className="flex flex-col overflow-hidden rounded-[var(--borderRadius)] border border-[var(--colorGray)] bg-[#f8f8f8]">
          <div className="flex flex-1 items-center justify-center p-6">
            <img
              src={product.afbeeldingUrl}
              alt={product.naam}
              className="max-h-64 object-contain"
            />
          </div>
          <div className="border-t border-[var(--colorGray)] px-3 py-2">
            <p className="font-semibold">{product.naam}</p>
            <p className="text-sm text-[var(--colorDarkGray)]">{kleur}</p>
          </div>
        </div>
      </div>

      <div className="mt-8" role="status" aria-live="polite">
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--colorGray)]">
          <div className="progress-bar h-full w-1/3 rounded-full bg-[var(--colorPrimary)]" />
        </div>
        <p className="mt-3 text-sm text-[var(--colorDarkGray)]">{TIPS[tipIndex]}</p>
      </div>
    </section>
  )
}
