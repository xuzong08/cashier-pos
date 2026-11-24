import { useEffect, useState } from 'react'
import { tr } from '@shared/i18n'
import { useT } from '@/lib/i18n'
import { Banknote, CreditCard, Hand, Minus, Pencil, Plus, QrCode, ShoppingBag, ShoppingBasket, Tag, Trash2, Utensils, X } from 'lucide-react'
import type { CartLine, PaymentMethod } from '@shared/types'
import { api, unwrap } from '@/lib/api'
import { useApp, useMoney } from '@/store/app'
import { useCart, useTotals } from '@/store/cart'
import { confirmDialog, toast } from '@/store/ui'
import { ProductThumb } from './bits'
import { Modal } from './Modal'
import { Empty } from './Overlays'

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: tr('Cash'), icon: Banknote },
  { id: 'card', label: tr('Card'), icon: CreditCard },
  { id: 'qr', label: tr('QR'), icon: QrCode }
]

function EditLine({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const t = useT()
  const { setQty, setNote, remove } = useCart()
  const stock = useApp((s) => s.products.find((p) => p.id === line.productId)?.stock ?? Infinity)
  const [qty, setQ] = useState(line.qty)
  const [note, setN] = useState(line.note ?? '')
  return (
    <Modal title={line.name} onClose={onClose} width="max-w-md">
      <label className="label">{t('Quantity')}</label>
      <div className="flex items-center gap-3 mb-4">
        <button className="btn-icon" onClick={() => setQ((q) => Math.max(1, q - 1))} aria-label={t('Less')}>
          <Minus size={18} />
        </button>
        <input className="field text-center text-xl font-bold w-24" inputMode="numeric" value={qty} onChange={(e) => setQ(Math.max(1, parseInt(e.target.value, 10) || 1))} />
        <button className="btn-icon" onClick={() => setQ((q) => Math.min(stock, q + 1))} aria-label={t('More')}>
          <Plus size={18} />
        </button>
        <span className="text-sm text-muted">{Number.isFinite(stock) ? t('{n} in stock', { n: stock }) : ''}</span>
      </div>
      <label className="label" htmlFor="line-note">
        {t('Note for the kitchen')}
      </label>
      <input id="line-note" className="field mb-6" value={note} maxLength={120} placeholder={t('e.g. no sugar, warm it up')} onChange={(e) => setN(e.target.value)} />
      <div className="flex gap-3">
        <button
          className="btn-danger"
          onClick={() => {
            remove(line.productId)
            onClose()
          }}
        >
          <Trash2 size={18} /> {t('Void item')}
        </button>
        <button
          className="btn-teal flex-1"
          disabled={qty > stock}
          onClick={() => {
            setQty(line.productId, qty)
            setNote(line.productId, note)
            onClose()
          }}
        >
          {t('Save')}
        </button>
      </div>
    </Modal>
  )
}

interface Props {
  method: PaymentMethod
  onMethod: (m: PaymentMethod) => void
  onPlace: () => void
  onHold: () => void
}

export function CartPanel({ method, onMethod, onPlace, onHold }: Props) {
  const money = useMoney()
  const cart = useCart()
  const totals = useTotals()
  const taxRate = useApp((s) => s.settings.taxRate)
  const products = useApp((s) => s.products)
  const [editing, setEditing] = useState<CartLine | null>(null)
  const [promoText, setPromoText] = useState('')
  const t = useT()
  const [tables, setTables] = useState<string[]>([])
  useEffect(() => void api.tables.list().then((r) => r.ok && setTables(r.data.map((x) => x.name))), [])

  const applyPromo = async (): Promise<void> => {
    if (!promoText.trim()) return
    try {
      const p = await unwrap(api.promos.find(promoText))
      if (!p) return toast.err(t('Promo code is not valid'))
      cart.setPromo(p)
      setPromoText('')
      toast.ok(t('Promo {code} applied', { code: p.code }))
    } catch (e) {
      toast.err(e)
    }
  }

  const clear = async (): Promise<void> => {
    if (await confirmDialog({ title: t('Clear cart?'), message: t('All items in this order will be removed.'), confirmLabel: t('Clear cart'), danger: true })) cart.clear()
  }

  const inc = (l: CartLine): void => {
    const p = products.find((x) => x.id === l.productId)
    if (p && l.qty + 1 > p.stock) return toast.err(t('Only {n} × {name} in stock', { n: p.stock, name: p.name }))
    cart.setQty(l.productId, l.qty + 1)
  }

  return (
    <aside className="card w-[clamp(330px,27vw,420px)] shrink-0 flex flex-col min-h-0 overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{cart.heldOrderId ? t('Resumed order') : t('Current Order')}</h2>
          <button className="btn min-h-10 px-3 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15" onClick={clear} disabled={!cart.lines.length}>
            <Trash2 size={16} /> {t('Clear')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 mt-3 p-1 rounded-xl bg-bg" role="radiogroup" aria-label={t('Order type')}>
          {(
            [
              ['dine_in', Utensils, t('Dine in')],
              ['takeaway', ShoppingBag, t('Take away')]
            ] as const
          ).map(([id, I, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={cart.orderType === id}
              data-testid={`type-${id}`}
              onClick={() => cart.setMeta(id === 'takeaway' ? { orderType: id, tableNo: '' } : { orderType: id })}
              className={`flex items-center justify-center gap-2 min-h-11 rounded-lg font-semibold transition ${cart.orderType === id ? 'bg-surface shadow-sm text-ink' : 'text-muted'}`}
            >
              <I size={17} /> {label}
            </button>
          ))}
        </div>
        <div className={`grid ${cart.orderType === 'takeaway' ? 'grid-cols-1' : 'grid-cols-[90px_1fr]'} gap-2 mt-2`}>
          {cart.orderType === 'dine_in' && <input
            className="field font-bold text-center"
            placeholder={t('Table')}
            list="cart-tables"
            maxLength={10}
            value={cart.tableNo}
            onChange={(e) => cart.setMeta({ tableNo: e.target.value.toUpperCase() })}
            aria-label={t('Table number')}
          />}
          <datalist id="cart-tables">
            {tables.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <input className="field" placeholder={t('Customer name')} maxLength={60} value={cart.customer} onChange={(e) => cart.setMeta({ customer: e.target.value })} aria-label={t('Customer name')} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5" data-testid="cart-lines">
        {cart.lines.length === 0 ? (
          <Empty icon={ShoppingBasket} title={t('Cart is empty')} hint={t('Tap a product or scan a barcode.')} />
        ) : (
          cart.lines.map((l) => {
            const p = products.find((x) => x.id === l.productId)
            const fresh = cart.lastAdded?.productId === l.productId && Date.now() - cart.lastAdded.at < 600
            return (
              <div key={l.productId} className={`flex items-center gap-3 py-2.5 border-b border-line last:border-0 ${fresh ? 'animate-pop' : 'animate-slide-in'}`} data-testid="cart-line">
                <ProductThumb p={p ?? { photo: null, emoji: '🍽️', name: l.name }} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{l.name}</div>
                  {l.note && <div className="text-xs text-muted truncate">“{l.note}”</div>}
                  <div className="text-sm font-bold text-teal">{money(l.price * l.qty)}</div>
                </div>
                <div className="flex items-center bg-bg rounded-xl">
                  <button className="w-10 h-11 flex items-center justify-center active:scale-90 transition" onClick={() => cart.setQty(l.productId, l.qty - 1)} aria-label={`${t('Less')} ${l.name}`}>
                    <Minus size={16} />
                  </button>
                  <span className="w-7 text-center font-bold" data-testid="line-qty">
                    {l.qty}
                  </span>
                  <button className="w-10 h-11 flex items-center justify-center active:scale-90 transition" onClick={() => inc(l)} aria-label={`${t('More')} ${l.name}`}>
                    <Plus size={16} />
                  </button>
                </div>
                <button className="btn-icon w-10 min-h-10 bg-transparent" onClick={() => setEditing(l)} aria-label={`${t('Edit')} ${l.name}`}>
                  <Pencil size={16} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="bg-bg pt-2">
        <div className="torn-edge rotate-180" />
        <div className="bg-surface px-5 pb-5 pt-2">
          {cart.promo ? (
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-3 py-1 text-sm font-semibold animate-pop">
                <Tag size={14} /> {t('Promo Applied')} · {cart.promo.code}
              </span>
              <button className="btn min-h-9 px-2 text-muted" onClick={() => cart.setPromo(null)} aria-label={t('Remove promo')}>
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mb-2">
              <input
                className="field min-h-10 uppercase"
                placeholder={t('Promo code')}
                value={promoText}
                maxLength={30}
                onChange={(e) => setPromoText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void applyPromo()}
              />
              <button className="btn-ghost min-h-10" onClick={applyPromo} disabled={!promoText.trim()}>
                {t('Apply')}
              </button>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">{t('Subtotal')}</dt>
            <dd className="text-right font-semibold">{money(totals.subtotal)}</dd>
            <dt className="text-muted">{t('Tax ({rate}%)', { rate: taxRate })}</dt>
            <dd className="text-right font-semibold">{money(totals.tax)}</dd>
            <dt className="text-muted">{t('Discount')}</dt>
            <dd className="text-right font-semibold text-emerald-600">{totals.discount ? `-${money(totals.discount)}` : money(0)}</dd>
          </dl>
          <div className="dashed-sep my-3" />
          <div className="flex justify-between items-baseline">
            <span className="font-extrabold">{t('TOTAL')}</span>
            <span className="text-2xl font-extrabold" data-testid="cart-total">
              {money(totals.total)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {METHODS.map((m) => (
              <button key={m.id} onClick={() => onMethod(m.id)} className={`chip justify-center rounded-xl text-sm ${method === m.id ? 'bg-teal text-white' : 'bg-bg hover:bg-line'}`} aria-pressed={method === m.id}>
                <m.icon size={17} />
                {t(m.label)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2 mt-3">
            <button className="btn-ghost min-h-14" onClick={onHold} disabled={!cart.lines.length} title={`${t('Hold order')} (F8)`}>
              <Hand size={18} /> {t('Hold')}
            </button>
            <button className="btn-yellow min-h-14 text-lg" onClick={onPlace} disabled={!cart.lines.length} data-testid="place-order" title={`${t('Place Order')} (F4)`}>
              {t('Place Order')}
            </button>
          </div>
        </div>
      </div>
      {editing && <EditLine line={editing} onClose={() => setEditing(null)} />}
    </aside>
  )
}
