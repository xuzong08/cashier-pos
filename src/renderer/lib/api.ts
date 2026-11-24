import type { Result } from '@shared/ipc'

export const api = window.api

/** Unwraps a main-process Result, throwing its message as an Error. */
export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new Error(r.error)
  return r.data
}

export const todayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** DB timestamps are local "YYYY-MM-DD HH:MM:SS". */
export const parseDbDate = (s: string): Date => new Date(s.replace(' ', 'T'))

// <html lang> holds the date locale of the chosen language (set in App)
const loc = (): string => document.documentElement.lang || 'en-US'

export const fmtTime = (s: string): string => parseDbDate(s).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
export const fmtDateTime = (s: string): string =>
  parseDbDate(s).toLocaleString(loc(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Downscale a picked/captured image to a small JPEG data URL for the DB. */
export async function toThumbDataUrl(src: Blob | HTMLVideoElement, size = 360): Promise<string> {
  let source: CanvasImageSource
  let w: number
  let h: number
  if (src instanceof HTMLVideoElement) {
    source = src
    w = src.videoWidth
    h = src.videoHeight
  } else {
    const bmp = await createImageBitmap(src)
    source = bmp
    w = bmp.width
    h = bmp.height
  }
  const side = Math.min(w, h)
  const c = document.createElement('canvas')
  c.width = c.height = size
  c.getContext('2d')!.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size)
  return c.toDataURL('image/jpeg', 0.82)
}
