import { useEffect, useRef } from 'react'
import type { ScanSource } from '@shared/ipc'

/** Return false to let the next (older) handler try. */
export type ScanHandler = (code: string, source: ScanSource) => boolean | void

const stack: ScanHandler[] = []
const observers = new Set<(code: string, source: ScanSource) => void>()

export function pushScanHandler(h: ScanHandler): () => void {
  stack.push(h)
  return () => {
    const i = stack.lastIndexOf(h)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Newest handler wins (e.g. an open "Scan to fill" form beats add-to-cart). */
export function dispatchScan(code: string, source: ScanSource): void {
  for (const o of observers) o(code, source)
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i](code, source) !== false) return
}

export function observeScans(fn: (code: string, source: ScanSource) => void): () => void {
  observers.add(fn)
  return () => observers.delete(fn)
}

export function useScanHandler(handler: ScanHandler, enabled = true): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => (enabled ? pushScanHandler((c, s) => ref.current(c, s)) : undefined), [enabled])
}
