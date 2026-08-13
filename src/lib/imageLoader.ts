import { MAX_IMAGE_LONG_SIDE } from '../config'

export class ImageLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageLoadError'
  }
}

function isHeic(file: File): boolean {
  const t = file.type.toLowerCase()
  const n = file.name.toLowerCase()
  return (
    t === 'image/heic' ||
    t === 'image/heif' ||
    n.endsWith('.heic') ||
    n.endsWith('.heif')
  )
}

async function convertHeic(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  const blob = Array.isArray(result) ? result[0] : result
  if (!(blob instanceof Blob)) {
    throw new ImageLoadError('HEIC-conversie mislukt. Probeer de foto als JPG te exporteren.')
  }
  return blob
}

/**
 * Laadt een klantfoto:
 * HEIC → JPG, EXIF-oriëntatie toepassen, verkleinen, EXIF strippen (nieuw JPEG zonder metadata).
 */
export async function loadKamerFoto(
  file: File,
  onProgress?: (label: string) => void,
): Promise<{ blob: Blob; previewUrl: string; width: number; height: number }> {
  if (!file.type.startsWith('image/') && !isHeic(file)) {
    throw new ImageLoadError('Kies een foto (JPG, PNG of HEIC vanaf uw iPhone).')
  }

  let working: Blob = file
  if (isHeic(file)) {
    onProgress?.('HEIC converteren… dit duurt even')
    working = await convertHeic(file)
  }

  onProgress?.('Foto voorbereiden…')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(working, { imageOrientation: 'from-image' })
  } catch {
    throw new ImageLoadError(
      'Deze foto konden we niet openen. Maak een nieuwe foto of exporteer als JPG.',
    )
  }

  const { width, height } = fitLongSide(bitmap.width, bitmap.height, MAX_IMAGE_LONG_SIDE)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new ImageLoadError('Canvas niet beschikbaar in deze browser.')
  }

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // JPEG zonder EXIF (AVG: geen GPS e.d.)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ImageLoadError('Kon de foto niet verwerken.'))),
      'image/jpeg',
      0.9,
    )
  })

  const previewUrl = URL.createObjectURL(blob)
  return { blob, previewUrl, width, height }
}

function fitLongSide(w: number, h: number, max: number): { width: number; height: number } {
  const long = Math.max(w, h)
  if (long <= max) return { width: w, height: h }
  const scale = max / long
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Bestand lezen mislukt'))
    reader.readAsDataURL(blob)
  })
}

/** Verkleint een blob voor de generatie-API (sneller dan volle resolutie sturen). */
export async function resizeBlobForGeneration(
  blob: Blob,
  maxLongSide: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const { width, height } = fitLongSide(bitmap.width, bitmap.height, maxLongSide)
  if (width === bitmap.width && height === bitmap.height) {
    bitmap.close()
    return blob
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return blob
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Resize mislukt'))),
      'image/jpeg',
      0.85,
    )
  })
}

export async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Afbeelding laden mislukt (${res.status})`)
  return res.blob()
}
