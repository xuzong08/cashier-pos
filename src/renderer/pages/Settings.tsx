import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Barcode as BarcodeIcon,
  Camera,
  DatabaseBackup,
  Inbox,
  Monitor,
  Pencil,
  QrCode,
  Plug,
  PlugZap,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ScanBarcode,
  Store,
  Tag,
  Trash2,
  Upload,
  Users,
  Armchair,
  Languages,
  Moon,
  Palette,
  Gauge,
  Sun
} from 'lucide-react'
import type { ScanSource } from '@shared/ipc'
import type { DeviceStatus, HidInfo, PortInfo, Promo, Settings, User } from '@shared/types'
import { api, unwrap } from '@/lib/api'
import { useScanHandler } from '@/lib/scanBus'
import { useApp, useIsAdmin } from '@/store/app'
import { confirmDialog, toast } from '@/store/ui'
import { Toggle } from '@/components/bits'
import { Modal } from '@/components/Modal'
import { CameraScanner } from '@/components/CameraScanner'
import { Greeting } from './Dashboard'
import { FloorEditor } from '@/components/FloorEditor'
import { tr, LANGUAGES } from '@shared/i18n'
import { useT } from '@/lib/i18n'

type Draft = [Settings, <K extends keyof Settings>(k: K, v: Settings[K]) => void]

function Section({ title, icon: I, children, hint }: { title: string; icon: typeof Store; children: ReactNode; hint?: string }) {
  return (
    <section className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2">
        <I size={20} className="text-teal" /> {title}
      </h2>
      {hint && <p className="text-sm text-muted mt-1">{hint}</p>}
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Field({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  )
}

function StatusLine({ s }: { s: DeviceStatus }) {
  const t = useT()
  const tone = { off: 'text-muted', connecting: 'text-amber-600', connected: 'text-emerald-600', error: 'text-rose-600' }[s.state]
  return (
    <div className={`text-sm font-semibold ${tone}`} role="status">
      ● {s.state === 'off' ? t('Not connected') : s.state === 'connected' ? `${t('Connected')} ${s.message ?? ''}` : s.message || t(s.state)}
    </div>
  )
}

const num = (v: string, fallback: number): number => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback)

// ---------- General ----------
function GeneralTab({ d: [s, set] }: { d: Draft }) {
  const t = useT()
  // keep the QR crisp but small enough for settings storage
  const pickQr = async (f?: File): Promise<void> => {
    if (!f) return
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    set('paymentQr', c.toDataURL('image/png'))
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      <Section title={t('Store')} icon={Store}>
        <Field label={t('Store name')} id="s-name">
          <input id="s-name" className="field" value={s.storeName} onChange={(e) => set('storeName', e.target.value)} />
        </Field>
        <Field label={t('Address')} id="s-addr">
          <input id="s-addr" className="field" value={s.storeAddress} onChange={(e) => set('storeAddress', e.target.value)} />
        </Field>
        <Field label={t('Receipt footer')} id="s-foot">
          <input id="s-foot" className="field" value={s.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
        </Field>
      </Section>
      <Section title={t('Money')} icon={Tag}>
        <Field label={t('Currency (ISO code)')} id="s-cur">
          <input id="s-cur" className="field uppercase" maxLength={3} value={s.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
        </Field>
        <Field label={t('Number format (locale)')} id="s-loc">
          <input id="s-loc" className="field" value={s.locale} placeholder="en-US, id-ID, zh-CN…" onChange={(e) => set('locale', e.target.value)} />
        </Field>
        <Field label={t('Tax rate (%)')} id="s-tax">
          <input id="s-tax" className="field" inputMode="decimal" value={s.taxRate} onChange={(e) => set('taxRate', Math.min(100, Math.max(0, num(e.target.value, 0))))} />
        </Field>
      </Section>
      <Section title={t('Payment QR')} icon={QrCode} hint={t('Your Alipay, WeChat Pay or bank QR. Shown to the customer when they pay by QR.')}>
        <div className="flex items-center gap-4">
          {s.paymentQr ? (
            <img src={s.paymentQr} alt={t('Shop payment QR')} className="h-40 rounded-xl border border-line bg-white" />
          ) : (
            <span className="text-sm text-muted">{t('No payment QR yet')}</span>
          )}
          <div className="flex flex-col gap-2">
            <label className="btn-ghost">
              <Upload size={18} /> {t('Choose image')}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickQr(e.target.files?.[0])} data-testid="qr-upload" />
            </label>
            {s.paymentQr && (
              <button className="btn text-muted" onClick={() => set('paymentQr', null)}>
                {t('Remove')}
              </button>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}

// ---------- Scanner ----------
function ScannerTab({ d: [s, set], save }: { d: Draft; save: () => Promise<boolean> }) {
  const t = useT()
  const isAdmin = useIsAdmin()
  const hw = useApp((st) => st.hardware)
  const [last, setLast] = useState<{ code: string; source: ScanSource; at: Date } | null>(null)
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [hids, setHids] = useState<HidInfo[]>([])
  const [hidErr, setHidErr] = useState('')
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [camOpen, setCamOpen] = useState(false)

  // test mode: while this tab is open, scans are shown here instead of going to the cart
  useScanHandler((code, source) => setLast({ code, source, at: new Date() }))

  const refresh = useCallback(async () => {
    const p = await api.hardware.serialList()
    if (p.ok) setPorts(p.data)
    const h = await api.hardware.hidList()
    if (h.ok) {
      setHids(h.data)
      setHidErr('')
    } else setHidErr(h.error)
    setCams((await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput'))
  }, [])
  useEffect(() => void refresh(), [refresh])

  const connect = async (kind: 'serial' | 'hid', on: boolean): Promise<void> => {
    if (on && !(await save())) return
    const r = kind === 'serial' ? await (on ? api.hardware.serialConnect() : api.hardware.serialDisconnect()) : await (on ? api.hardware.hidConnect() : api.hardware.hidDisconnect())
    if (!r.ok) toast.err(r.error)
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 card p-5 flex items-center gap-6 !bg-teal text-white">
        <ScanBarcode size={40} />
        <div className="flex-1">
          <div className="text-white/75 font-semibold">{t('Test scanner — scan anything now (any connected scanner)')}</div>
          <div className="text-3xl font-extrabold font-mono mt-1 animate-pop" key={last?.at.getTime()} data-testid="last-scan">
            {last?.code ?? t('Waiting for a scan…')}
          </div>
          {last && (
            <div className="text-sm text-white/75">
              {t('via {source} at {time}', { source: last.source, time: last.at.toLocaleTimeString(t.dateLocale) })}
            </div>
          )}
        </div>
        <Link to="/test-barcodes" className="btn bg-white/15 hover:bg-white/25 text-white">
          <BarcodeIcon size={18} /> {t('Test barcodes page')}
        </Link>
      </div>

      <fieldset disabled={!isAdmin} className="contents">
        <Section title={t('USB / Bluetooth keyboard-wedge')} icon={ScanBarcode} hint={t('Most scanners. They type the code like a keyboard and press Enter.')}>
          <Toggle label={t('Enabled')} checked={s.wedgeEnabled} onChange={(v) => set('wedgeEnabled', v)} disabled={!isAdmin} />
          <Field label={t('Max gap between characters: {ms} ms', { ms: s.wedgeMaxIntervalMs })} id="w-gap">
            <input id="w-gap" type="range" min={10} max={120} value={s.wedgeMaxIntervalMs} onChange={(e) => set('wedgeMaxIntervalMs', Number(e.target.value))} className="w-full accent-teal h-11" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('Min length')} id="w-min">
              <input id="w-min" className="field" inputMode="numeric" value={s.wedgeMinLength} onChange={(e) => set('wedgeMinLength', Math.max(1, num(e.target.value, 4)))} />
            </Field>
            <Field label={t('Strip prefix')} id="w-pre">
              <input id="w-pre" className="field font-mono" value={s.wedgePrefix} data-wedge="off" onChange={(e) => set('wedgePrefix', e.target.value)} />
            </Field>
            <Field label={t('Strip suffix')} id="w-suf">
              <input id="w-suf" className="field font-mono" value={s.wedgeSuffix} data-wedge="off" onChange={(e) => set('wedgeSuffix', e.target.value)} />
            </Field>
          </div>
          <Field label={t('Human typing check — type here normally; it must NOT show as a scan')} id="w-human">
            <input id="w-human" className="field" placeholder={t('Type slowly…')} />
          </Field>
        </Section>

        <Section title={t('Serial / COM-port scanner')} icon={Plug} hint={t('Scanners in USB virtual-COM (CDC) mode, or RS-232.')}>
          <div className="flex gap-2">
            <select className="field" value={s.serialPath} onChange={(e) => set('serialPath', e.target.value)} aria-label={t('COM port')}>
              <option value="">{t('Select a port…')}</option>
              {ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path} {p.manufacturer ? `· ${p.manufacturer}` : ''}
                </option>
              ))}
              {s.serialPath && !ports.some((p) => p.path === s.serialPath) && <option value={s.serialPath}>{s.serialPath} ({t('not present')})</option>}
            </select>
            <button className="btn-icon" onClick={refresh} aria-label={t('Refresh ports')} type="button">
              <RefreshCw size={18} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <select className="field px-2" value={s.serialBaud} onChange={(e) => set('serialBaud', Number(e.target.value))} aria-label={t('Baud rate')}>
              {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            <select className="field px-2" value={s.serialDataBits} onChange={(e) => set('serialDataBits', Number(e.target.value) as 7 | 8)} aria-label={t('Data bits')}>
              <option value={8}>{t('{n} bits', { n: 8 })}</option>
              <option value={7}>{t('{n} bits', { n: 7 })}</option>
            </select>
            <select className="field px-2" value={s.serialParity} onChange={(e) => set('serialParity', e.target.value as Settings['serialParity'])} aria-label={t('Parity')}>
              <option value="none">{t('No parity')}</option>
              <option value="even">{t('Even')}</option>
              <option value="odd">{t('Odd')}</option>
            </select>
            <select className="field px-2" value={s.serialTerminator} onChange={(e) => set('serialTerminator', e.target.value as Settings['serialTerminator'])} aria-label={t('Line terminator')}>
              <option value="CR">CR</option>
              <option value="LF">LF</option>
              <option value="CRLF">CR+LF</option>
            </select>
          </div>
          <Toggle label={t('Connect automatically at startup')} checked={s.serialEnabled} onChange={(v) => set('serialEnabled', v)} disabled={!isAdmin} />
          <div className="flex items-center gap-2">
            <button className="btn-teal" type="button" onClick={() => connect('serial', true)}>
              <PlugZap size={18} /> {t('Connect')}
            </button>
            <button className="btn-ghost" type="button" onClick={() => connect('serial', false)}>
              {t('Disconnect')}
            </button>
            <StatusLine s={hw.serial} />
          </div>
        </Section>

        <Section title={t('Raw USB HID scanner (advanced)')} icon={Plug} hint={t('Only for scanners in HID-POS mode. Keyboard-mode scanners are owned by the OS — use keyboard-wedge for those.')}>
          {hidErr ? (
            <p className="text-sm text-rose-600">{hidErr}</p>
          ) : (
            <div className="flex gap-2">
              <select className="field" value={s.hidPath} onChange={(e) => set('hidPath', e.target.value)} aria-label={t('HID device')}>
                <option value="">{t('Select a device…')}</option>
                {hids.map((h) => (
                  <option key={h.path} value={h.path}>
                    {h.product || t('Unknown')} · {h.manufacturer || ''} ({h.vendorId.toString(16).padStart(4, '0')}:{h.productId.toString(16).padStart(4, '0')})
                    {h.usagePage === 0x8c ? ' · POS' : h.usagePage === 1 && h.usage === 6 ? ` · ${t('keyboard')}` : ''}
                  </option>
                ))}
              </select>
              <button className="btn-icon" onClick={refresh} aria-label={t('Refresh devices')} type="button">
                <RefreshCw size={18} />
              </button>
            </div>
          )}
          <Toggle label={t('Connect automatically at startup')} checked={s.hidEnabled} onChange={(v) => set('hidEnabled', v)} disabled={!isAdmin} />
          <div className="flex items-center gap-2">
            <button className="btn-teal" type="button" onClick={() => connect('hid', true)} disabled={!!hidErr}>
              <PlugZap size={18} /> {t('Connect')}
            </button>
            <button className="btn-ghost" type="button" onClick={() => connect('hid', false)}>
              {t('Disconnect')}
            </button>
          </div>
          <StatusLine s={hw.hid} />
        </Section>
      </fieldset>

      <Section title={t('Camera scanning')} icon={Camera} hint={t('Laptop webcam, USB camera, or a phone connected as a webcam.')}>
        <select className="field" value={s.cameraDeviceId} onChange={(e) => set('cameraDeviceId', e.target.value)} aria-label={t('Camera device')}>
          <option value="">{t('Default camera')}</option>
          {cams.map((c, i) => (
            <option key={c.deviceId} value={c.deviceId}>
              {c.label || t('Camera {n}', { n: i + 1 })}
            </option>
          ))}
        </select>
        <Toggle label={t('Beep on scan')} checked={s.scanBeep} onChange={(v) => set('scanBeep', v)} />
        <button className="btn-teal" onClick={async () => (await save()) && setCamOpen(true)}>
          <Camera size={18} /> {t('Open camera test')}
        </button>
      </Section>
      {camOpen && <CameraScanner onClose={() => setCamOpen(false)} />}
    </div>
  )
}

// ---------- Printer ----------
function PrinterTab({ d: [s, set], save }: { d: Draft; save: () => Promise<boolean> }) {
  const t = useT()
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([])
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [busy, setBusy] = useState('')
  useEffect(() => {
    void api.print.printers().then((r) => r.ok && setPrinters(r.data))
    void api.hardware.serialList().then((r) => r.ok && setPorts(r.data))
  }, [])
  const act = async (name: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string): Promise<void> => {
    if (!(await save())) return
    setBusy(name)
    const r = await fn()
    setBusy('')
    if (r.ok) toast.ok(t(ok))
    else toast.err(r.error)
  }
  const pickLogo = async (f?: File): Promise<void> => {
    if (!f) return
    const bmp = await createImageBitmap(f)
    const c = document.createElement('canvas')
    const w = Math.min(384, bmp.width)
    c.width = w
    c.height = Math.round((bmp.height / bmp.width) * w)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    set('receiptLogo', c.toDataURL('image/png'))
  }
  const CONNS: { id: Settings['printerConnection']; label: string }[] = [
    { id: 'usb', label: tr('USB (ESC/POS)') },
    { id: 'network', label: tr('Network IP') },
    { id: 'serial', label: tr('Serial / COM') },
    { id: 'system', label: tr('System printer') }
  ]
  return (
    <div className="grid grid-cols-2 gap-4">
      <Section title={t('Receipt printer')} icon={Printer}>
        <div className="grid grid-cols-2 gap-2">
          {CONNS.map((c) => (
            <button key={c.id} onClick={() => set('printerConnection', c.id)} className={`chip justify-center rounded-xl ${s.printerConnection === c.id ? 'bg-teal text-white' : 'bg-bg'}`}>
              {t(c.label)}
            </button>
          ))}
        </div>
        {(s.printerConnection === 'usb' || s.printerConnection === 'system') && (
          <Field label={s.printerConnection === 'usb' ? t('Printer queue (raw ESC/POS is sent to it)') : t('Printer (leave empty to show the print dialog)')} id="p-name">
            <select id="p-name" className="field" value={s.printerName} onChange={(e) => set('printerName', e.target.value)}>
              <option value="">{s.printerConnection === 'system' ? t('Ask every time') : t('Select a printer…')}</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName}
                  {p.isDefault ? ` (${t('default')})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {s.printerConnection === 'network' && (
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Field label={t('IP address')} id="p-host">
              <input id="p-host" className="field font-mono" value={s.printerHost} onChange={(e) => set('printerHost', e.target.value.trim())} />
            </Field>
            <Field label={t('Port')} id="p-port">
              <input id="p-port" className="field font-mono" inputMode="numeric" value={s.printerPort} onChange={(e) => set('printerPort', Math.round(num(e.target.value, 9100)))} />
            </Field>
          </div>
        )}
        {s.printerConnection === 'serial' && (
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <select className="field" value={s.printerSerialPath} onChange={(e) => set('printerSerialPath', e.target.value)} aria-label={t('Printer COM port')}>
              <option value="">{t('Select a port…')}</option>
              {ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path} {p.manufacturer ?? ''}
                </option>
              ))}
            </select>
            <select className="field" value={s.printerBaud} onChange={(e) => set('printerBaud', Number(e.target.value))} aria-label={t('Printer baud')}>
              {[9600, 19200, 38400, 115200].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {([58, 80] as const).map((w) => (
            <button key={w} onClick={() => set('paperWidth', w)} className={`chip justify-center rounded-xl ${s.paperWidth === w ? 'bg-yellow' : 'bg-bg'}`}>
              {t('{w} mm paper', { w })}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn-teal flex-1" disabled={!!busy} onClick={() => act('test', () => api.print.test(), tr('Test receipt sent'))}>
            <Printer size={18} /> {busy === 'test' ? t('Printing…') : t('Print test receipt')}
          </button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => act('drawer', () => api.print.openDrawer(), tr('Drawer pulse sent'))}>
            <Inbox size={18} /> {t('Open drawer')}
          </button>
        </div>
      </Section>
      <Section title={t('Receipt & drawer')} icon={Inbox}>
        <Toggle label={t('Print receipt automatically after payment')} checked={s.autoPrint} onChange={(v) => set('autoPrint', v)} />
        <Toggle label={t('Open cash drawer after cash payments')} hint={t('Sends the ESC/POS kick pulse through the printer')} checked={s.drawerOnCash} onChange={(v) => set('drawerOnCash', v)} />
        <Field label={t('Code on receipt')}>
          <div className="grid grid-cols-3 gap-2">
            {(['none', 'barcode', 'qr'] as const).map((c) => (
              <button key={c} onClick={() => set('receiptCode', c)} className={`chip justify-center rounded-xl capitalize ${s.receiptCode === c ? 'bg-yellow' : 'bg-bg'}`}>
                {c === 'qr' ? 'QR' : c === 'none' ? t('None') : t('Barcode')}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('Logo (PNG, printed in black & white)')}>
          <div className="flex items-center gap-3">
            {s.receiptLogo ? <img src={s.receiptLogo} alt={t('Receipt logo')} className="h-14 rounded-lg border border-line" /> : <span className="text-sm text-muted">{t('No logo')}</span>}
            <label className="btn-ghost">
              <Upload size={18} /> {t('Choose')}
              <input type="file" accept="image/*" hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
            </label>
            {s.receiptLogo && (
              <button className="btn text-muted" onClick={() => set('receiptLogo', null)}>
                {t('Remove')}
              </button>
            )}
          </div>
        </Field>
      </Section>
    </div>
  )
}

// ---------- Promos ----------
function PromosTab() {
  const t = useT()
  const [list, setList] = useState<Promo[]>([])
  const [edit, setEdit] = useState<(Omit<Promo, 'id'> & { id?: number }) | null>(null)
  const [valueText, setValueText] = useState('')
  const load = useCallback(() => unwrap(api.promos.list()).then(setList).catch(toast.err), [])
  useEffect(() => void load(), [load])
  const open = (p?: Promo): void => {
    const e = p ?? { code: '', type: 'percent' as const, value: 10, active: true }
    setEdit(e)
    setValueText(e.type === 'percent' ? String(e.value) : (e.value / 100).toFixed(2))
  }
  const save = async (): Promise<void> => {
    if (!edit) return
    const v = parseFloat(valueText)
    if (!Number.isFinite(v) || v < 0) return toast.err(t('Enter a value'))
    const r = await api.promos.save({ ...edit, value: edit.type === 'percent' ? Math.round(v) : Math.round(v * 100) })
    if (!r.ok) return toast.err(r.error)
    setEdit(null)
    void load()
  }
  const remove = async (p: Promo): Promise<void> => {
    if (!(await confirmDialog({ title: t('Delete {name}?', { name: p.code }), message: t('Customers will no longer be able to use it.'), danger: true, confirmLabel: t('Delete') }))) return
    await api.promos.remove(p.id)
    void load()
  }
  return (
    <Section title={t('Promo codes')} icon={Tag} hint={t('Percent or fixed-amount discounts applied in the cart.')}>
      {list.map((p) => (
        <div key={p.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
          <span className="font-mono font-bold w-32">{p.code}</span>
          <span className="flex-1">{p.type === 'percent' ? t('{v}% off', { v: p.value }) : t('{v} off', { v: (p.value / 100).toFixed(2) })}</span>
          <span className={`text-sm font-semibold ${p.active ? 'text-emerald-600' : 'text-muted'}`}>{p.active ? t('Active') : t('Off')}</span>
          <button className="btn-icon" onClick={() => open(p)} aria-label={`${t('Edit')} ${p.code}`}>
            <Pencil size={16} />
          </button>
          <button className="btn-icon text-rose-500" onClick={() => remove(p)} aria-label={`${t('Delete')} ${p.code}`}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button className="btn-yellow self-start" onClick={() => open()}>
        <Plus size={18} /> {t('New promo')}
      </button>
      {edit && (
        <Modal title={edit.id ? t('Edit promo') : t('New promo')} onClose={() => setEdit(null)} width="max-w-md">
          <div className="flex flex-col gap-3">
            <Field label={t('Code')} id="pr-code">
              <input id="pr-code" className="field font-mono uppercase" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {(['percent', 'fixed'] as const).map((ty) => (
                <button key={ty} onClick={() => setEdit({ ...edit, type: ty })} className={`chip justify-center rounded-xl ${edit.type === ty ? 'bg-teal text-white' : 'bg-bg'}`}>
                  {ty === 'percent' ? t('Percent %') : t('Fixed amount')}
                </button>
              ))}
            </div>
            <Field label={edit.type === 'percent' ? t('Percent off') : t('Amount off')} id="pr-val">
              <input id="pr-val" className="field" inputMode="decimal" value={valueText} onChange={(e) => setValueText(e.target.value)} />
            </Field>
            <Toggle label={t('Active')} checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
            <button className="btn-teal" onClick={save} disabled={edit.code.length < 2}>
              {t('Save')}
            </button>
          </div>
        </Modal>
      )}
    </Section>
  )
}

// ---------- Users ----------
function UsersTab() {
  const t = useT()
  const me = useApp((s) => s.user)
  const [list, setList] = useState<User[]>([])
  const [edit, setEdit] = useState<{ id?: number; name: string; role: User['role']; pin: string } | null>(null)
  const load = useCallback(() => unwrap(api.auth.users()).then(setList).catch(toast.err), [])
  useEffect(() => void load(), [load])
  const save = async (): Promise<void> => {
    if (!edit) return
    const r = await api.users.save({ id: edit.id, name: edit.name.trim(), role: edit.role, pin: edit.pin || undefined })
    if (!r.ok) return toast.err(r.error)
    toast.ok(t('User saved'))
    setEdit(null)
    void load()
  }
  const remove = async (u: User): Promise<void> => {
    if (!(await confirmDialog({ title: t('Remove {name}?', { name: u.name }), message: t('They will no longer be able to sign in.'), danger: true, confirmLabel: t('Remove') }))) return
    const r = await api.users.remove(u.id)
    if (!r.ok) toast.err(r.error)
    void load()
  }
  const pinOk = edit && (edit.pin ? /^\d{4,8}$/.test(edit.pin) : !!edit.id)
  return (
    <Section title={t('Staff & PINs')} icon={Users} hint={t('Cashiers can sell; Admins can also manage products, settings and accounting.')}>
      {list.map((u) => (
        <div key={u.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
          <span className="w-10 h-10 rounded-full bg-teal text-white font-bold flex items-center justify-center">{u.name[0]}</span>
          <span className="flex-1 font-semibold">
            {u.name} {u.id === me?.id && <span className="text-xs text-muted">({t('you')})</span>}
          </span>
          <span className="text-sm text-muted w-20">{t(u.role === 'admin' ? 'Admin' : 'Cashier')}</span>
          <button className="btn-icon" onClick={() => setEdit({ ...u, pin: '' })} aria-label={`${t('Edit')} ${u.name}`}>
            <Pencil size={16} />
          </button>
          <button className="btn-icon text-rose-500" disabled={u.id === me?.id} onClick={() => remove(u)} aria-label={`${t('Remove')} ${u.name}`}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button className="btn-yellow self-start" onClick={() => setEdit({ name: '', role: 'cashier', pin: '' })}>
        <Plus size={18} /> {t('Add staff')}
      </button>
      {edit && (
        <Modal title={edit.id ? t('Edit staff') : t('New staff')} onClose={() => setEdit(null)} width="max-w-md">
          <div className="flex flex-col gap-3">
            <Field label={t('Name')} id="u-name">
              <input id="u-name" className="field" value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {(['cashier', 'admin'] as const).map((r) => (
                <button key={r} onClick={() => setEdit({ ...edit, role: r })} className={`chip justify-center rounded-xl capitalize ${edit.role === r ? 'bg-teal text-white' : 'bg-bg'}`}>
                  {t(r === 'admin' ? 'Admin' : 'Cashier')}
                </button>
              ))}
            </div>
            <Field label={edit.id ? t('New PIN (leave empty to keep)') : t('PIN (4-8 digits)')} id="u-pin">
              <input id="u-pin" className="field font-mono tracking-widest" type="password" inputMode="numeric" maxLength={8} value={edit.pin} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <button className="btn-teal" disabled={!edit.name.trim() || !pinOk} onClick={save}>
              {t('Save')}
            </button>
          </div>
        </Modal>
      )}
    </Section>
  )
}

// ---------- System ----------
function SystemTab({ d: [s, set] }: { d: Draft }) {
  const t = useT()
  const [backups, setBackups] = useState<{ name: string; size: number; date: string }[]>([])
  const [info, setInfo] = useState<{ version: string; dataDir: string } | null>(null)
  const load = useCallback(() => {
    void api.backup.list().then((r) => r.ok && setBackups(r.data))
    void api.win.info().then((r) => r.ok && setInfo(r.data))
  }, [])
  useEffect(load, [load])
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: string): Promise<void> => {
    const r = await fn()
    if (!r.ok) toast.err(r.error)
    else if (r.data) toast.ok(t(ok))
    load()
  }
  const clearOrders = async (): Promise<void> => {
    const yes = await confirmDialog({
      title: t('Delete all orders?'),
      message: t('Every order, payment record and Z report is removed, including the sample orders. Products, stock, users and settings stay. A backup is made first.'),
      danger: true,
      confirmLabel: t('Delete all orders')
    })
    if (!yes) return
    const r = await api.backup.clearOrders()
    if (!r.ok) return toast.err(r.error)
    toast.ok(t('{n} orders deleted', { n: r.data }))
    load()
  }
  const restore = async (): Promise<void> => {
    const yes = await confirmDialog({
      title: t('Restore a backup?'),
      message: t('All current data (products, orders, users, settings) will be replaced by the backup you pick. A safety backup of the current data is made first. The app restarts afterwards.'),
      danger: true,
      confirmLabel: t('Choose backup file')
    })
    if (yes) await run(() => api.backup.restore(), tr('Restoring…'))
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      <Section title={t('Station')} icon={Monitor}>
        <Toggle label={t('Kiosk mode')} hint={t('Fullscreen, no window controls. Only an Admin can leave it.')} checked={s.kiosk} onChange={(v) => set('kiosk', v)} />
        <Toggle label={t('Launch at startup')} hint={t('Start Cashier when the computer signs in (installed app only)')} checked={s.launchAtStartup} onChange={(v) => set('launchAtStartup', v)} />
        <Toggle label={t('Customer-facing display')} hint={t('Opens a second window on the second monitor')} checked={s.customerDisplay} onChange={(v) => set('customerDisplay', v)} />
        <Toggle label={t('Check for updates')} hint={t('Only when online; the app works fully offline')} checked={s.autoUpdate} onChange={(v) => set('autoUpdate', v)} />
        {info && (
          <div className="text-sm text-muted">
            {t('Version {v}', { v: info.version })} · {t('Data folder')}: <span className="font-mono select-text">{info.dataDir}</span>
          </div>
        )}
      </Section>
      <Section title={t('Backups')} icon={DatabaseBackup} hint={t('A backup runs at every start and on the schedule below. The last 20 are kept.')}>
        <Field label={t('Automatic backup every (hours, 0 = off)')} id="b-hours">
          <input id="b-hours" className="field w-32" inputMode="numeric" value={s.autoBackupHours} onChange={(e) => set('autoBackupHours', Math.max(0, Math.min(168, Math.round(num(e.target.value, 6)))))} />
        </Field>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-teal" onClick={() => run(() => api.backup.now(), tr('Backup created'))}>
            <Save size={18} /> {t('Backup now')}
          </button>
          <button className="btn-ghost" onClick={() => run(() => api.backup.exportFile(), tr('Backup saved'))}>
            {t('Save backup as…')}
          </button>
          <button className="btn-danger" onClick={restore}>
            {t('Restore…')}
          </button>
          <button className="btn-danger" onClick={clearOrders} data-testid="clear-orders">
            {t('Delete all orders')}
          </button>
        </div>
        <div className="max-h-48 overflow-auto text-sm">
          {backups.map((b) => (
            <div key={b.name} className="flex justify-between py-1 border-b border-line last:border-0">
              <span className="font-mono">{b.name}</span>
              <span className="text-muted">{(b.size / 1024).toFixed(0)} KB</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ---------- appearance ----------
/** Language and theme apply immediately (no Save needed) so the cashier sees the result. */
function AppearanceTab() {
  const t = useT()
  const s = useApp((st) => st.settings)
  const saveSettings = useApp((st) => st.saveSettings)
  const apply = (patch: Partial<Settings>): void => void saveSettings(patch).catch(toast.err)
  const THEMES = [
    { id: 'light', label: t('Light'), icon: Sun },
    { id: 'dark', label: t('Dark'), icon: Moon },
    { id: 'system', label: t('Same as Windows'), icon: Monitor }
  ] as const
  return (
    <div className="grid grid-cols-2 gap-4">
      <Section title={t('Language')} icon={Languages}>
        {LANGUAGES.map((l) => (
          <button key={l.id} onClick={() => apply({ language: l.id })} aria-pressed={s.language === l.id} data-testid={`lang-${l.id}`} className={`chip rounded-xl justify-start min-h-12 ${s.language === l.id ? 'bg-teal text-white' : 'bg-bg hover:bg-line'}`}>
            {l.label}
          </button>
        ))}
      </Section>
      <Section title={t('Theme')} icon={Palette}>
        {THEMES.map((th) => (
          <button key={th.id} onClick={() => apply({ theme: th.id })} aria-pressed={s.theme === th.id} data-testid={`theme-${th.id}`} className={`chip rounded-xl justify-start min-h-12 ${s.theme === th.id ? 'bg-teal text-white' : 'bg-bg hover:bg-line'}`}>
            <th.icon size={18} /> {th.label}
          </button>
        ))}
      </Section>
      <Section title={t('Performance')} icon={Gauge}>
        <Toggle
          label={t('Low-power mode')}
          hint={t('For older or slower PCs: turns off animations and blur, and makes camera scanning lighter.')}
          checked={s.lowPower}
          onChange={(v) => apply({ lowPower: v })}
        />
      </Section>
    </div>
  )
}

// ---------- page ----------
const TABS = [
  { id: 'general', label: tr('General'), icon: Store, admin: true },
  { id: 'scanner', label: tr('Scanner'), icon: ScanBarcode },
  { id: 'printer', label: tr('Printer & drawer'), icon: Printer, admin: true },
  { id: 'promos', label: tr('Promos'), icon: Tag, admin: true },
  { id: 'users', label: tr('Users'), icon: Users, admin: true },
  { id: 'tables', label: tr('Table map'), icon: Armchair, admin: true },
  { id: 'appearance', label: tr('Appearance'), icon: Palette },
  { id: 'system', label: tr('System & backup'), icon: DatabaseBackup, admin: true }
] as const

export function SettingsPage() {
  const t = useT()
  const isAdmin = useIsAdmin()
  const saved = useApp((s) => s.settings)
  const saveSettings = useApp((s) => s.saveSettings)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>(isAdmin ? 'general' : 'scanner')
  const [draft, setDraft] = useState(saved)
  // when saved settings change (e.g. language switched instantly), keep unsaved edits made elsewhere
  const prevSaved = useRef(saved)
  useEffect(() => {
    const before = prevSaved.current
    prevSaved.current = saved
    setDraft((d) => {
      const next = { ...saved }
      for (const k of Object.keys(d) as (keyof Settings)[]) if (d[k] !== before[k]) (next as Record<string, unknown>)[k] = d[k]
      return next
    })
  }, [saved])
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const set: Draft[1] = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async (): Promise<boolean> => {
    if (!dirty) return true
    // cashiers may only change their own station's camera + beep
    const patch: Partial<Settings> = isAdmin ? draft : { cameraDeviceId: draft.cameraDeviceId, scanBeep: draft.scanBeep, theme: draft.theme, language: draft.language }
    try {
      await saveSettings(patch)
      toast.ok(t('Settings saved'))
      return true
    } catch (e) {
      toast.err(e)
      return false
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <Greeting title={t('Settings')} />
      <div className="flex items-center gap-2">
        {TABS.filter((tb) => isAdmin || !('admin' in tb)).map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} className={`chip ${tab === tb.id ? 'bg-yellow text-on-yellow' : 'bg-surface hover:bg-surface/70'}`}>
            <tb.icon size={18} /> {t(tb.label)}
          </button>
        ))}
        <div className="flex-1" />
        {dirty && (
          <>
            <button className="btn-ghost bg-surface" onClick={() => setDraft(saved)}>
              {t('Discard')}
            </button>
            <button className="btn-teal animate-pop" onClick={save}>
              <Save size={18} /> {t('Save changes')}
            </button>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto pb-2">
        {tab === 'general' && <GeneralTab d={[draft, set]} />}
        {tab === 'scanner' && <ScannerTab d={[draft, set]} save={save} />}
        {tab === 'printer' && <PrinterTab d={[draft, set]} save={save} />}
        {tab === 'promos' && <PromosTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'system' && <SystemTab d={[draft, set]} />}
        {tab === 'tables' && <FloorEditor settings={draft} set={set} saveSettings={save} />}
        {tab === 'appearance' && <AppearanceTab />}
      </div>
    </div>
  )
}
