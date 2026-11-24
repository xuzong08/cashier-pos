import { describe, expect, it } from 'vitest'
import { WedgeDetector, type WedgeOptions } from '@/lib/wedge'
import { HidKeyboardDecoder, decodePosReport } from '../../src/main/hidDecode'

const OPTS: WedgeOptions = { maxIntervalMs: 35, minLength: 4, prefix: '', suffix: '' }

/** Feeds a string as keydowns with a fixed gap, then a terminator. */
function type(d: WedgeDetector, text: string, gap: number, start = 1000, terminator = 'Enter') {
  let t = start
  for (const ch of text) {
    expect(d.feed(ch, t)).toBeNull()
    t += gap
  }
  return d.feed(terminator, t - gap + Math.min(gap, 10))
}

describe('WedgeDetector', () => {
  it('detects a fast burst ended by Enter', () => {
    const d = new WedgeDetector(OPTS)
    expect(type(d, '2000000000015', 8)).toEqual({ code: '2000000000015', rawLength: 13 })
  })

  it('accepts Tab as terminator', () => {
    const d = new WedgeDetector(OPTS)
    expect(type(d, '12345678', 5, 0, 'Tab')?.code).toBe('12345678')
  })

  it('ignores normal human typing', () => {
    const d = new WedgeDetector(OPTS)
    expect(type(d, '2000000000015', 120)).toBeNull()
  })

  it('ignores bursts shorter than the minimum length', () => {
    const d = new WedgeDetector(OPTS)
    expect(type(d, 'ab', 5)).toBeNull()
  })

  it('ignores Enter pressed long after a fast burst', () => {
    const d = new WedgeDetector(OPTS)
    let t = 0
    for (const ch of '12345678') d.feed(ch, (t += 5))
    expect(d.feed('Enter', t + 500)).toBeNull()
  })

  it('a slow prefix typed by a human does not join the scanner burst', () => {
    const d = new WedgeDetector(OPTS)
    d.feed('h', 0)
    d.feed('i', 300) // human
    // scanner starts 400ms later
    expect(type(d, '98765432', 6, 700)?.code).toBe('98765432')
  })

  it('treats a gap just over the threshold as a new burst', () => {
    const d = new WedgeDetector(OPTS)
    d.feed('1', 0)
    d.feed('2', 10)
    d.feed('3', 50) // 40ms gap > 35ms: restart at '3'
    d.feed('4', 55)
    d.feed('5', 60)
    d.feed('6', 65)
    expect(d.feed('Enter', 70)?.code).toBe('3456')
  })

  it('modifier keys do not break a burst (uppercase via Shift)', () => {
    const d = new WedgeDetector(OPTS)
    let t = 0
    for (const k of ['Shift', 'A', 'B', 'Shift', 'C', '1', '2']) d.feed(k, (t += 4))
    expect(d.feed('Enter', t + 4)?.code).toBe('ABC12')
  })

  it('strips configured prefix and suffix', () => {
    const d = new WedgeDetector({ ...OPTS, prefix: ']E0', suffix: '#' })
    const r = type(d, ']E04006381333931#', 4)
    expect(r?.code).toBe('4006381333931')
    expect(r?.rawLength).toBe(17)
  })

  it('respects a custom threshold', () => {
    const slowScanner = new WedgeDetector({ ...OPTS, maxIntervalMs: 60 })
    expect(type(slowScanner, '12345678', 50)?.code).toBe('12345678')
    const strict = new WedgeDetector({ ...OPTS, maxIntervalMs: 20 })
    expect(type(strict, '12345678', 30)).toBeNull()
  })

  it('resets after each scan', () => {
    const d = new WedgeDetector(OPTS)
    expect(type(d, '11112222', 5, 0)?.code).toBe('11112222')
    expect(type(d, '33334444', 5, 200)?.code).toBe('33334444')
    expect(d.burstLength).toBe(0)
  })
})

describe('HID decoding', () => {
  const report = (mod: number, key: number): Uint8Array => new Uint8Array([mod, 0, key, 0, 0, 0, 0, 0])
  const release = new Uint8Array(8)

  it('decodes boot-keyboard reports into a code', () => {
    const dec = new HidKeyboardDecoder()
    // "A1b" + Enter: Shift+a (0x04), 1 (0x1e), b (0x05)
    const seq = [report(0x02, 0x04), release, report(0, 0x1e), release, report(0, 0x05), release]
    for (const r of seq) expect(dec.feed(r)).toBeNull()
    expect(dec.feed(report(0, 0x28))).toBe('A1b')
  })

  it('does not repeat a key held across reports', () => {
    const dec = new HidKeyboardDecoder()
    dec.feed(report(0, 0x1f)) // 2
    dec.feed(report(0, 0x1f)) // still held
    dec.feed(release)
    dec.feed(report(0, 0x20)) // 3
    dec.feed(release)
    expect(dec.feed(report(0, 0x28))).toBe('23')
  })

  it('decodes HID-POS reports', () => {
    const bytes = new Uint8Array([2, 4, ...Buffer.from('1234'), 0, 0])
    expect(decodePosReport(bytes)).toBe('1234')
  })
})
