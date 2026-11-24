import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Hand,
  LayoutGrid,
  Menu as MenuIcon,
  ScanBarcode,
  Search,
  SearchX,
  Usb,
  Trash2
} from 'lucide-react'
import type { Order, PaymentMethod, Product } from '@shared/types'
import { api, fmtTime, unwrap } from '@/lib/api'
import { dispatchScan } from '@/lib/scanBus'
import { useApp, useMoney } from '@/store/app'
import { useCart } from '@/store/cart'
import { confirmDialog, toast, useUi } from '@/store/ui'
import { CategoryTag, ProductThumb, StatusPill, categoryIcon } from '@/components/bits'
import { useT } from '@/lib/i18n'
import { CartPanel } from '@/components/CartPanel'
import { CameraScanner } from '@/components/CameraScanner'
import { PaymentDialog } from '@/components/PaymentDialog'
import { Modal } from '@/components/Modal'
import { Empty } from '@/components/Overlays'

function Clock() {
  const t = useT()
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="leading-tight">
      <div className="text-sm text-muted font-semibold">{now.toLocaleDateString(t.dateLocale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
      <div className="font-extrabold tabular-nums">{now.toLocaleTimeString(t.dateLocale)}</div>
    </div>
  )
}

function HardwareBadge() {
  const t = useT()
  const hw = useApp((s) => s.hardware)
  const items = [
    ['COM', hw.serial],
    ['HID', hw.hid]
  ] as const
  const shown = items.filter(([, s]) => s.state !== 'off')
  if (!shown.length) return null
  return (
    <div className="flex gap-2">
      {shown.map(([name, s]) => (
        <span
          key={name}
          title={s.message}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            s.state === 'connected' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : s.state === 'connecting' ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-rose-50 dark:bg-rose-500/15 text-rose-600'
          }`}
        >
          <Usb size={14} /> {name} {s.state === 'connected' ? t('ready') : t(s.state)}
        </span>
      ))}
    </div>
  )
}

function ProductCard({ p, onAdd, inCart }: { p: Product; onAdd: () => void; inCart: number }) {
  const t = useT()
  const money = useMoney()
  const cat = useApp((s) => s.categories.find((c) => c.id === p.categoryId))
  const out = p.stock <= 0
  const low = !out && p.stock <= p.lowStock
  const [bump, setBump] = useState(0)
  return (
    <button
      key={bump}
      disabled={out}
      onClick={() => {
        onAdd()
        setBump((b) => b + 1)
      }}
      className={`card p-3 text-left flex flex-col gap-2 transition hover:shadow-[var(--shadow-lift)] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed relative ${bump ? 'animate-pop' : 'animate-slide-in'}`}
      data-testid="product-card"
      aria-label={t('Add {name}', { name: p.name })}
    >
      <div className="relative">
        <ProductThumb p={p} />
        {out && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-surface/70 font-extrabold text-rose-500">{t('Out of Stock')}</span>}
        {inCart > 0 && (
          <span className="absolute top-2 right-2 min-w-7 h-7 px-2 rounded-full bg-teal text-white text-sm font-bold flex items-center justify-center animate-pop">{inCart}</span>
        )}
      </div>
      <div className="font-bold leading-snug line-clamp-2 min-h-[2.6em]">{p.name}</div>
      <div className="flex items-end justify-between gap-2 mt-auto">
        <div className="flex flex-col items-start gap-1">
          <CategoryTag cat={cat} />
          {low && <span className="text-[11px] font-semibold text-amber-600">{t('Only {n} left', { n: p.stock })}</span>}
        </div>
        <span className="text-lg font-extrabold">{money(p.price)}</span>
      </div>
    </button>
  )
}

function HeldOrders({ onClose }: { onClose: () => void }) {
  const t = useT()
  const money = useMoney()
  const loadHeld = useCart((s) => s.loadHeld)
  const hasCart = useCart((s) => s.lines.length > 0)
  const [list, setList] = useState<Order[] | null>(null)
  const load = useCallback(() => unwrap(api.orders.list({ status: 'held' })).then(setList).catch(toast.err), [])
  useEffect(() => void load(), [load])
  const resume = async (o: Order): Promise<void> => {
    if (hasCart && !(await confirmDialog({ title: t('Replace cart?'), message: t('The current cart will be discarded to resume this order.'), confirmLabel: t('Resume') }))) return
    loadHeld(o)
    toast.ok(t('Resumed {number}', { number: o.number }))
    onClose()
  }
  const drop = async (o: Order): Promise<void> => {
    if (!(await confirmDialog({ title: t('Delete held order?'), message: t('{number} will be removed.', { number: o.number }), danger: true, confirmLabel: t('Delete') }))) return
    await api.orders.deleteHeld(o.id)
    void load()
  }
  return (
    <Modal title={t('Held orders')} onClose={onClose} width="max-w-xl">
      {list === null ? null : list.length === 0 ? (
        <Empty icon={Hand} title={t('No held orders')} hint={t('Press F8 or Hold to park an order.')} />
      ) : (
        list.map((o) => (
          <div key={o.id} className="flex items-center gap-3 py-3 border-b border-line last:border-0">
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {o.customer || t('Walk-in')} {o.tableNo && <span className="text-muted">· {o.tableNo}</span>}
              </div>
              <div className="text-sm text-muted">
                {t('{n} items', { n: o.items.reduce((s, i) => s + i.qty, 0) })} · {money(o.total)} · {fmtTime(o.createdAt)}
              </div>
            </div>
            <button className="btn-icon text-rose-500" onClick={() => drop(o)} aria-label={t('Delete held order')}>
              <Trash2 size={18} />
            </button>
            <button className="btn-teal" onClick={() => resume(o)}>
              {t('Resume')}
            </button>
          </div>
        ))
      )}
    </Modal>
  )
}

export function Pos() {
  const t = useT()
  const nav = useNavigate()
  const products = useApp((s) => s.products)
  const categories = useApp((s) => s.categories)
  const lines = useCart((s) => s.lines)
  const add = useCart((s) => s.add)
  const [cat, setCat] = useState<number | 'all'>('all')
  const [q, setQ] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paying, setPaying] = useState(false)
  const [camera, setCamera] = useState(false)
  const [held, setHeld] = useState(false)
  const [heldCount, setHeldCount] = useState(0)
  const [track, setTrack] = useState<Order[]>([])

  const refreshSide = useCallback(async () => {
    const [h, a] = await Promise.all([api.orders.list({ status: 'held' }), api.orders.list({ status: 'active', limit: 12 })])
    if (h.ok) setHeldCount(h.data.length)
    if (a.ok) setTrack(a.data)
  }, [])
  useEffect(() => {
    void refreshSide()
    const t = setInterval(refreshSide, 15000)
    return () => clearInterval(t)
  }, [refreshSide])

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase()
    return products.filter((p) => (cat === 'all' || p.categoryId === cat) && (!s || p.name.toLowerCase().includes(s) || p.barcode?.includes(s)))
  }, [products, cat, q])

  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of products) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1)
    return m
  }, [products])

  const qtyOf = (id: number): number => lines.find((l) => l.productId === id)?.qty ?? 0

  const addProduct = (p: Product): void => {
    if (add(p) === 'no-stock') toast.err(t('Only {n} × {name} in stock', { n: p.stock, name: p.name }))
  }

  const hold = useCallback(async () => {
    const c = useCart.getState()
    if (!c.lines.length) return
    const r = await api.orders.place({
      lines: c.lines.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note })),
      tableNo: c.tableNo || undefined,
      orderType: c.orderType,
      customer: c.customer || undefined,
      promoCode: c.promo?.code,
      heldOrderId: c.heldOrderId ?? undefined,
      hold: true
    })
    if (!r.ok) return toast.err(r.error)
    c.clear()
    toast.ok(t('Order held as {number}', { number: r.data.number }))
    void refreshSide()
  }, [refreshSide])

  useEffect(() => {
    const pay = (): void => {
      if (useUi.getState().modals === 0 && useCart.getState().lines.length) setPaying(true)
    }
    const onHold = (): void => {
      if (useUi.getState().modals === 0) void hold()
    }
    window.addEventListener('bp:pay', pay)
    window.addEventListener('bp:hold', onHold)
    return () => {
      window.removeEventListener('bp:pay', pay)
      window.removeEventListener('bp:hold', onHold)
    }
  }, [hold])

  const onSearchEnter = (): void => {
    const code = q.trim()
    if (!code) return
    // a typed barcode adds directly; a single text match adds that product
    if (/^\d{4,}$/.test(code)) {
      dispatchScan(code, 'manual')
      setQ('')
    } else if (visible.length === 1 && visible[0].stock > 0) {
      addProduct(visible[0])
      setQ('')
    }
  }

  return (
    <div className="h-full flex gap-4 min-h-0">
      <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        <div className="card px-4 py-2.5 flex items-center gap-4">
          <button className="btn-icon" onClick={() => nav('/')} title={t('Back to dashboard')} aria-label={t('Back to dashboard')}>
            <MenuIcon size={20} />
          </button>
          <Clock />
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {t('Open Order')}
          </span>
          <div className="flex-1" />
          <HardwareBadge />
          <button className="btn-ghost" onClick={() => setHeld(true)}>
            <Hand size={18} /> {t('Held')} {heldCount > 0 && <span className="bg-yellow text-on-yellow rounded-full px-2 text-sm">{heldCount}</span>}
          </button>
          <button className="btn-teal" onClick={() => setCamera(true)} data-testid="scan-button">
            <ScanBarcode size={20} /> {t('Scan')}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 shrink-0" role="tablist">
          {[{ id: 'all' as const, name: t('All Menu'), icon: 'all', count: products.length }, ...categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, count: counts.get(c.id) ?? 0 }))].map((c) => {
            const I = c.icon === 'all' ? LayoutGrid : categoryIcon(c.icon)
            const on = cat === c.id
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={on}
                onClick={() => setCat(c.id)}
                className={`flex items-center gap-2.5 min-h-14 pl-2 pr-4 rounded-2xl font-semibold whitespace-nowrap transition active:scale-[0.97] ${on ? 'bg-teal text-white shadow' : 'bg-surface hover:bg-surface/70'}`}
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${on ? 'bg-white/15' : 'bg-bg text-teal'}`}>
                  <I size={20} />
                </span>
                <span className="text-left leading-tight">
                  {c.name}
                  <span className={`block text-xs ${on ? 'text-white/75' : 'text-muted'}`}>{t('{n} items', { n: c.count })}</span>
                </span>
              </button>
            )
          })}
        </div>

        <label className="relative block shrink-0">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="pos-search"
            className="field bg-surface min-h-12 pl-12"
            placeholder={t('Search something sweet on your mind... (or type a barcode + Enter)')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
            data-testid="pos-search"
          />
          <kbd className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted bg-bg rounded px-1.5 py-0.5">F2</kbd>
        </label>

        <div className="flex-1 overflow-auto min-h-0 -mx-1 px-1 pb-1">
          {visible.length === 0 ? (
            <Empty icon={SearchX} title={t('Nothing matches')} hint={q ? t('No product named “{q}”.', { q }) : t('This category is empty.')} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(clamp(150px,12vw,200px),1fr))] gap-3">
              {visible.map((p) => (
                <ProductCard key={p.id} p={p} inCart={qtyOf(p.id)} onAdd={() => addProduct(p)} />
              ))}
            </div>
          )}
        </div>

        <div className="card px-4 py-2 flex items-center gap-3 shrink-0 overflow-hidden">
          <span className="font-bold whitespace-nowrap">{t('Track Order')}</span>
          <div className="flex gap-2 overflow-x-auto">
            {track.length === 0 ? (
              <span className="text-sm text-muted">{t('No orders in the kitchen')}</span>
            ) : (
              track.map((o) => (
                <div key={o.id} className="flex items-center gap-3 bg-bg rounded-xl pl-3 pr-2 py-1 whitespace-nowrap">
                  <span className="font-semibold">
                    {o.customer || t('Walk-in')} <span className="text-muted text-sm">{o.tableNo}</span>
                  </span>
                  <StatusPill status={o.status} paid={o.paid} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <CartPanel method={method} onMethod={setMethod} onPlace={() => setPaying(true)} onHold={hold} />

      {paying && (
        <PaymentDialog
          initialMethod={method}
          onClose={() => {
            setPaying(false)
            void refreshSide()
          }}
        />
      )}
      {camera && <CameraScanner onClose={() => setCamera(false)} />}
      {held && (
        <HeldOrders
          onClose={() => {
            setHeld(false)
            void refreshSide()
          }}
        />
      )}
    </div>
  )
}
