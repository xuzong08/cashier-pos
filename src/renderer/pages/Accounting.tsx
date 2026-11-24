import { useCallback, useEffect, useState } from 'react'
import { tr } from '@shared/i18n'
import { Banknote, CreditCard, Printer, QrCode, Receipt, RotateCcw, TrendingUp } from 'lucide-react'
import type { SalesSummary } from '@shared/types'
import { api, todayKey, unwrap } from '@/lib/api'
import { useMoney } from '@/store/app'
import { confirmDialog, toast } from '@/store/ui'
import { Empty, Spinner } from '@/components/Overlays'
import { Greeting } from './Dashboard'
import { ExportButtons } from '@/components/bits'
import { useT } from '@/lib/i18n'

function Tile({ label, value, icon: I, teal }: { label: string; value: string; icon: typeof Receipt; teal?: boolean }) {
  return (
    <div className={`card p-5 ${teal ? '!bg-teal text-white' : ''}`}>
      <div className={`flex items-center gap-2 font-semibold ${teal ? 'text-white/80' : 'text-muted'}`}>
        <I size={18} /> {label}
      </div>
      <div className="text-3xl font-extrabold mt-2">{value}</div>
    </div>
  )
}

export function AccountingPage() {
  const t = useT()
  const money = useMoney()
  const [date, setDate] = useState(todayKey())
  const [s, setS] = useState<SalesSummary | null>(null)

  const load = useCallback(() => unwrap(api.stats.summary(date)).then(setS).catch(toast.err), [date])
  useEffect(() => void load(), [load])

  const zReport = async (): Promise<void> => {
    if (!(await confirmDialog({ title: t('Close the day {date}?', { date }), message: t('The end-of-day (Z) report is recorded and printed.'), confirmLabel: t('Print Z report') }))) return
    const z = await api.stats.zReport(date)
    if (!z.ok) return toast.err(z.error)
    const p = await api.print.zReport(date)
    if (p.ok) toast.ok(t('Z report recorded and printed'))
    else toast.err(t('Z report recorded, but printing failed: {why}', { why: p.error }))
  }

  const doExport = async (fmt: 'csv' | 'xlsx'): Promise<void> => {
    const r = await api.orders.exportFile(date, date, fmt)
    if (!r.ok) toast.err(r.error)
    else if (r.data) toast.ok(t('Saved {file}', { file: r.data }))
  }

  const max = Math.max(1, ...(s?.topSellers.map((t) => t.qty) ?? [1]))
  return (
    <div className="h-full flex flex-col gap-4 min-h-0 overflow-auto">
      <Greeting title={t('Accounting')} />
      <div className="card p-4 flex items-center gap-3">
        <label className="font-semibold text-muted" htmlFor="acc-date">
          {t('Day')}
        </label>
        <input id="acc-date" type="date" className="field w-48" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value || todayKey())} />
        <div className="flex-1" />
        <ExportButtons onExport={doExport} />
        <button className="btn-yellow" onClick={zReport}>
          <Printer size={18} /> {t('End of day (Z report)')}
        </button>
      </div>
      {!s ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Tile teal label={t('Net sales')} value={money(s.totalSales - s.refunds)} icon={TrendingUp} />
            <Tile label={t('Orders paid')} value={String(s.orderCount)} icon={Receipt} />
            <Tile label={t('Average ticket')} value={money(s.orderCount ? Math.round(s.totalSales / s.orderCount) : 0)} icon={Receipt} />
            <Tile label={t('Refunds')} value={money(s.refunds)} icon={RotateCcw} />
          </div>
          <div className="grid grid-cols-[1fr_1.4fr] gap-4">
            <section className="card p-5">
              <h2 className="font-bold mb-3">{t('By payment method')}</h2>
              {(
                [
                  [tr('Cash'), s.byMethod.cash, Banknote],
                  [tr('Card'), s.byMethod.card, CreditCard],
                  [tr('QR'), s.byMethod.qr, QrCode]
                ] as const
              ).map(([l, v, I]) => (
                <div key={l} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                  <span className="flex items-center gap-2 font-semibold">
                    <I size={18} className="text-teal" /> {t(l)}
                  </span>
                  <span className="font-bold">{money(v)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm text-muted mt-3">
                <span>{t('Tax collected')}</span>
                <span>{money(s.tax)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted">
                <span>{t('Discounts given')}</span>
                <span>{money(s.discount)}</span>
              </div>
            </section>
            <section className="card p-5">
              <h2 className="font-bold mb-3">{t('Top sellers')}</h2>
              {s.topSellers.length === 0 ? (
                <Empty icon={Receipt} title={t('No sales on this day')} />
              ) : (
                s.topSellers.map((t) => (
                  <div key={t.name} className="py-1.5">
                    <div className="flex justify-between text-sm font-semibold">
                      <span>{t.name}</span>
                      <span>
                        {t.qty} · {money(t.revenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-bg mt-1 overflow-hidden">
                      <div className="h-full bg-teal rounded-full transition-all" style={{ width: `${(t.qty / max) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
