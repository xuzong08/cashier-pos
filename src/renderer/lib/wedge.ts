// Keyboard-wedge scanners "type" a code very fast and finish with Enter (or Tab).
// A burst counts as a scan only if every gap between characters is within maxIntervalMs.

export interface WedgeOptions {
  maxIntervalMs: number
  minLength: number
  prefix: string
  suffix: string
}

export interface WedgeScan {
  code: string
  /** characters typed by the scanner, including prefix/suffix; used to undo them in a text field */
  rawLength: number
}

export class WedgeDetector {
  private buf = ''
  private last = -Infinity

  constructor(public opts: WedgeOptions) {}

  /** Feed a keydown. `key` is KeyboardEvent.key, `t` a millisecond timestamp. */
  feed(key: string, t: number): WedgeScan | null {
    if (key === 'Enter' || key === 'Tab') {
      const out = this.finish(t)
      this.reset()
      return out
    }
    if (key.length !== 1) return null // Shift, Alt, etc. do not break a burst
    if (t - this.last > this.opts.maxIntervalMs) this.buf = '' // too slow: start a new burst at this char
    this.buf += key
    this.last = t
    return null
  }

  /** Number of characters in the current fast burst. */
  get burstLength(): number {
    return this.buf.length
  }

  reset(): void {
    this.buf = ''
    this.last = -Infinity
  }

  private finish(t: number): WedgeScan | null {
    // terminator must follow the burst quickly too; some scanners pause slightly before Enter
    if (!this.buf || t - this.last > Math.max(this.opts.maxIntervalMs * 3, 60)) return null
    let code = this.buf
    const { prefix, suffix } = this.opts
    if (prefix && code.startsWith(prefix)) code = code.slice(prefix.length)
    if (suffix && code.endsWith(suffix)) code = code.slice(0, -suffix.length)
    code = code.trim()
    if (code.length < this.opts.minLength) return null
    return { code, rawLength: this.buf.length }
  }
}

export function isEditable(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'submit', 'range', 'color', 'file'].includes(el.type)
  return el.isContentEditable
}

/** Remove the last `n` characters typed before the caret, the React-safe way. */
export function undoTyped(el: HTMLInputElement | HTMLTextAreaElement, n: number): void {
  const end = el.selectionStart ?? el.value.length
  const start = Math.max(0, end - n)
  const next = el.value.slice(0, start) + el.value.slice(end)
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.setSelectionRange(start, start)
}
