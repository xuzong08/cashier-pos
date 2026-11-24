import { useMemo, useState } from 'react'
import { tr } from '@shared/i18n'
import { useT } from '@/lib/i18n'
import { Banknote, CheckCircle2, ChefHat, CreditCard, Delete, FileDown, Inbox, Plus, Printer, QrCode } from 'lucide-react'
import { computeChange, computeTotals, parseMoney, quickAmounts } from '@shared/cart'
import type { Order, PaymentMethod } from '@shared/types'
import { api, fmtDateTime, unwrap } from '@/lib/api'
import { useApp, useMoney } from '@/store/app'
import { useCart } from '@/store/cart'
import { toast } from '@/store/ui'
import { Modal } from './Modal'

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: tr('Cash'), icon: Banknote },
  { id: 'card', label: tr('Card'), icon: CreditCard },
  { id: 'qr', label: tr('QR'), icon: QrCode }
]

interface Props {
  /** pay an existing unpaid order; omit to place the current cart */
  order?: Order
  initialMethod?: PaymentMethod
  onClose: () => void
}

export function PaymentDialog({ order, initialMethod = 'cash', onClose }: Props) {
  const t = useT()
  const money = useMoney()
  const taxRate = useApp((s) => s.settings.taxRate)
  const loadCatalog = useApp((s) => s.loadCatalog)
  const paymentQr = useApp((s) => s.settings.paymentQr)
  const cart = useCart()
  const total = useMemo(() => order?.total ?? computeTotals(cart.lines, taxRate, cart.promo).total, [order, cart.lines, cart.promo, taxRate])

  const [method, setMethod] = useState<PaymentMethod>(initialMethod)
  const [cashText, setCashText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Order | null>(null)

  const tendered = cashText ? parseMoney(cashText) : NaN
  const enough = method !== 'cash' || (Number.isFinite(tendered) && tendered >= total)
  const change = method === 'cash' && Number.isFinite(tendered) ? computeChange(total, tendered) : 0

  const key = (k: string): void => {
    setCashText((t) => {
      if (k === 'del') return t.slice(0, -1)
      if (k === '.' && t.includes('.')) return t
      const next = t + k
      return /^\d{0,7}(\.\d{0,2})?$/.test(next) ? next : t
    })
  }

  const place = async (pay: boolean): Promise<void> => {
    setBusy(true)
    try {
      const payment = pay ? { method, tendered: method === 'cash' ? tendered : undefined } : undefined
      let o: Order
      if (order) o = await unwrap(api.orders.pay({ orderId: order.id, method, tendered: payment?.tendered }))
      else {
        o = await unwrap(
          api.orders.place({
            lines: cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note })),
            tableNo: cart.tableNo || undefined,
            orderType: cart.orderType,
            customer: cart.customer || undefined,
            promoCode: cart.promo?.code,
            heldOrderId: cart.heldOrderId ?? undefined,
            payment
          })
        )
        cart.clear()
        void loadCatalog()
      }
      if (!pay) {
        toast.ok(t('Order {number} sent to the kitchen', { number: o.number }))
        onClose()
        return
      }
      setDone(o)
    } catch (e) {
      toast.err(e)
    } finally {
      setBusy(false)
    }
  }

  if (done) return <ReceiptView order={done} onClose={onClose} />

  return (
    <Modal title={order ? t('Pay {number}', { number: order.number }) : t('Payment')} onClose={onClose} width="max-w-3xl" locked={busy}>
      <div className="grid grid-cols-[1fr_1.1fr] gap-6">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-teal text-white p-5">
            <div className="text-white/75 font-semibold">{t('Total to pay')}</div>
            <div className="text-4xl font-extrabold mt-1" data-testid="pay-total">
              {money(total)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`chip justify-center min-h-14 rounded-2xl ${method === m.id ? 'bg-yellow' : 'bg-bg hover:bg-line'}`}
                aria-pressed={method === m.id}
              >
                <m.icon size={20} />
                {m.label}
              </button>
            ))}
          </div>
          {method === 'cash' && (
            <div className="rounded-2xl bg-bg p-4 flex flex-col gap-2">
              <div className="flex justify-between font-semibold">
                <span className="text-muted">{t('Change')}</span>
                <span className={`text-2xl font-extrabold ${enough ? 'text-emerald-600' : 'text-muted'}`} data-testid="pay-change">
                  {enough ? money(change) : '—'}
                </span>
              </div>
              {!enough && cashText && <div className="text-sm text-rose-500 font-semibold">{t('Not enough cash yet')}</div>}
            </div>
          )}
          {method === 'card' && (
            <div className="rounded-2xl bg-bg p-5 text-muted">
              <CreditCard className="text-teal mb-2" />
              {t('Charge {amount} on the card terminal, then confirm once it is approved.', { amount: money(total) })}
            </div>
          )}
          {method === 'qr' && (
            <div className="rounded-2xl bg-bg p-4 flex flex-col items-center gap-3 text-center">
              {paymentQr ? (
                <img src={paymentQr} alt={t('Shop payment QR')} className="max-h-64 rounded-xl bg-white" data-testid="payment-qr" />
              ) : (
                <div className="text-sm text-rose-500 font-semibold">{t('No payment QR yet. An Admin can upload the shop QR in Settings › General.')}</div>
              )}
              <div className="text-sm text-muted">
                {t('Customer scans, types {amount} in their app and pays. Confirm when the payment shows as received.', { amount: money(total) })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {method === 'cash' ? (
            <>
              <label className="label" htmlFor="cash-in">
                {t('Amount received')}
              </label>
              <input
                id="cash-in"
                data-testid="cash-input"
                data-wedge="off"
                className="field text-2xl font-bold min-h-14"
                inputMode="decimal"
                placeholder="0.00"
                value={cashText}
                onChange={(e) => /^\d{0,7}([.,]\d{0,2})?$/.test(e.target.value) && setCashText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enough && !busy && void place(true)}
                autoFocus
              />
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts(total).map((a) => (
                  <button key={a} className="btn-ghost min-h-12 text-sm" onClick={() => setCashText((a / 100).toFixed(2))}>
                    {a === total ? t('Exact') : money(a)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del'].map((k) => (
                  <button key={k} className="btn-ghost min-h-12 text-lg" onClick={() => key(k)} aria-label={k === 'del' ? t('Delete') : k}>
                    {k === 'del' ? <Delete size={20} /> : k}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <div className="mt-auto grid gap-2">
            <button className="btn-yellow min-h-14 text-lg" disabled={!enough || busy} onClick={() => place(true)} data-testid="confirm-payment">
              <CheckCircle2 size={20} /> {busy ? t('Processing…') : t('Confirm {method} payment', { method: t(METHODS.find((m) => m.id === method)!.label) })}
            </button>
            {!order && (
              <button className="btn-ghost" disabled={busy} onClick={() => place(false)}>
                <ChefHat size={18} /> {t('Pay later — send to kitchen')}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function ReceiptView({ order, onClose, title }: { order: Order; onClose: () => void; title?: string }) {
  const t = useT()
  const money = useMoney()
  const s = useApp((st) => st.settings)
  const [busy, setBusy] = useState('')
  const act = async (name: string, fn: () => Promise<unknown>, ok: string): Promise<void> => {
    setBusy(name)
    try {
      const r = (await fn()) as { ok: boolean; error?: string; data?: unknown }
      if (!r.ok) toast.err(r.error)
      else if (r.data !== null || name !== 'pdf') toast.ok(ok)
    } finally {
      setBusy('')
    }
  }
  return (
    <Modal title={title ?? t('Payment complete')} onClose={onClose} width="max-w-2xl">
      <div className="grid grid-cols-[1fr_auto] gap-6">
        <div className="paper bg-bg rounded-2xl p-3 max-h-[60vh] overflow-auto">
          <div className="bg-surface rounded-t-xl p-5 font-mono text-sm" data-testid="receipt">
            <div className="text-center font-bold text-base">{s.storeName}</div>
            <div className="text-center text-muted text-xs mb-3">{s.storeAddress}</div>
            <div className="flex justify-between">
              <span>{t('Order')}</span>
              <b>{order.number}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('Date')}</span>
              <span>{fmtDateTime(order.paidAt ?? order.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('Cashier')}</span>
              <span>{order.cashierName ?? '-'}</span>
            </div>
            <div className="flex justify-between font-bold" data-testid="receipt-type">
              <span>{order.orderType === 'takeaway' ? t('Take away') : t('Dine in')}</span>
              <span>{order.tableNo ?? ''}</span>
            </div>
            <div className="dashed-sep my-2" />
            {order.items.map((i, n) => (
              <div key={n} className="flex justify-between gap-3">
                <span>
                  {i.qty} × {i.name}
                </span>
                <span>{money(i.qty * i.price)}</span>
              </div>
            ))}
            <div className="dashed-sep my-2" />
            <div className="flex justify-between">
              <span>{t('Subtotal')}</span>
              <span>{money(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <span>{t('Discount')}</span>
                <span>-{money(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>{t('Tax')}</span>
              <span>{money(order.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-base mt-1">
              <span>{t('TOTAL')}</span>
              <span>{money(order.total)}</span>
            </div>
            {order.paid && (
              <>
                <div className="flex justify-between">
                  <span>{t('Paid by')}</span>
                  <span>{t(METHODS.find((m) => m.id === order.paymentMethod)?.label ?? '')}</span>
                </div>
                {order.paymentMethod === 'cash' && (
                  <div className="flex justify-between font-bold" data-testid="receipt-change">
                    <span>{t('Change')}</span>
                    <span>{money(order.change ?? 0)}</span>
                  </div>
                )}
              </>
            )}
            <div className="text-center text-xs text-muted mt-3">{s.receiptFooter}</div>
          </div>
          <div className="torn-edge" />
        </div>
        <div className="flex flex-col gap-2 w-48">
          <button className="btn-teal min-h-12" disabled={!!busy} onClick={() => act('print', () => api.print.receipt(order.id), t('Receipt sent to printer'))}>
            <Printer size={18} /> {busy === 'print' ? t('Printing…') : t('Print')}
          </button>
          <button className="btn-ghost min-h-12" disabled={!!busy} onClick={() => act('pdf', () => api.print.pdf(order.id), t('PDF saved'))}>
            <FileDown size={18} /> {t('Save as PDF')}
          </button>
          <button className="btn-ghost min-h-12" disabled={!!busy} onClick={() => act('drawer', () => api.print.openDrawer(), t('Cash drawer opened'))}>
            <Inbox size={18} /> {t('Open cash drawer')}
          </button>
          <button className="btn-yellow min-h-12 mt-auto" onClick={onClose} data-testid="new-order" autoFocus>
            <Plus size={18} /> {t('New Order')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
