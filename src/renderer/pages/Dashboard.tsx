import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardList, Clock3, PackageX, Plus, Receipt, Search, ShoppingBag, TrendingDown, TrendingUp, Users } from 'lucide-react'
import type { DashboardStats, Order } from '@shared/types'
import { api, fmtTime, unwrap } from '@/lib/api'
import { useMoney } from '@/store/app'
import { useCart } from '@/store/cart'
import { toast } from '@/store/ui'
import { NEXT_STATUS, ProductThumb, StatusPill, TableBadge } from '@/components/bits'
import { Empty, Spinner } from '@/components/Overlays'
import { PaymentDialog } from '@/components/PaymentDialog'
import { useT } from '@/lib/i18n'

export function Greeting({ title }: { title: string }) {
  const t = useT()
  const now = new Date()
  return (
    <header className="flex items-end justify-between gap-4 py-2">
      <h1 className="text-[1.7em] font-extrabold tracking-tight">{title}</h1>
      <div className="text-right text-muted font-semibold">
        {now.toLocaleDateString(t.dateLocale, { weekday: 'long' })}
        <div className="text-ink">{now.toLocaleDateString(t.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </div>
    </header>
  )
}

function Stat({ label, value, delta, icon: I, teal }: { label: string; value: number; delta: number; icon: typeof Users; teal?: boolean }) {
  const t = useT()
  const up = delta >= 0
  return (
    <div className={`card p-5 flex flex-col gap-3 animate-slide-in ${teal ? '!bg-teal text-white' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`font-semibold ${teal ? 'text-white/80' : 'text-muted'}`}>{label}</span>
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${teal ? 'bg-white/15' : 'bg-teal-soft text-teal'}`}>
          <I size={20} />
        </span>
      </div>
      <div className="text-[2.4em] leading-none font-extrabold">{value}</div>
      <div className={`text-sm font-semibold flex items-center gap-1 ${teal ? 'text-white/85' : up ? 'text-emerald-600' : 'text-rose-500'}`}>
        {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        {t('{delta}% than usual', { delta: `${up ? '+' : ''}${delta}` })}
      </div>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input className="field pl-10 min-h-10" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

export function Dashboard() {
  const nav = useNavigate()
  const money = useMoney()
  const clearCart = useCart((s) => s.clear)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [active, setActive] = useState<Order[]>([])
  const [unpaid, setUnpaid] = useState<Order[]>([])
  const [q1, setQ1] = useState('')
  const [q2, setQ2] = useState('')
  const [paying, setPaying] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const t = useT()

  const load = useCallback(async () => {
    try {
      const [s, a, u] = await Promise.all([
        unwrap(api.stats.dashboard()),
        unwrap(api.orders.list({ status: 'active', limit: 50 })),
        unwrap(api.orders.list({ status: 'unpaid', limit: 50 }))
      ])
      setStats(s)
      setActive(a)
      setUnpaid(u)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const advance = async (o: Order): Promise<void> => {
    const next = NEXT_STATUS[o.status]
    if (!next) return
    const r = await api.orders.setStatus(o.id, next)
    if (!r.ok) return toast.err(r.error)
    void load()
  }

  const match = (o: Order, q: string): boolean =>
    !q || [o.number, o.customer, o.tableNo].some((v) => v?.toLowerCase().includes(q.toLowerCase()))

  if (error && !stats) return <Empty icon={PackageX} title={t('Could not load the dashboard')} hint={error} />
  if (!stats) return <Spinner />

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <Greeting title={t('Nice! We have a lot of orders 🤩')} />
      <div className="grid grid-cols-4 gap-4">
        <Stat teal label={t('New Orders')} value={stats.newOrders} delta={stats.newOrdersDelta} icon={ShoppingBag} />
        <Stat label={t('Total Orders')} value={stats.totalOrders} delta={stats.totalOrdersDelta} icon={ClipboardList} />
        <Stat label={t('Waiting List')} value={stats.waiting} delta={stats.waitingDelta} icon={Clock3} />
        <button
          onClick={() => {
            clearCart()
            nav('/pos')
          }}
          className="rounded-[var(--radius-card)] bg-yellow hover:bg-yellow-dark text-on-yellow transition active:scale-[0.98] shadow-[var(--shadow-soft)] flex flex-col items-center justify-center gap-2 font-extrabold text-lg tracking-wide"
        >
          <span className="w-14 h-14 rounded-full bg-on-yellow text-yellow flex items-center justify-center">
            <Plus size={30} strokeWidth={3} />
          </span>
          {t('CREATE NEW ORDER')}
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[1.35fr_1fr_0.95fr] gap-4">
        <section className="card p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold">{t('Order List')}</h2>
            <div className="w-56">
              <SearchBox value={q1} onChange={setQ1} placeholder={t('Search order…')} />
            </div>
          </div>
          <div className="flex-1 overflow-auto -mx-2 px-2">
            {active.filter((o) => match(o, q1)).length === 0 ? (
              <Empty icon={ClipboardList} title={t('No active orders')} hint={t('New orders appear here while they are prepared.')} />
            ) : (
              active
                .filter((o) => match(o, q1))
                .map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-3 border-b border-line last:border-0 animate-slide-in">
                    <TableBadge table={o.tableNo} takeaway={o.orderType === 'takeaway'} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{o.customer || t('Walk-in')}</div>
                      <div className="text-sm text-muted">
                        {t('{n} items', { n: o.items.reduce((s, i) => s + i.qty, 0) })} · {o.number} · {fmtTime(o.createdAt)}
                      </div>
                    </div>
                    <StatusPill status={o.status} paid={o.paid} onClick={() => advance(o)} />
                  </div>
                ))
            )}
          </div>
        </section>

        <section className="card p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold">{t('Payment')}</h2>
            <div className="w-44">
              <SearchBox value={q2} onChange={setQ2} placeholder={t('Search…')} />
            </div>
          </div>
          <div className="flex-1 overflow-auto -mx-2 px-2">
            {unpaid.filter((o) => match(o, q2)).length === 0 ? (
              <Empty icon={Receipt} title={t('All paid up')} hint={t('Unpaid orders wait here.')} />
            ) : (
              unpaid
                .filter((o) => match(o, q2))
                .map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-3 border-b border-line last:border-0 animate-slide-in">
                    <TableBadge table={o.tableNo} takeaway={o.orderType === 'takeaway'} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{o.customer || t('Walk-in')}</div>
                      <div className="text-sm font-semibold text-teal">{money(o.total)}</div>
                    </div>
                    <button className="btn-yellow min-h-10 px-3 text-sm" onClick={() => setPaying(o)}>
                      {t('Pay Now')} <ArrowRight size={16} />
                    </button>
                  </div>
                ))
            )}
          </div>
        </section>

        <div className="flex flex-col gap-4 min-h-0">
          <section className="card p-5 flex-1 min-h-0 flex flex-col">
            <h2 className="text-lg font-bold mb-2">{t('Popular Dishes')}</h2>
            <div className="flex-1 overflow-auto">
              {stats.popular.length === 0 ? (
                <Empty icon={ShoppingBag} title={t('No sales yet')} />
              ) : (
                stats.popular.map((p, i) => (
                  <div key={p.productId} className="flex items-center gap-3 py-2">
                    <span className="w-5 font-extrabold text-muted">{i + 1}</span>
                    <ProductThumb p={p} size="sm" />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.name}</div>
                      <div className="text-sm text-muted">{t('Orders: {n}', { n: p.count })}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="card p-5 max-h-[38%] min-h-0 flex flex-col">
            <h2 className="text-lg font-bold mb-2">{t('Out of Stock')}</h2>
            <div className="flex-1 overflow-auto">
              {stats.outOfStock.length === 0 && stats.lowStock.length === 0 ? (
                <div className="text-sm text-muted py-2">{t('Everything is in stock 🎉')}</div>
              ) : (
                <>
                  {stats.outOfStock.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="font-semibold truncate">{p.name}</span>
                      <span className="text-xs text-rose-500 font-semibold whitespace-nowrap">{t('Available: {time}', { time: p.availableAt || t('TBA') })}</span>
                    </div>
                  ))}
                  {stats.lowStock.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="font-semibold truncate">{p.name}</span>
                      <span className="text-xs text-amber-600 font-semibold whitespace-nowrap">{t('Low: {n} left', { n: p.stock })}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
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
