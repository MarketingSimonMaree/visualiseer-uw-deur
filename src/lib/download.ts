/**
 * Download / delen van het visualisatieresultaat,
 * met watermerktekst "simonmaree.nl" in Poppins.
 */

const WATERMARK = 'simonmaree.nl'

async function ensurePoppinsLoaded(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    await document.fonts.load('600 24px Poppins')
    await document.fonts.ready
  } catch {
    /* fallback font */
  }
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const fontSize = Math.max(14, Math.round(canvasWidth * 0.022))
  const padding = Math.max(12, Math.round(canvasWidth * 0.02))

  ctx.save()
  ctx.font = `600 ${fontSize}px Poppins, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.shadowColor = 'rgba(255,255,255,0.85)'
  ctx.shadowBlur = 6
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.fillText(WATERMARK, canvasWidth - padding, canvasHeight - padding)
  ctx.restore()
}

async function imageUrlToCanvas(imageUrl: string): Promise<HTMLCanvasElement> {
  await ensurePoppinsLoaded()
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Afbeelding laden mislukt'))
    img.src = imageUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas niet beschikbaar')
  ctx.drawImage(img, 0, 0)
  drawWatermark(ctx, canvas.width, canvas.height)
  return canvas
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Kon geen PNG maken'))),
      'image/png',
    )
  })
}

export async function downloadResultaat(
  imageUrl: string,
  filename = 'simon-maree-deurvisualisatie.png',
): Promise<void> {
  const canvas = await imageUrlToCanvas(imageUrl)
  const blob = await canvasToBlob(canvas)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
