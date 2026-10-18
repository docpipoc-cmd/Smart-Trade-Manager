// Trade screenshots. Desktop: files in <userData>/data/screenshots (through the main process).
// Browser: IndexedDB. The database only keeps the file reference, so backups of the .sqlite stay small.
import { idbDelete, idbGet, idbKeys, idbPut } from './db'
import { uid } from './format'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export function checkImage(f: File): string | null {
  const okType = IMAGE_TYPES.includes(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)
  if (!okType) return 'type'
  if (f.size > MAX_IMAGE_BYTES) return 'size'
  return null
}

export async function storeImage(name: string, bytes: Uint8Array): Promise<string> {
  if (window.api) return window.api.imgSave({ name, bytes })
  const key = `${uid()}-${name.replace(/[^\w.-]+/g, '_').slice(0, 80)}`
  await idbPut('images', key, bytes)
  return key
}

export async function removeImageFile(file: string): Promise<void> {
  urlCache.delete(file)
  if (window.api) await window.api.imgDelete(file)
  else await idbDelete('images', file)
}

export async function listImageFiles(): Promise<string[]> {
  return window.api ? window.api.imgList() : idbKeys('images')
}

const urlCache = new Map<string, string>()
const mimeOf = (f: string) => (/\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg')

/** Blob URL for a stored screenshot (cached for the session). null when the file is missing. */
export async function imageUrl(file: string, mime?: string): Promise<string | null> {
  const hit = urlCache.get(file)
  if (hit) return hit
  const bytes = window.api ? await window.api.imgRead(file) : await idbGet('images', file)
  if (!bytes) return null
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime || mimeOf(file) }))
  urlCache.set(file, url)
  return url
}

export async function readImageBytes(file: string): Promise<Uint8Array | null> {
  return window.api ? window.api.imgRead(file) : idbGet('images', file)
}
