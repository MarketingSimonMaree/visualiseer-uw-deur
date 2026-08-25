import { useRef, useState } from 'react'
import { ImageLoadError, loadKamerFoto } from '../lib/imageLoader'
import type { SituatieTekst } from '../lib/adminApi'
import type { KamerFoto } from '../types/product'

/** Voorbeeldfoto van simonmaree.nl — hoe de klant moet fotograferen. */
const VOORBEELD_FOTO_URL =
  'https://www.simonmaree.nl/app/uploads/Simon-Maree-Deurenspecialist-Opdekdeur-Bestaand-Kozijn-DSC07216-22.jpg'

interface Props {
  foto: KamerFoto | null
  teksten: SituatieTekst
  onLoaded: (foto: KamerFoto) => void
  onContinue: () => void
}

export function FotoUpload({ foto, teksten, onLoaded, onContinue }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
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
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  return (
    <section className="page">
      <div className="situatie-grid">
        <div>
          <div className="page-intro">
            <h1 className="section-title">
              <span className="gold">{teksten.titelGold}</span> {teksten.titel}
            </h1>
            <p className="lead">{teksten.lead}</p>
          </div>

          {teksten.tips.length > 0 && (
            <ul className="tip-list">
              {teksten.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}

          {teksten.tipsExtra.length > 0 && (
            <>
              <p className="mt-5 text-sm font-semibold text-[var(--colorDarkGray)]">
                {teksten.tipsExtraTitel}
              </p>
              <ul className="tip-list tip-list-secondary">
                {teksten.tipsExtra.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </>
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          <div className="cta-row upload-actions-mobile">
            <button
              type="button"
              className={`btn ${foto ? 'btn-secondary' : 'btn-primary'}`}
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              {busy ? progress ?? 'Bezig…' : 'Foto maken'}
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              Kies uit galerij
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
            {foto && (
              <button
                type="button"
                className="btn btn-primary"
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

          <div className="cta-row upload-actions-desktop">
            <button
              type="button"
              className={`btn ${foto ? 'btn-secondary' : 'btn-primary'}`}
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              {busy
                ? progress ?? 'Bezig…'
                : foto
                  ? 'Andere foto uploaden'
                  : 'Upload uw foto'}
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </button>
            {foto && (
              <button
                type="button"
                className="btn btn-primary"
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
