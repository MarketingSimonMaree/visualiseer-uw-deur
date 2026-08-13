import { useRef, useState } from 'react'
import { ImageLoadError, loadKamerFoto } from '../lib/imageLoader'
import type { KamerFoto } from '../types/product'

/** Voorbeeldfoto van simonmaree.nl — hoe de klant moet fotograferen. */
const VOORBEELD_FOTO_URL =
  'https://www.simonmaree.nl/app/uploads/Simon-Maree-Deurenspecialist-Opdekdeur-Bestaand-Kozijn-DSC07216-22.jpg'

interface Props {
  foto: KamerFoto | null
  onLoaded: (foto: KamerFoto) => void
  onContinue: () => void
}

export function FotoUpload({ foto, onLoaded, onContinue }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const result = await loadKamerFoto(file, setProgress)
      if (foto?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(foto.previewUrl)
      onLoaded(result)
    } catch (err) {
      setError(
        err instanceof ImageLoadError
          ? err.message
          : 'Deze foto konden we niet verwerken. Probeer een andere foto met meer daglicht.',
      )
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <section className="page">
      <div className="situatie-grid">
        <div>
          <div className="page-intro">
            <h1 className="section-title">
              <span className="gold">Huidige</span> situatie
            </h1>
            <p className="lead">
              Upload een foto van de deuropening zoals die nu is. Zo ziet u
              straks precies hoe de nieuwe deur past.
            </p>
          </div>

          <ul className="tip-list">
            <li>Houd de deur recht en in het midden</li>
            <li>Breng de volledige deur en het kozijn in beeld</li>
            <li>Zorg voor voldoende ruimte rondom</li>
          </ul>

          <p className="mt-5 text-sm font-semibold text-[var(--colorDarkGray)]">
            Let daarnaast op:
          </p>
          <ul className="tip-list tip-list-secondary">
            <li>Zorg dat de deur gesloten is</li>
            <li>Maak de foto bij voldoende licht en zonder obstakels</li>
          </ul>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          <div className="cta-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? progress ?? 'Bezig…' : foto ? 'Andere foto kiezen' : 'Upload uw foto'}
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>

            {foto && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={onContinue}
              >
                Volgende stap
                <span className="btn-arrow" aria-hidden>
                  →
                </span>
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 text-sm text-[var(--colorError)]" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="upload-panel">
          <div className="upload-panel-media">
            <img
              src={foto?.previewUrl ?? VOORBEELD_FOTO_URL}
              alt={
                foto
                  ? 'Uw geüploade deuropening'
                  : 'Voorbeeld: deur recht in het midden, volledig kozijn in beeld'
              }
            />
          </div>
          <div className="upload-panel-footer">
            {foto
              ? 'Uw foto — klaar voor de volgende stap'
              : 'Voorbeeld van hoe uw foto eruit moet zien'}
          </div>
        </div>
      </div>
    </section>
  )
}
