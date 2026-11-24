import { createRequire } from 'node:module'
import { SerialPort, ReadlineParser } from 'serialport'
import type { DeviceStatus, HardwareStatus, HidInfo, PortInfo, Settings } from '@shared/types'
import { HidKeyboardDecoder, decodePosReport } from './hidDecode'

type Emit = (source: 'serial' | 'hid', code: string) => void
type StatusCb = (s: HardwareStatus) => void

const TERMINATORS = { CR: '\r', LF: '\n', CRLF: '\r\n' } as const

export class ScannerHub {
  private serial: SerialPort | null = null
  private serialWanted = false
  private serialTimer: NodeJS.Timeout | null = null
  private serialCfg: Settings | null = null
  private hidDev: { close(): void; on(ev: string, cb: (x: never) => void): void } | null = null
  status: HardwareStatus = { serial: { state: 'off' }, hid: { state: 'off' } }

  constructor(
    private emit: Emit,
    private onStatus: StatusCb
  ) {}

  private set(kind: keyof HardwareStatus, s: DeviceStatus): void {
    this.status = { ...this.status, [kind]: s }
    this.onStatus(this.status)
  }

  // ---------- serial / COM ----------
  async listPorts(): Promise<PortInfo[]> {
    const ports = await SerialPort.list()
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer, vendorId: p.vendorId, productId: p.productId }))
  }

  connectSerial(s: Settings): void {
    this.disconnectSerial()
    if (!s.serialPath) {
      this.set('serial', { state: 'error', message: 'No COM port selected' })
      return
    }
    this.serialWanted = true
    this.serialCfg = s
    this.openSerial()
  }

  private openSerial(): void {
    const s = this.serialCfg
    if (!s || !this.serialWanted) return
    this.set('serial', { state: 'connecting', message: s.serialPath })
    const port = new SerialPort({
      path: s.serialPath,
      baudRate: s.serialBaud,
      dataBits: s.serialDataBits,
      parity: s.serialParity,
      stopBits: 1,
      autoOpen: false
    })
    const parser = port.pipe(new ReadlineParser({ delimiter: TERMINATORS[s.serialTerminator] }))
    parser.on('data', (line: string) => {
      const code = line.replace(/[\r\n\x00-\x1f]/g, '').trim()
      if (code) this.emit('serial', code)
    })
    port.on('close', () => {
      if (this.serial === port) this.serial = null
      if (this.serialWanted) {
        this.set('serial', { state: 'error', message: 'Disconnected, waiting for device…' })
        this.scheduleReconnect()
      }
    })
    port.on('error', (e) => this.set('serial', { state: 'error', message: e.message }))
    port.open((err) => {
      if (err) {
        this.set('serial', { state: 'error', message: `${err.message} — retrying` })
        this.scheduleReconnect()
        return
      }
      this.serial = port
      this.set('serial', { state: 'connected', message: s.serialPath })
    })
  }

  /** Poll for the port to come back after unplugging, then reopen. */
  private scheduleReconnect(): void {
    if (this.serialTimer || !this.serialWanted) return
    this.serialTimer = setTimeout(async () => {
      this.serialTimer = null
      if (!this.serialWanted || !this.serialCfg) return
      const present = (await SerialPort.list().catch(() => [])).some((p) => p.path === this.serialCfg!.serialPath)
      if (present) this.openSerial()
      else this.scheduleReconnect()
    }, 2000)
  }

  disconnectSerial(): void {
    this.serialWanted = false
    if (this.serialTimer) clearTimeout(this.serialTimer)
    this.serialTimer = null
    const p = this.serial
    this.serial = null
    if (p?.isOpen) p.close()
    this.set('serial', { state: 'off' })
  }

  // ---------- raw USB HID ----------
  private hid(): typeof import('node-hid') | null {
    try {
      return createRequire(__filename)('node-hid')
    } catch {
      return null
    }
  }

  listHid(): HidInfo[] {
    const HID = this.hid()
    if (!HID) throw new Error('node-hid is not installed on this build')
    return HID.devices()
      .filter((d) => d.path)
      .map((d) => ({
        path: d.path!,
        product: d.product,
        manufacturer: d.manufacturer,
        vendorId: d.vendorId,
        productId: d.productId,
        usagePage: d.usagePage,
        usage: d.usage
      }))
  }

  connectHid(s: Settings): void {
    this.disconnectHid()
    const HID = this.hid()
    if (!HID) return this.set('hid', { state: 'error', message: 'node-hid is not available' })
    if (!s.hidPath) return this.set('hid', { state: 'error', message: 'No HID device selected' })
    const info = HID.devices().find((d) => d.path === s.hidPath)
    let dev: InstanceType<typeof HID.HID>
    try {
      dev = new HID.HID(s.hidPath)
    } catch (e) {
      const keyboard = info?.usagePage === 1 && info?.usage === 6
      return this.set('hid', {
        state: 'error',
        message: keyboard
          ? 'The OS has claimed this scanner as a keyboard, so it cannot be opened raw. Use Keyboard-wedge mode instead (it already works), or switch the scanner to HID-POS / USB-COM mode with its config barcode.'
          : `Cannot open device: ${(e as Error).message}. Try keyboard-wedge mode instead.`
      })
    }
    const pos = info?.usagePage === 0x8c
    const kb = new HidKeyboardDecoder()
    dev.on('data', (data: Buffer) => {
      const code = pos ? decodePosReport(data) : kb.feed(data)
      if (code) this.emit('hid', code)
    })
    dev.on('error', (e: Error) => {
      this.set('hid', { state: 'error', message: `Device lost: ${e.message}` })
      this.hidDev = null
    })
    this.hidDev = dev as never
    this.set('hid', { state: 'connected', message: info?.product ?? s.hidPath })
  }

  disconnectHid(): void {
    try {
      this.hidDev?.close()
    } catch {
      // already closed
    }
    this.hidDev = null
    this.set('hid', { state: 'off' })
  }

  dispose(): void {
    this.disconnectSerial()
    this.disconnectHid()
  }
}
