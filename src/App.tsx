import { useCallback, useEffect, useState } from 'react'
import { EmailGate } from './components/EmailGate'
import { FotoUpload } from './components/FotoUpload'
import { GeneratieVoortgang } from './components/GeneratieVoortgang'
import { KleurKiezer } from './components/KleurKiezer'
import { MontagetypeKiezer } from './components/MontagetypeKiezer'
import { ProductKiezer } from './components/ProductKiezer'
import { ResultaatView } from './components/ResultaatView'
import {
  Stappenplan,
  stepIndex,
  type FlowStepId,
} from './components/Stappenplan'
import { cacheGet, cacheSet } from './lib/cache'
import { MAX_GEN_INPUT_LONG_SIDE } from './config'
import { blobToDataUrl, resizeBlobForGeneration } from './lib/imageLoader'
import { buildCacheKey } from './lib/hash'
import { requestGeneration } from './lib/generate'
import { fetchProducten } from './lib/productenApi'
import {
  getGenerationCount,
  incrementDailyGenerationCount,
  incrementGenerationCount,
  isDailyLimitReached,
  needsEmailGate,
  remainingGenerations,
} from './lib/session'
import type {
  AppStep,
  GeneratieResultaat,
  KamerFoto,
  Montagetype,
  Product,
} from './types/product'

function maxStep(a: AppStep, b: AppStep): AppStep {
  return stepIndex(a) >= stepIndex(b) ? a : b
}

export default function App() {
  const [step, setStep] = useState<AppStep>('situatie')
  const [maxReached, setMaxReached] = useState<AppStep>('situatie')
  const [montagetype, setMontagetype] = useState<Montagetype | null>(null)
  const [foto, setFoto] = useState<KamerFoto | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [kleur, setKleur] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [wasMock, setWasMock] = useState(false)
  const [showEmailGate, setShowEmailGate] = useState(false)

  const [geschiedenis, setGeschiedenis] = useState<GeneratieResultaat[]>([])
  const [actiefId, setActiefId] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(() => remainingGenerations())
  const [producten, setProducten] = useState<Product[]>([])
  const [productenError, setProductenError] = useState<string | null>(null)

  const actief = geschiedenis.find((g) => g.id === actiefId) ?? null

  useEffect(() => {
    let cancelled = false
    void fetchProducten()
      .then((lijst) => {
        if (!cancelled) {
          setProducten(lijst)
          setProductenError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProducten([])
          setProductenError(
            err instanceof Error ? err.message : 'Producten laden mislukt',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const goTo = useCallback((next: AppStep) => {
    setStep(next)
    setMaxReached((prev) => maxStep(prev, next))
  }, [])

  const runGenerate = useCallback(
    async (opts: { isRetry: boolean }) => {
      if (!foto || !product || !kleur || !montagetype) return

      if (isDailyLimitReached()) {
        setGenError(
          'Daglimiet bereikt (20 visualisaties per dag). Probeer het morgen opnieuw of vraag een offerte aan.',
        )
        goTo('resultaat')
        return
      }

      if (!opts.isRetry && needsEmailGate()) {
        setShowEmailGate(true)
        return
      }

      setGenError(null)
      setGenerating(true)
      goTo('resultaat')

      try {
        const cacheKey = await buildCacheKey(foto.blob, product.id, kleur)

        if (!opts.isRetry) {
          const cached = await cacheGet(cacheKey)
          if (cached) {
            const item: GeneratieResultaat = {
              id: crypto.randomUUID(),
              cacheKey,
              imageUrl: cached,
              productId: product.id,
              productNaam: product.naam,
              kleur,
              createdAt: Date.now(),
              fromCache: true,
              isRetry: false,
            }
            setGeschiedenis((prev) => [item, ...prev])
            setActiefId(item.id)
            return
          }
        }

        const roomForGen = await resizeBlobForGeneration(
          foto.blob,
          MAX_GEN_INPUT_LONG_SIDE,
        )
        const roomImageBase64 = await blobToDataUrl(roomForGen)
        const data = await requestGeneration({
          roomImageBase64,
          productImageUrl: product.afbeeldingUrl,
          productNaam: product.naam,
          kleur,
          montagetype,
          cacheKey,
        })

        const mime = data.mimeType || 'image/png'
        const imageUrl = `data:${mime};base64,${data.imageBase64}`
        await cacheSet(cacheKey, imageUrl)
        setWasMock(Boolean(data.mock))

        // Echte API-calls tellen mee (niet cache, wel retries → daglimiet)
        if (!data.mock) {
          incrementDailyGenerationCount()
        }
        if (!opts.isRetry) {
          incrementGenerationCount()
        }
        setRemaining(remainingGenerations())

        const item: GeneratieResultaat = {
          id: crypto.randomUUID(),
          cacheKey,
          imageUrl,
          productId: product.id,
          productNaam: product.naam,
          kleur,
          createdAt: Date.now(),
          fromCache: false,
          isRetry: opts.isRetry,
        }
        setGeschiedenis((prev) => [item, ...prev])
        setActiefId(item.id)
      } catch (err) {
        setGenError(
          err instanceof Error
            ? err.message
            : 'Er ging iets mis bij het genereren. Probeer het opnieuw.',
        )
      } finally {
        setGenerating(false)
      }
    },
    [foto, product, kleur, montagetype, goTo],
  )

  function navigateStep(id: FlowStepId) {
    if (id === 'situatie') goTo('situatie')
    else if (id === 'plan' && foto) goTo('plan')
    else if (id === 'catalogus' && foto && montagetype) goTo('catalogus')
    else if (id === 'kleur' && foto && montagetype && product) goTo('kleur')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-brand">Simon Maree · Deurvisualisator</p>
        <Stappenplan
          current={step}
          maxReached={maxReached}
          onNavigate={navigateStep}
        />
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {step === 'situatie' && (
          <FotoUpload
            foto={foto}
            onLoaded={setFoto}
            onContinue={() => goTo('plan')}
          />
        )}

        {step === 'plan' && (
          <MontagetypeKiezer
            value={montagetype}
            onChange={setMontagetype}
            onBack={() => goTo('situatie')}
            onContinue={() => goTo('catalogus')}
          />
        )}

        {step === 'catalogus' && montagetype && (
          <>
            {productenError && (
              <section className="page">
                <p className="lead text-[var(--colorError)]" role="alert">
                  {productenError}
                </p>
              </section>
            )}
            <ProductKiezer
              producten={producten}
              montagetype={montagetype}
              selectedId={product?.id ?? null}
              onSelect={(p) => {
                setProduct(p)
                setKleur(null)
              }}
              onBack={() => goTo('plan')}
              onContinue={() => goTo('kleur')}
            />
          </>
        )}

        {step === 'kleur' && product && (
          <KleurKiezer
            product={product}
            value={kleur}
            onChange={setKleur}
            onBack={() => goTo('catalogus')}
            generating={generating}
            remaining={remaining}
            onGenerate={() => {
              if (isDailyLimitReached()) {
                setGenError(
                  'Daglimiet bereikt (20 visualisaties per dag). Probeer het morgen opnieuw of vraag een offerte aan.',
                )
                goTo('resultaat')
                return
              }
              if (needsEmailGate()) {
                setShowEmailGate(true)
                return
              }
              void runGenerate({ isRetry: false })
            }}
          />
        )}

        {step === 'resultaat' && (
          <>
            {generating && product && kleur && foto && (
              <GeneratieVoortgang
                product={product}
                kleur={kleur}
                roomPreviewUrl={foto.previewUrl}
              />
            )}

            {!generating && genError && (
              <section className="page">
                <div className="page-intro">
                  <h1 className="section-title">
                    <span className="gold">Dat</span> lukte niet
                  </h1>
                  <p className="lead text-[var(--colorError)]" role="alert">
                    {genError}
                  </p>
                </div>
                <div className="cta-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void runGenerate({ isRetry: true })}
                  >
                    Opnieuw proberen
                    <span className="btn-arrow" aria-hidden>
                      →
                    </span>
                  </button>
                  <button
                    type="button"
                    className="back-link !mb-0"
                    onClick={() => goTo('catalogus')}
                  >
                    Andere deur kiezen
                  </button>
                </div>
              </section>
            )}

            {!generating && !genError && actief && product && (
              <ResultaatView
                resultaat={actief}
                product={product}
                geschiedenis={geschiedenis}
                onSelectResultaat={setActiefId}
                onRetry={() => void runGenerate({ isRetry: true })}
                onAndereDeur={() => goTo('catalogus')}
                mock={wasMock}
              />
            )}
          </>
        )}
      </main>

      {showEmailGate && (
        <EmailGate
          onDone={() => {
            setShowEmailGate(false)
            setRemaining(remainingGenerations())
            void runGenerate({ isRetry: false })
          }}
        />
      )}

      <span className="sr-only">Generaties deze sessie: {getGenerationCount()}</span>
    </div>
  )
}
