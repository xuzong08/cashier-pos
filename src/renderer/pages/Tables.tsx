import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, List, Map as MapIcon, Plus, Users } from 'lucide-react'
import { findFreeSpot } from '@shared/floor'
import type { DiningTable, DiningTableInput, Order } from '@shared/types'
import { api, fmtTime, unwrap } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { useApp, useIsAdmin, useMoney } from '@/store/app'
import { useCart } from '@/store/cart'
import { confirmDialog, toast } from '@/store/ui'
import { NEXT_STATUS, StatusPill } from '@/components/bits'
import { Empty, Spinner } from '@/components/Overlays'
import { FloorMap, type TableState } from '@/components/FloorMap'
import { Modal } from '@/components/Modal'
import { PaymentDialog } from '@/components/PaymentDialog'
import { TableFields, nextTableName } from '@/components/TableForm'
import { Greeting } from './Dashboard'

/** A table is busy while one of its orders is unpaid or still in the kitchen. */
function stateOf(orders: Order[]): TableState {
  if (!orders.length) return 'free'
  if (orders.some((o) => o.status === 'in_progress')) return 'in_progress'
  if (orders.some((o) => o.status === 'ready')) return 'ready'
  return 'completed'
}

function AddTable({ tables, onClose }: { tables: DiningTable[]; onClose: (added: boolean) => void }) {
  const t = useT()
  const s = useApp((st) => st.settings)
  const zone = tables[tables.length - 1]?.zone ?? 'A'
  const [v, setV] = useState<DiningTableInput>({ name: nextTableName(tables.map((x) => x.name), zone), zone, seats: 4, shape: 'square', x: 0, y: 0, w: 100, h: 100 })
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    setBusy(true)
    const spot = findFreeSpot(tables, { w: v.w, h: v.h }, { width: s.floorWidth, height: s.floorHeight, grid: s.floorGrid })
    const r = await api.tables.save({ ...v, ...spot })
    setBusy(false)
    if (!r.ok) return toast.err(r.error)
    toast.ok(t('Table {name} added', { name: r.data.name }))
    onClose(true)
  }
  return (
    <Modal title={t('Add table')} onClose={() => onClose(false)} width="max-w-md">
      <TableFields value={v} onChange={setV} />
      <p className="text-sm text-muted my-4">{t('It is placed in a free spot on the map. Move it in Settings › Table map.')}</p>
      <button className="btn-teal w-full" disabled={!v.name.trim() || busy} onClick={save} data-testid="add-table-save">
        <Plus size={18} /> {t('Add table')}
      </button>
    </Modal>
  )
}

function TableDetail({ table, orders, onClose, onPay, onNew, onChanged }: { table: DiningTable; orders: Order[]; onClose: () => void; onPay: (o: Order) => void; onNew: () => void; onChanged: () => void }) {
  const t = useT()
  const money = useMoney()
  const advance = async (o: Order): Promise<void> => {
    const next = NEXT_STATUS[o.status]
    if (!next) return
    const r = await api.orders.setStatus(o.id, next)
    if (!r.ok) return toast.err(r.error)
    onChanged()
  }
  return (
    <Modal title={`${t('Table')} ${table.name}`} onClose={onClose} width="max-w-lg">
      <div className="text-sm text-muted mb-3 flex items-center gap-2">
        <Users size={16} /> {t('{n} seats', { n: table.seats })} {table.zone && `· ${t('Zone')} ${table.zone}`}
      </div>
      {orders.map((o) => (
        <div key={o.id} className="flex items-center gap-3 py-3 border-b border-line last:border-0">
          <div className="flex-1 min-w-0">
            <div className="font-bold">
              {o.customer || t('Walk-in')} <span className="text-muted font-semibold">· {o.number}</span>
            </div>
            <div className="text-sm text-muted">
              {t('{n} items', { n: o.items.reduce((s, i) => s + i.qty, 0) })} · {fmtTime(o.createdAt)} · {money(o.total)}
            </div>
          </div>
          <StatusPill status={o.status} paid={o.paid} onClick={NEXT_STATUS[o.status] ? () => advance(o) : undefined} />
          {!o.paid && (
            <button className="btn-yellow min-h-10 text-sm" onClick={() => onPay(o)}>
              {t('Pay')}
            </button>
          )}
        </div>
      ))}
      <button className="btn-ghost w-full mt-4" onClick={onNew}>
        <Plus size={18} /> {t('New order for this table')}
      </button>
    </Modal>
  )
}

export function TablesPage() {
  const t = useT()
  const nav = useNavigate()
  const money = useMoney()
  const isAdmin = useIsAdmin()
  const s = useApp((st) => st.settings)
  const cart = useCart()
  const [tables, setTables] = useState<DiningTable[] | null>(null)
  const [open, setOpen] = useState<Order[]>([])
  const [view, setView] = useState<'map' | 'list'>('map')
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState<DiningTable | null>(null)
  const [paying, setPaying] = useState<Order | null>(null)

  const load = useCallback(async () => {
    try {
      const [tb, unpaid, active] = await Promise.all([unwrap(api.tables.list()), unwrap(api.orders.list({ status: 'unpaid' })), unwrap(api.orders.list({ status: 'active' }))])
      setTables(tb)
      setOpen([...new Map([...unpaid, ...active].map((o) => [o.id, o])).values()])
    } catch (e) {
      toast.err(e)
    }
  }, [])
  useEffect(() => {
    void load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const ordersOf = useCallback((name: string) => open.filter((o) => o.tableNo?.toUpperCase() === name.toUpperCase()), [open])
  const zones = useMemo(() => [...new Set((tables ?? []).map((x) => x.zone))], [tables])

  const start = async (table: string): Promise<void> => {
    if (cart.lines.length && !(await confirmDialog({ title: t('Start a new order?'), message: t('The current cart will be cleared.'), confirmLabel: t('New Order') }))) return
    cart.clear()
    cart.setMeta({ tableNo: table })
    nav('/pos')
  }
  const tap = (tb: DiningTable): void => (ordersOf(tb.name).length ? setDetail(tb) : void start(tb.name))

  if (!tables) return <Spinner />
  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <Greeting title={t('Tables')} />
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl overflow-hidden bg-surface" role="tablist">
          {(
            [
              ['map', MapIcon, t('Map')],
              ['list', List, t('List')]
            ] as const
          ).map(([id, I, label]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`btn rounded-none ${view === id ? 'bg-teal text-white' : 'hover:bg-line'}`}>
              <I size={18} /> {label}
            </button>
          ))}
        </div>
        <span className="text-muted text-sm ml-2">{t('{busy} of {all} tables busy', { busy: tables.filter((x) => ordersOf(x.name).length).length, all: tables.length })}</span>
        <div className="flex-1" />
        {isAdmin && (
          <button className="btn-yellow" onClick={() => setAdding(true)} data-testid="add-table">
            <Plus size={18} /> {t('Add table')}
          </button>
        )}
      </div>

      {tables.length === 0 ? (
        <div className="card flex-1">
          <Empty icon={LayoutGrid} title={t('No tables yet')} hint={isAdmin ? t('Add your first table.') : undefined} />
        </div>
      ) : view === 'map' ? (
        <div className="card p-4 flex-1 min-h-0">
          <FloorMap tables={tables} floor={{ width: s.floorWidth, height: s.floorHeight, grid: s.floorGrid }} stateOf={(tb) => stateOf(ordersOf(tb.name))} onTap={tap} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-4">
          {zones.map((z) => (
            <section key={z} className="card p-5">
              <h2 className="font-bold mb-3">{z ? `${t('Zone')} ${z}` : t('No zone')}</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {tables
                  .filter((x) => x.zone === z)
                  .map((tb) => {
                    const orders = ordersOf(tb.name)
                    const o = orders[0]
                    return (
                      <div key={tb.id} className={`rounded-2xl p-4 min-h-32 flex flex-col gap-2 transition ${o ? 'bg-teal-soft' : 'bg-bg'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`w-11 h-11 ${tb.shape === 'round' ? 'rounded-full' : 'rounded-xl'} font-extrabold flex items-center justify-center ${o ? 'bg-teal text-white' : 'bg-surface text-muted'}`}>{tb.name}</span>
                          {o && <StatusPill status={o.status} paid={o.paid} />}
                        </div>
                        {o ? (
                          <>
                            <div className="text-sm">
                              <b>{o.customer || t('Walk-in')}</b> · {fmtTime(o.createdAt)}
                              {orders.length > 1 && <span className="text-muted"> {t('+{n} more', { n: orders.length - 1 })}</span>}
                            </div>
                            <button className={`${o.paid ? 'btn-ghost bg-surface' : 'btn-yellow'} min-h-10 text-sm mt-auto`} onClick={() => setDetail(tb)}>
                              {o.paid ? t('Paid · {amount}', { amount: money(o.total) }) : t('Pay {amount}', { amount: money(o.total) })}
                            </button>
                          </>
                        ) : (
                          <button className="btn-ghost bg-surface min-h-10 text-sm mt-auto" onClick={() => start(tb.name)}>
                            {t('Free · New order')}
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
            </section>
          ))}
        </div>
      )}

      {adding && (
        <AddTable
          tables={tables}
          onClose={(added) => {
            setAdding(false)
            if (added) void load()
          }}
        />
      )}
      {detail && (
        <TableDetail
          table={detail}
          orders={ordersOf(detail.name)}
          onClose={() => setDetail(null)}
          onChanged={load}
          onPay={(o) => {
            setDetail(null)
            setPaying(o)
          }}
          onNew={() => {
            setDetail(null)
            void start(detail.name)
          }}
        />
      )}
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
