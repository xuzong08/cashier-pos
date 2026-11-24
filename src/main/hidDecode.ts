// Decodes HID boot-keyboard reports (what most USB barcode scanners send) into text.
// Report: [modifiers, reserved, key1..key6]. Usage IDs from the USB HID Usage Tables, page 0x07.

const BASE: Record<number, [string, string]> = {}
for (let i = 0; i < 26; i++) BASE[0x04 + i] = [String.fromCharCode(97 + i), String.fromCharCode(65 + i)]
const DIGITS = '1234567890'
const SHIFTED = '!@#$%^&*()'
for (let i = 0; i < 10; i++) BASE[0x1e + i] = [DIGITS[i], SHIFTED[i]]
Object.assign(BASE, {
  0x2c: [' ', ' '],
  0x2d: ['-', '_'],
  0x2e: ['=', '+'],
  0x2f: ['[', '{'],
  0x30: [']', '}'],
  0x31: ['\\', '|'],
  0x33: [';', ':'],
  0x34: ["'", '"'],
  0x35: ['`', '~'],
  0x36: [',', '<'],
  0x37: ['.', '>'],
  0x38: ['/', '?'],
  // keypad digits
  0x59: ['1', '1'],
  0x5a: ['2', '2'],
  0x5b: ['3', '3'],
  0x5c: ['4', '4'],
  0x5d: ['5', '5'],
  0x5e: ['6', '6'],
  0x5f: ['7', '7'],
  0x60: ['8', '8'],
  0x61: ['9', '9'],
  0x62: ['0', '0']
})
const ENTER = new Set([0x28, 0x58, 0x2b]) // Enter, keypad Enter, Tab

export class HidKeyboardDecoder {
  private buf = ''
  private lastKeys = new Set<number>()

  /** Feed one report. Returns a complete code when Enter/Tab is pressed. */
  feed(report: Uint8Array): string | null {
    // some devices prefix a report ID byte; boot reports are 8 bytes
    const r = report.length === 9 ? report.subarray(1) : report
    if (r.length < 3) return null
    const shift = (r[0] & 0x22) !== 0
    const keys = new Set<number>()
    let done: string | null = null
    for (let i = 2; i < Math.min(r.length, 8); i++) {
      const k = r[i]
      if (!k) continue
      keys.add(k)
      if (this.lastKeys.has(k)) continue // still held from the previous report
      if (ENTER.has(k)) {
        if (this.buf) done = this.buf
        this.buf = ''
      } else if (BASE[k]) this.buf += BASE[k][shift ? 1 : 0]
    }
    this.lastKeys = keys
    return done
  }
}

/** HID POS scanners (usage page 0x8C) send [reportId, length, ...ascii]. */
export function decodePosReport(report: Uint8Array): string | null {
  // shortcut: assumes one report holds the whole code; long 2D codes split across reports need reassembly
  const len = report[1]
  if (!len) return null
  const text = Buffer.from(report.subarray(2, 2 + len)).toString('latin1').replace(/[\x00-\x1f]/g, '')
  return text || null
}
