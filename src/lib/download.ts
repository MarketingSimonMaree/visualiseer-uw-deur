/**
 * Download / delen van het visualisatieresultaat,
 * met watermerk simonmaree.nl + AI-disclaimer.
 */

export const WATERMARK_BRAND = 'www.simonmaree.nl'
export const WATERMARK_AI =
  'Betreft een afbeelding gegenereerd met AI, mogen geen rechten aan ontleend worden.'

async function ensurePoppinsLoaded(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    await document.fonts.load('600 24px Poppins')
    await document.fonts.load('400 16px Poppins')
    await document.fonts.ready
  } catch {
    /* fallback font */
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const pad = Math.max(12, Math.round(canvasWidth * 0.018))
  const brandSize = Math.max(13, Math.round(canvasWidth * 0.02))
  const aiSize = Math.max(10, Math.round(canvasWidth * 0.014))
  const maxAiWidth = canvasWidth - pad * 2

  ctx.save()
  ctx.font = `400 ${aiSize}px Poppins, sans-serif`
  const aiLines = wrapText(ctx, WATERMARK_AI, maxAiWidth)
  const lineH = Math.round(aiSize * 1.35)
  const brandH = Math.round(brandSize * 1.2)
  const barH = pad + brandH + pad * 0.4 + aiLines.length * lineH + pad

  // Semi-transparante balk onderaan voor leesbaarheid
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.fillRect(0, canvasHeight - barH, canvasWidth, barH)

  let y = canvasHeight - pad - (aiLines.length - 1) * lineH
  ctx.font = `400 ${aiSize}px Poppins, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = 'rgba(35,35,35,0.88)'
  for (let i = 0; i < aiLines.length; i++) {
    ctx.fillText(aiLines[i]!, pad, y + i * lineH)
  }

  ctx.font = `600 ${brandSize}px Poppins, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = 'rgba(16,16,16,0.9)'
  ctx.fillText(
    WATERMARK_BRAND,
    canvasWidth - pad,
    canvasHeight - barH + pad + brandSize,
  )
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

/** Voor e-mailbijlagen: zelfde watermerk als bij download. */
export async function watermarkImageToBase64(
  imageUrl: string,
): Promise<{ base64: string; mimeType: string }> {
  const canvas = await imageUrlToCanvas(imageUrl)
  const dataUrl = canvas.toDataURL('image/png')
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!m) throw new Error('Watermerk toepassen mislukt')
  return { mimeType: m[1]!, base64: m[2]! }
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
