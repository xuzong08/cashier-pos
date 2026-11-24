import { useCallback, useEffect, useState } from 'react'
import { ClipboardX, FileDown, Printer, RotateCcw, Search, Wallet } from 'lucide-react'
import type { Order, OrderQuery } from '@shared/types'
import { api, fmtDateTime, todayKey, unwrap } from '@/lib/api'
import { useIsAdmin, useMoney } from '@/store/app'
import { confirmDialog, toast } from '@/store/ui'
import { ExportButtons, NEXT_STATUS, StatusPill, TableBadge } from '@/components/bits'
import { tr } from '@shared/i18n'
import { useT } from '@/lib/i18n'
import { Empty, Spinner } from '@/components/Overlays'
import { PaymentDialog } from '@/components/PaymentDialog'
import { Greeting } from './Dashboard'

const STATUSES: { id: NonNullable<OrderQuery['status']>; label: string }[] = [
  { id: 'all', label: tr('All') },
  { id: 'unpaid', label: tr('Unpaid') },
  { id: 'in_progress', label: tr('In Progress') },
  { id: 'ready', label: tr('Ready') },
  { id: 'completed', label: tr('Completed') },
  { id: 'refunded', label: tr('Refunded') },
  { id: 'held', label: tr('Held') }
]

export function OrdersPage() {
  const t = useT()
  const money = useMoney()
  const isAdmin = useIsAdmin()
  const weekAgo = todayKey(new Date(Date.now() - 6 * 864e5))
  const [q, setQ] = useState<OrderQuery>({ status: 'all', from: weekAgo, to: todayKey(), search: '' })
  const [list, setList] = useState<Order[] | null>(null)
  const [sel, setSel] = useState<Order | null>(null)
  const [paying, setPaying] = useState<Order | null>(null)

  const load = useCallback(async () => {
    try {
      const rows = await unwrap(api.orders.list({ ...q, search: q.search || undefined, from: q.from || undefined, to: q.to || undefined, limit: 500 }))
      setList(rows)
      setSel((s) => (s ? (rows.find((r) => r.id === s.id) ?? null) : null))
    } catch (e) {
      toast.err(e)
      setList([])
    }
  }, [q])
  useEffect(() => {
    const t = setTimeout(load, 200) // debounce typing
    return () => clearTimeout(t)
  }, [load])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: string): Promise<void> => {
    const r = await fn()
    if (!r.ok) return toast.err(r.error)
    if (r.data !== null) toast.ok(ok)
    void load()
  }

  const refund = async (o: Order): Promise<void> => {
    if (!(await confirmDialog({ title: t('Refund {number}?', { number: o.number }), message: t('{amount} will be marked refunded and items returned to stock.', { amount: money(o.total) }), danger: true, confirmLabel: t('Refund') }))) return
    await run(() => api.orders.refund(o.id), 'Order refunded')
  }

  const doExport = (fmt: 'csv' | 'xlsx'): Promise<void> => run(() => api.orders.exportFile(q.from || weekAgo, q.to || todayKey(), fmt), t('Orders exported'))

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <Greeting title={t('Order history')} />
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <label className="relative flex-1 min-w-56">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field pl-10" placeholder={t('Order no, customer or table')} value={q.search} onChange={(e) => setQ({ ...q, search: e.target.value })} />
        </label>
        <input type="date" className="field w-44" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} aria-label={t('From date')} />
        <span className="text-muted">{t('to')}</span>
        <input type="date" className="field w-44" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} aria-label={t('To date')} />
        {isAdmin && (
          <ExportButtons onExport={doExport} />
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto shrink-0">
        {STATUSES.map((s) => (
          <button key={s.id} onClick={() => setQ({ ...q, status: s.id })} className={`chip ${q.status === s.id ? 'bg-teal text-white' : 'bg-surface hover:bg-surface/70'}`}>
            {t(s.label)}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[1.4fr_1fr] gap-4">
        <div className="card overflow-auto min-h-0">
          {list === null ? (
            <Spinner />
          ) : list.length === 0 ? (
            <Empty icon={ClipboardX} title={t('No orders match')} hint={t('Change the filters or date range.')} />
          ) : (
            list.map((o) => (
              <button
                key={o.id}
                onClick={() => setSel(o)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line last:border-0 transition ${sel?.id === o.id ? 'bg-teal-soft' : 'hover:bg-bg'}`}
              >
                <TableBadge table={o.tableNo} takeaway={o.orderType === 'takeaway'} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold">
                    {o.number} <span className="font-semibold text-muted">· {o.customer || t('Walk-in')}</span>
                  </div>
                  <div className="text-sm text-muted">
                    {fmtDateTime(o.createdAt)} · {t('{n} items', { n: o.items.reduce((s, i) => s + i.qty, 0) })} · {o.paid ? t('Paid {method}', { method: (o.paymentMethod ?? '').toUpperCase() }) : t('Unpaid')}
                  </div>
                </div>
                <span className="font-extrabold w-24 text-right">{money(o.total)}</span>
                <StatusPill status={o.status} paid={o.paid} />
              </button>
            ))
          )}
        </div>

        <div className="card p-5 overflow-auto min-h-0">
          {!sel ? (
            <Empty icon={ClipboardX} title={t('Select an order')} hint={t('Details, reprint and refund appear here.')} />
          ) : (
            <div className="flex flex-col gap-3 animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-extrabold">{sel.number}</div>
                  <div className="text-sm text-muted">
                    {fmtDateTime(sel.createdAt)} · {t('by {name}', { name: sel.cashierName ?? '—' })}
                  </div>
                </div>
                <StatusPill status={sel.status} paid={sel.paid} />
              </div>
              <div className="rounded-2xl bg-bg p-4">
                {sel.items.map((i, n) => (
                  <div key={n} className="flex justify-between py-1">
                    <span>
                      {i.qty} × {i.name}
                      {i.note && <span className="text-muted text-sm"> — {i.note}</span>}
                    </span>
                    <span className="font-semibold">{money(i.qty * i.price)}</span>
                  </div>
                ))}
                <div className="dashed-sep my-2" />
                <div className="flex justify-between text-sm">
                  <span>{t('Subtotal')}</span>
                  <span>{money(sel.subtotal)}</span>
                </div>
                {sel.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>{t('Discount')} {sel.promoCode}</span>
                    <span>-{money(sel.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span>{t('Tax')}</span>
                  <span>{money(sel.tax)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-lg mt-1">
                  <span>{t('Total')}</span>
                  <span>{money(sel.total)}</span>
                </div>
                {sel.paid && sel.paymentMethod === 'cash' && (
                  <div className="flex justify-between text-sm text-muted">
                    <span>{t('Cash')} {money(sel.tendered ?? 0)}</span>
                    <span>{t('Change')} {money(sel.change ?? 0)}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {!sel.paid && sel.status !== 'held' && sel.status !== 'refunded' && (
                  <button className="btn-yellow col-span-2" onClick={() => setPaying(sel)}>
                    <Wallet size={18} /> {t('Pay now')}
                  </button>
                )}
                {NEXT_STATUS[sel.status] && (
                  <button className="btn-teal col-span-2" onClick={() => run(() => api.orders.setStatus(sel.id, NEXT_STATUS[sel.status]!), t('Status updated'))}>
                    {NEXT_STATUS[sel.status] === 'ready' ? t('Mark as Ready') : t('Mark as Completed')}
                  </button>
                )}
                <button className="btn-ghost" disabled={sel.status === 'held'} onClick={() => run(() => api.print.receipt(sel.id), t('Receipt sent to printer'))}>
                  <Printer size={18} /> {t('Reprint')}
                </button>
                <button className="btn-ghost" disabled={sel.status === 'held'} onClick={() => run(() => api.print.pdf(sel.id), t('PDF saved'))}>
                  <FileDown size={18} /> PDF
                </button>
                {isAdmin && sel.paid && sel.status !== 'refunded' && (
                  <button className="btn-danger col-span-2" onClick={() => refund(sel)}>
                    <RotateCcw size={18} /> {t('Refund')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {paying && (
        <PaymentDialog
          order={paying}
          onClose={() => {
            setPaying(null)
            void load()
          }}
        />
      )}
    </div>
  )
}
