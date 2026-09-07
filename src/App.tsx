import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmailGate } from './components/EmailGate'
import { FotoUpload } from './components/FotoUpload'
import { GeneratieVoortgang } from './components/GeneratieVoortgang'
import { KleurKiezer } from './components/KleurKiezer'
import { MailBevestiging } from './components/MailBevestiging'
import { MontagetypeKiezer } from './components/MontagetypeKiezer'
import { ProductKiezer } from './components/ProductKiezer'
import { ResultaatView } from './components/ResultaatView'
import {
  Stappenplan,
  stepIndex,
  type FlowStepId,
} from './components/Stappenplan'
import {
  WachtOfMailDialog,
  type DeliveryChoice,
} from './components/WachtOfMailDialog'
import { cacheGet, cacheSet } from './lib/cache'
import { MAX_GEN_INPUT_LONG_SIDE } from './config'
import { blobToDataUrl, resizeBlobForGeneration } from './lib/imageLoader'
import { buildCacheKey } from './lib/hash'
import { requestGeneration } from './lib/generate'
import { requestMailResultaat } from './lib/mailResultaat'
import { trackEvent, getAnalyticsSessionId } from './lib/analytics'
import { fetchProducten } from './lib/productenApi'
import {
  fetchSiteContent,
  type PublicCatalogusFilter,
} from './lib/contentApi'
import type { SituatieTekst } from './lib/adminApi'
import { BESLAG_KLEUREN } from './data/beslagKleuren'
import {
  clearDeepLinkFromUrl,
  parseDeepLink,
  productMontagetypes,
  resolveMontagetypeForProduct,
} from './lib/deepLink'
import type {
  AppStep,
  GeneratieResultaat,
  KamerFoto,
  Montagetype,
  MontagetypeDef,
  Product,
} from './types/product'
import { MONTAGETYPE_LABELS } from './types/product'
import {
  getGenerationCount,
  incrementDailyGenerationCount,
  incrementGenerationCount,
  isDailyLimitReached,
  needsEmailGate,
  remainingGenerations,
  setSessionEmail,
} from './lib/session'
import type { KlantGegevens } from './components/KlantGegevensForm'

function maxStep(a: AppStep, b: AppStep): AppStep {
  return stepIndex(a) >= stepIndex(b) ? a : b
}

function parseDataUrl(raw: string): { base64: string; mime: string } {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(raw)
  if (m) return { mime: m[1]!, base64: m[2]! }
  return { mime: 'image/png', base64: raw }
}

function kleurVoorMail(deurKleur: string, beslagId: string | null | undefined) {
  const beslag = BESLAG_KLEUREN.find((b) => b.id === beslagId)?.naam
  return beslag ? `${deurKleur} · beslag ${beslag}` : deurKleur
}

async function roomImageForMail(foto: KamerFoto): Promise<{
  roomImageBase64: string
  roomMimeType: string
}> {
  const resized = await resizeBlobForGeneration(
    foto.blob,
    MAX_GEN_INPUT_LONG_SIDE,
  )
  const dataUrl = await blobToDataUrl(resized)
  const parsed = parseDataUrl(dataUrl)
  return { roomImageBase64: parsed.base64, roomMimeType: parsed.mime }
}

export default function App() {
  const [step, setStep] = useState<AppStep>('situatie')
  const [maxReached, setMaxReached] = useState<AppStep>('situatie')
  const [montagetype, setMontagetype] = useState<Montagetype | null>(null)
  const [foto, setFoto] = useState<KamerFoto | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  /** Product vastgezet via ?product= — catalogus wordt overgeslagen. */
  const [productLocked, setProductLocked] = useState(false)
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null)
  const [kleur, setKleur] = useState<string | null>(null)
  const [beslagKleur, setBeslagKleur] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [wasMock, setWasMock] = useState(false)
  const [showEmailGate, setShowEmailGate] = useState(false)
  const [showDeliveryChoice, setShowDeliveryChoice] = useState(false)
  const [delivery, setDelivery] = useState<DeliveryChoice | null>(null)
  const [mailBevestiging, setMailBevestiging] = useState<{
    naam: string
    email: string
    prijsindicatie: boolean
    emailed: boolean
  } | null>(null)
  const [forceShowResult, setForceShowResult] = useState(false)

  const [geschiedenis, setGeschiedenis] = useState<GeneratieResultaat[]>([])
  const [actiefId, setActiefId] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(() => remainingGenerations())
  const [producten, setProducten] = useState<Product[]>([])
  const [productenError, setProductenError] = useState<string | null>(null)
  const [catalogusFilters, setCatalogusFilters] = useState<
    PublicCatalogusFilter[]
  >([])
  const [montagetypeOpties, setMontagetypeOpties] = useState<MontagetypeDef[]>(
    [],
  )
  const [situatieTekst, setSituatieTekst] = useState<SituatieTekst>({
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
  })

  const actieveMontageOpties = useMemo(() => {
    const base = montagetypeOpties.filter((m) => {
      if (m.actief === false) return false
      return producten.some((p) => {
        const types = p.montagetypes?.length ? p.montagetypes : [p.montagetype]
        return types.includes(m.id)
      })
    })
    if (productLocked && product) {
      const allowed = new Set(productMontagetypes(product))
      return base.filter((m) => allowed.has(m.id))
    }
    return base
  }, [montagetypeOpties, producten, productLocked, product])

  const actief = geschiedenis.find((g) => g.id === actiefId) ?? null

  useEffect(() => {
    let cancelled = false
    const link = parseDeepLink()
    void Promise.all([fetchProducten(), fetchSiteContent()])
      .then(([lijst, content]) => {
        if (cancelled) return
        setProducten(lijst)
        setProductenError(null)
        setSituatieTekst(content.situatie)
        setCatalogusFilters(content.filters)
        setMontagetypeOpties(
          content.montagetypes.map((m) => ({
            ...m,
            agentPrompt: '',
            deurGroep: m.deurGroep === 'buiten' ? 'buiten' : 'binnen',
          })),
        )

        if (link.productId) {
          const found = lijst.find(
            (p) => p.id.toLowerCase() === link.productId!.toLowerCase(),
          )
          if (found) {
            setProduct(found)
            setProductLocked(true)
            setKleur(null)
            setBeslagKleur(null)
            const montage = resolveMontagetypeForProduct(
              found,
              link.montageId,
            )
            if (montage) setMontagetype(montage)
            trackEvent({
              eventType: 'product_selected',
              productId: found.id,
              productNaam: found.naam,
              montagetype: montage ?? undefined,
              meta: { source: 'deeplink' },
            })
          } else {
            setDeepLinkError(
              `Deurmodel “${link.productId}” is niet gevonden of niet actief.`,
            )
          }
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

  function unlockProduct() {
    setProductLocked(false)
    setProduct(null)
    setKleur(null)
    setBeslagKleur(null)
    setDeepLinkError(null)
    clearDeepLinkFromUrl()
  }

  /** Na foto: met vast product naar kleur (of plan als montage nog openstaat). */
  function continueAfterFoto() {
    if (productLocked && product) {
      if (montagetype) {
        goTo('kleur')
        return
      }
      goTo('plan')
      return
    }
    goTo('plan')
  }

  function continueAfterPlan() {
    if (productLocked && product) {
      goTo('kleur')
      return
    }
    goTo('catalogus')
  }

  const runGenerate = useCallback(
    async (opts: { isRetry: boolean; delivery?: DeliveryChoice }) => {
      if (!foto || !product || !kleur || !beslagKleur || !montagetype) return

      if (isDailyLimitReached()) {
        trackEvent({ eventType: 'daily_limit_hit' })
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

      const activeDelivery = opts.delivery ?? delivery ?? { mode: 'wait' as const }
      setDelivery(activeDelivery)
      setMailBevestiging(null)
      setForceShowResult(false)
      setGenError(null)
      setGenerating(true)
      goTo('resultaat')

      try {
        const cacheKey = await buildCacheKey(
          foto.blob,
          product.id,
          kleur,
          beslagKleur,
        )

        if (!opts.isRetry) {
          const cached = await cacheGet(cacheKey)
          if (cached) {
            trackEvent({
              eventType: 'generate_cache_hit',
              productId: product.id,
              productNaam: product.naam,
              montagetype,
              kleur,
              beslagKleur,
              fromCache: true,
            })
            const item: GeneratieResultaat = {
              id: crypto.randomUUID(),
              cacheKey,
              imageUrl: cached,
              productId: product.id,
              productNaam: product.naam,
              kleur,
              beslagKleur,
              createdAt: Date.now(),
              fromCache: true,
              isRetry: false,
            }
            setGeschiedenis((prev) => [item, ...prev])
            setActiefId(item.id)

            if (activeDelivery.mode === 'mail') {
              const mimeMatch = /^data:([^;]+);base64,(.+)$/i.exec(cached)
              const room = await roomImageForMail(foto)
              const payload = {
                naam: activeDelivery.naam,
                woonplaats: activeDelivery.woonplaats,
                email: activeDelivery.email,
                prijsindicatie: activeDelivery.prijsindicatie,
                bron: 'mail' as const,
                productId: product.id,
                productNaam: product.naam,
                kleur: kleurVoorMail(kleur, beslagKleur),
                montagetype: MONTAGETYPE_LABELS[montagetype] ?? montagetype,
                imageBase64: mimeMatch?.[2] ?? cached,
                mimeType: mimeMatch?.[1] ?? 'image/png',
                sessionId: getAnalyticsSessionId(),
                ...room,
              }
              try {
                const mailRes = await requestMailResultaat(payload)
                trackEvent({
                  eventType: mailRes.emailed ? 'mail_sent' : 'mail_failed',
                  productId: product.id,
                  productNaam: product.naam,
                  montagetype,
                  kleur,
                  beslagKleur,
                  bron: 'mail',
                  prijsindicatie: activeDelivery.prijsindicatie,
                  fromCache: true,
                })
                setMailBevestiging({
                  naam: activeDelivery.naam,
                  email: activeDelivery.email,
                  prijsindicatie: activeDelivery.prijsindicatie,
                  emailed: mailRes.emailed,
                })
              } catch {
                trackEvent({
                  eventType: 'mail_failed',
                  productId: product.id,
                  productNaam: product.naam,
                  montagetype,
                  kleur,
                  beslagKleur,
                  bron: 'mail',
                  fromCache: true,
                })
                setMailBevestiging({
                  naam: activeDelivery.naam,
                  email: activeDelivery.email,
                  prijsindicatie: activeDelivery.prijsindicatie,
                  emailed: false,
                })
              }
            }
            return
          }
        }

        if (opts.isRetry) {
          trackEvent({
            eventType: 'generate_retry',
            productId: product.id,
            productNaam: product.naam,
            montagetype,
            kleur,
            beslagKleur,
          })
        }

        const roomForGen = await resizeBlobForGeneration(
          foto.blob,
          MAX_GEN_INPUT_LONG_SIDE,
        )
        const roomImageBase64 = await blobToDataUrl(roomForGen)
        const data = await requestGeneration({
          roomImageBase64,
          productImageUrl: product.afbeeldingUrl,
          productId: product.id,
          productNaam: product.naam,
          kleur,
          beslagKleur,
          montagetype,
          cacheKey,
          sessionId: getAnalyticsSessionId(),
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

        setRemaining(remainingGenerations())

        trackEvent({
          eventType: 'generate_success',
          productId: product.id,
          productNaam: product.naam,
          montagetype,
          kleur,
          beslagKleur,
          isMock: Boolean(data.mock),
          isRetry: opts.isRetry,
          fromCache: false,
        })

        const item: GeneratieResultaat = {
          id: crypto.randomUUID(),
          cacheKey,
          imageUrl,
          productId: product.id,
          productNaam: product.naam,
          kleur,
          beslagKleur,
          createdAt: Date.now(),
          fromCache: false,
          isRetry: opts.isRetry,
        }
        setGeschiedenis((prev) => [item, ...prev])
        setActiefId(item.id)

        if (activeDelivery.mode === 'mail') {
          const room = await roomImageForMail(foto)
          try {
            const mailRes = await requestMailResultaat({
              naam: activeDelivery.naam,
              woonplaats: activeDelivery.woonplaats,
              email: activeDelivery.email,
              prijsindicatie: activeDelivery.prijsindicatie,
              bron: 'mail',
              productId: product.id,
              productNaam: product.naam,
              kleur: kleurVoorMail(kleur, beslagKleur),
              montagetype: MONTAGETYPE_LABELS[montagetype] ?? montagetype,
              imageBase64: data.imageBase64,
              mimeType: mime,
              sessionId: getAnalyticsSessionId(),
              ...room,
            })
            setMailBevestiging({
              naam: activeDelivery.naam,
              email: activeDelivery.email,
              prijsindicatie: activeDelivery.prijsindicatie,
              emailed: mailRes.emailed,
            })
            trackEvent({
              eventType: mailRes.emailed ? 'mail_sent' : 'mail_failed',
              productId: product.id,
              productNaam: product.naam,
              montagetype,
              kleur,
              beslagKleur,
              bron: 'mail',
              prijsindicatie: activeDelivery.prijsindicatie,
            })
          } catch {
            trackEvent({
              eventType: 'mail_failed',
              productId: product.id,
              productNaam: product.naam,
              montagetype,
              kleur,
              beslagKleur,
              bron: 'mail',
            })
            setMailBevestiging({
              naam: activeDelivery.naam,
              email: activeDelivery.email,
              prijsindicatie: activeDelivery.prijsindicatie,
              emailed: false,
            })
          }
        }
      } catch (err) {
        trackEvent({
          eventType: 'generate_error',
          productId: product?.id,
          productNaam: product?.naam,
          montagetype: montagetype ?? undefined,
          kleur: kleur ?? undefined,
          beslagKleur: beslagKleur ?? undefined,
          errorMessage: err instanceof Error ? err.message : 'onbekend',
          isRetry: opts.isRetry,
        })
        setGenError(
          err instanceof Error
            ? err.message
            : 'Er ging iets mis bij het genereren. Probeer het opnieuw.',
        )
      } finally {
        setGenerating(false)
      }
    },
    [foto, product, kleur, beslagKleur, montagetype, goTo, delivery],
  )

  function startGenerateFlow() {
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
    setShowDeliveryChoice(true)
  }

  function navigateStep(id: FlowStepId) {
    if (id === 'situatie') goTo('situatie')
    else if (id === 'plan' && foto) goTo('plan')
    else if (id === 'catalogus' && foto && montagetype) {
      if (productLocked && product) goTo('kleur')
      else goTo('catalogus')
    } else if (id === 'kleur' && foto && montagetype && product) goTo('kleur')
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
        {deepLinkError && step === 'situatie' && (
          <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
            <p className="note-banner text-sm" role="status">
              {deepLinkError} U kunt gewoon een deur kiezen in de catalogus.
            </p>
          </div>
        )}

        {step === 'situatie' && (
          <FotoUpload
            foto={foto}
            teksten={situatieTekst}
            preselectedProduct={productLocked ? product : null}
            onLoaded={(next) => {
              setFoto(next)
              trackEvent({ eventType: 'foto_uploaded' })
            }}
            onContinue={continueAfterFoto}
          />
        )}

        {step === 'plan' && (
          <MontagetypeKiezer
            options={actieveMontageOpties}
            value={montagetype}
            onChange={(next) => {
              setMontagetype(next)
              if (next) {
                trackEvent({
                  eventType: 'montagetype_selected',
                  montagetype: next,
                })
              }
            }}
            onBack={() => goTo('situatie')}
            onContinue={continueAfterPlan}
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
              filters={catalogusFilters}
              montagetype={montagetype}
              selectedId={product?.id ?? null}
              onSelect={(p) => {
                setProduct(p)
                setProductLocked(false)
                setKleur(null)
                setBeslagKleur(null)
                trackEvent({
                  eventType: 'product_selected',
                  productId: p.id,
                  productNaam: p.naam,
                  montagetype,
                })
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
            onChange={(next) => {
              setKleur(next)
              trackEvent({
                eventType: 'kleur_selected',
                productId: product.id,
                productNaam: product.naam,
                montagetype: montagetype ?? undefined,
                kleur: next,
              })
            }}
            beslagKleur={beslagKleur}
            onBeslagKleurChange={(next) => {
              setBeslagKleur(next)
              trackEvent({
                eventType: 'beslag_selected',
                productId: product.id,
                productNaam: product.naam,
                montagetype: montagetype ?? undefined,
                kleur: kleur ?? undefined,
                beslagKleur: next,
              })
            }}
            onBack={() =>
              productLocked ? goTo('situatie') : goTo('catalogus')
            }
            generating={generating}
            remaining={remaining}
            onGenerate={() => {
              startGenerateFlow()
            }}
          />
        )}

        {step === 'resultaat' && (
          <>
            {generating && product && kleur && foto && (
              <GeneratieVoortgang
                product={product}
                kleur={kleur}
                beslagKleur={beslagKleur}
                roomPreviewUrl={foto.previewUrl}
                forMail={delivery?.mode === 'mail'}
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
                    onClick={() => {
                      unlockProduct()
                      if (montagetype) goTo('catalogus')
                      else goTo('plan')
                    }}
                  >
                    Andere deur kiezen
                  </button>
                </div>
              </section>
            )}

            {!generating &&
              !genError &&
              mailBevestiging &&
              !forceShowResult && (
                <MailBevestiging
                  naam={mailBevestiging.naam}
                  email={mailBevestiging.email}
                  prijsindicatie={mailBevestiging.prijsindicatie}
                  emailed={mailBevestiging.emailed}
                  onBekijkResultaat={() => setForceShowResult(true)}
                  onAndereDeur={() => {
                    unlockProduct()
                    if (montagetype) goTo('catalogus')
                    else goTo('plan')
                  }}
                />
              )}

            {!generating &&
              !genError &&
              actief &&
              product &&
              foto &&
              montagetype &&
              (!mailBevestiging || forceShowResult) && (
              <ResultaatView
                resultaat={actief}
                product={product}
                geschiedenis={geschiedenis}
                onSelectResultaat={setActiefId}
                onRetry={() => void runGenerate({ isRetry: true })}
                onAndereDeur={() => {
                  unlockProduct()
                  if (montagetype) goTo('catalogus')
                  else goTo('plan')
                }}
                onOfferte={async (gegevens: KlantGegevens) => {
                  setSessionEmail(gegevens.email)
                  const mimeMatch = parseDataUrl(actief.imageUrl)
                  const room = await roomImageForMail(foto)
                  await requestMailResultaat({
                    naam: gegevens.naam,
                    woonplaats: gegevens.woonplaats,
                    email: gegevens.email,
                    prijsindicatie: true,
                    bron: 'offerte',
                    productId: product.id,
                    productNaam: product.naam,
                    kleur: kleurVoorMail(
                      actief.kleur,
                      actief.beslagKleur ?? beslagKleur,
                    ),
                    montagetype:
                      MONTAGETYPE_LABELS[montagetype] ?? montagetype,
                    imageBase64: mimeMatch.base64,
                    mimeType: mimeMatch.mime,
                    sessionId: getAnalyticsSessionId(),
                    ...room,
                  })
                  trackEvent({
                    eventType: 'offerte_requested',
                    productId: product.id,
                    productNaam: product.naam,
                    montagetype,
                    kleur: actief.kleur,
                    beslagKleur: actief.beslagKleur ?? beslagKleur ?? undefined,
                    bron: 'offerte',
                    prijsindicatie: true,
                  })
                }}
                mock={wasMock}
              />
            )}
          </>
        )}
      </main>

      {showDeliveryChoice && (
        <WachtOfMailDialog
          onCancel={() => setShowDeliveryChoice(false)}
          onChoose={(choice) => {
            setShowDeliveryChoice(false)
            trackEvent({
              eventType:
                choice.mode === 'mail' ? 'delivery_mail' : 'delivery_wait',
              productId: product?.id,
              productNaam: product?.naam,
              montagetype: montagetype ?? undefined,
              kleur: kleur ?? undefined,
              beslagKleur: beslagKleur ?? undefined,
              prijsindicatie:
                choice.mode === 'mail' ? choice.prijsindicatie : undefined,
            })
            if (choice.mode === 'mail') {
              setSessionEmail(choice.email)
              setRemaining(remainingGenerations())
            }
            void runGenerate({ isRetry: false, delivery: choice })
          }}
        />
      )}

      {showEmailGate && (
        <EmailGate
          onDone={() => {
            setShowEmailGate(false)
            setRemaining(remainingGenerations())
            setShowDeliveryChoice(true)
          }}
        />
      )}

      <span className="sr-only">Generaties deze sessie: {getGenerationCount()}</span>
    </div>
  )
}
