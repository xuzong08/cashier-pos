import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, ScanBarcode, Trash2, Video, X } from 'lucide-react'
import { parseMoney } from '@shared/cart'
import type { Product } from '@shared/types'
import { api, toThumbDataUrl, unwrap } from '@/lib/api'
import { beep } from '@/lib/beep'
import { useScanHandler } from '@/lib/scanBus'
import { useApp } from '@/store/app'
import { confirmDialog, toast } from '@/store/ui'
import { Modal } from './Modal'
import { ProductThumb } from './bits'
import { CameraScanner } from './CameraScanner'
import { useT } from '@/lib/i18n'

function WebcamPhoto({ onShot, onClose }: { onShot: (dataUrl: string) => void; onClose: () => void }) {
  const t = useT()
  const v = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 } }, audio: false })
      .then(async (s) => {
        stream = s
        if (v.current) {
          v.current.srcObject = s
          await v.current.play().catch(() => undefined)
        }
      })
      .catch((e: DOMException) => setErr(e.name === 'NotAllowedError' ? t('Camera permission denied.') : t('No camera available.')))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])
  return (
    <Modal title={t('Take a photo')} onClose={onClose} width="max-w-xl">
      {err ? (
        <p className="text-rose-600">{err}</p>
      ) : (
        <video ref={v} className="w-full aspect-square object-cover rounded-2xl bg-ink" muted playsInline />
      )}
      <button
        className="btn-teal w-full mt-4 min-h-12"
        disabled={!!err}
        onClick={async () => {
          if (!v.current) return
          onShot(await toThumbDataUrl(v.current))
          onClose()
        }}
      >
        <Camera size={18} /> {t('Capture')}
      </button>
    </Modal>
  )
}

interface Props {
  product?: Product
  barcode?: string
  onClose: (saved?: Product) => void
}

export function ProductForm({ product, barcode, onClose }: Props) {
  const t = useT()
  const categories = useApp((s) => s.categories)
  const loadCatalog = useApp((s) => s.loadCatalog)
  const [f, setF] = useState({
    name: product?.name ?? '',
    price: product ? (product.price / 100).toFixed(2) : '',
    categoryId: product?.categoryId ?? categories[0]?.id ?? 1,
    emoji: product?.emoji ?? '🍽️',
    stock: String(product?.stock ?? 20),
    lowStock: String(product?.lowStock ?? 5),
    barcode: product?.barcode ?? barcode ?? '',
    availableAt: product?.availableAt ?? '',
    photo: product?.photo ?? null
  })
  const [listening, setListening] = useState(false)
  const [cam, setCam] = useState<'scan' | 'photo' | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]): void => setF((x) => ({ ...x, [k]: v }))

  // "Scan to fill": while armed, the next scan from any scanner fills the field instead of the cart
  useScanHandler((code) => {
    set('barcode', code)
    setListening(false)
    beep()
    toast.ok(t('Barcode {code} captured', { code }))
  }, listening)

  const price = parseMoney(f.price)
  const stock = parseInt(f.stock, 10)
  const low = parseInt(f.lowStock, 10)
  const valid = f.name.trim() && Number.isFinite(price) && Number.isFinite(stock) && Number.isFinite(low)

  const save = async (): Promise<void> => {
    if (!valid) return
    setBusy(true)
    try {
      const saved = await unwrap(
        api.products.save({
          id: product?.id,
          name: f.name.trim(),
          price,
          categoryId: f.categoryId,
          emoji: f.emoji.trim() || '🍽️',
          stock,
          lowStock: low,
          barcode: f.barcode.trim() || null,
          availableAt: f.availableAt.trim() || null,
          photo: f.photo
        })
      )
      await loadCatalog()
      toast.ok(product ? t('Product updated') : t('Product added'))
      onClose(saved)
    } catch (e) {
      toast.err(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!product) return
    if (!(await confirmDialog({ title: t('Delete {name}?', { name: product.name }), message: t('It disappears from the menu. Past orders keep their history.'), danger: true, confirmLabel: t('Delete') }))) return
    const r = await api.products.remove(product.id)
    if (!r.ok) return toast.err(r.error)
    await loadCatalog()
    toast.ok(t('Product deleted'))
    onClose()
  }

  const pickFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.err(t('Pick an image file'))
    set('photo', await toThumbDataUrl(file))
  }

  return (
    <Modal title={product ? t('Edit product') : t('New product')} onClose={() => onClose()} width="max-w-2xl">
      <div className="grid grid-cols-[auto_1fr] gap-6">
        <div className="flex flex-col gap-2 w-36">
          <ProductThumb p={{ photo: f.photo, emoji: f.emoji, name: f.name }} size="lg" />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          <button className="btn-ghost text-sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} /> {t('Photo')}
          </button>
          <button className="btn-ghost text-sm" onClick={() => setCam('photo')}>
            <Video size={16} /> {t('Webcam')}
          </button>
          {f.photo && (
            <button className="btn text-sm text-muted" onClick={() => set('photo', null)}>
              <X size={16} /> {t('Remove')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor="pf-name">
              {t('Name')}
            </label>
            <input id="pf-name" className="field" value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="pf-price">
              {t('Price')}
            </label>
            <input id="pf-price" className="field" inputMode="decimal" placeholder="0.00" value={f.price} onChange={(e) => set('price', e.target.value)} />
            {f.price && !Number.isFinite(price) && <span className="text-xs text-rose-500">{t('Use a number like 3.50')}</span>}
          </div>
          <div>
            <label className="label" htmlFor="pf-cat">
              {t('Category')}
            </label>
            <select id="pf-cat" className="field" value={f.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pf-stock">
              {t('Stock')}
            </label>
            <input id="pf-stock" className="field" inputMode="numeric" value={f.stock} onChange={(e) => set('stock', e.target.value.replace(/[^\d-]/g, ''))} />
          </div>
          <div>
            <label className="label" htmlFor="pf-low">
              {t('Low-stock warning at')}
            </label>
            <input id="pf-low" className="field" inputMode="numeric" value={f.lowStock} onChange={(e) => set('lowStock', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="pf-barcode">
              {t('Barcode')}
            </label>
            <div className="flex gap-2">
              <input
                id="pf-barcode"
                data-wedge="off"
                className={`field font-mono ${listening ? 'ring-2 ring-yellow' : ''}`}
                value={f.barcode}
                maxLength={64}
                placeholder={listening ? t('Scan now with any scanner…') : 'EAN-13, UPC, Code 128…'}
                onChange={(e) => set('barcode', e.target.value.trim())}
              />
              <button className={listening ? 'btn-yellow' : 'btn-ghost'} onClick={() => setListening((l) => !l)} title={t('Next scan from any scanner fills this field')}>
                <ScanBarcode size={18} /> {listening ? t('Listening…') : t('Scan to fill')}
              </button>
              <button className="btn-icon" onClick={() => setCam('scan')} title={t('Use camera')} aria-label={t('Scan with camera')}>
                <Camera size={18} />
              </button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pf-emoji">
              {t('Emoji (when no photo)')}
            </label>
            <input id="pf-emoji" className="field" value={f.emoji} maxLength={8} onChange={(e) => set('emoji', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pf-avail">
              {t('Available at (when out)')}
            </label>
            <input id="pf-avail" className="field" value={f.availableAt} maxLength={40} placeholder={t('e.g. 15:00')} onChange={(e) => set('availableAt', e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        {product && (
          <button className="btn-danger" onClick={remove}>
            <Trash2 size={18} /> {t('Delete')}
          </button>
        )}
        <div className="flex-1" />
        <button className="btn-ghost" onClick={() => onClose()}>
          {t('Cancel')}
        </button>
        <button className="btn-teal min-w-32" disabled={!valid || busy} onClick={save}>
          {busy ? t('Saving…') : t('Save')}
        </button>
      </div>
      {cam === 'photo' && <WebcamPhoto onShot={(d) => set('photo', d)} onClose={() => setCam(null)} />}
      {cam === 'scan' && <CameraScanner onCode={(c) => set('barcode', c)} onClose={() => setCam(null)} />}
    </Modal>
  )
}
