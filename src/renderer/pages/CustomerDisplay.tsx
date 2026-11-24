import { useEffect, useState } from 'react'
import { formatMoney } from '@shared/cart'
import type { CustomerDisplayState } from '@shared/types'
import { api } from '@/lib/api'
import { Logo } from '@/components/Shell'
import { useT } from '@/lib/i18n'

/** Runs in the second window on the customer-facing monitor. */
export function CustomerDisplay() {
  const t = useT()
  const [s, setS] = useState<CustomerDisplayState | null>(null)
  useEffect(() => api.on.displayState(setS), [])
  const money = (c: number): string => formatMoney(c, s?.currency ?? 'USD', s?.locale ?? 'en-US')

  return (
    <div className="h-full bg-teal text-white p-10 flex gap-10">
      <div className="flex-1 flex flex-col">
        <div className="bg-surface rounded-2xl p-3 self-start">
          <Logo />
        </div>
        <h1 className="text-5xl font-extrabold mt-10">{s?.storeName ?? t('Welcome!')}</h1>
        <p className="text-white/75 text-2xl mt-3">{s?.lines.length ? t('Here is your order') : t('Your order will appear here')}</p>
      </div>
      <div className="w-[44%] bg-surface text-ink rounded-3xl p-8 flex flex-col">
        <div className="flex-1 overflow-auto">
          {s?.lines.map((l) => (
            <div key={l.productId} className="flex justify-between text-xl py-2 border-b border-line animate-slide-in">
              <span>
                {l.qty} × {l.name}
              </span>
              <span className="font-bold">{money(l.price * l.qty)}</span>
            </div>
          ))}
        </div>
        {s && (
          <div className="pt-4 text-lg">
            <div className="flex justify-between text-muted">
              <span>{t('Subtotal')}</span>
              <span>{money(s.totals.subtotal)}</span>
            </div>
            {s.totals.discount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>{t('Discount')}</span>
                <span>-{money(s.totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted">
              <span>{t('Tax')}</span>
              <span>{money(s.totals.tax)}</span>
            </div>
            <div className="flex justify-between text-4xl font-extrabold mt-3">
              <span>{t('Total')}</span>
              <span>{money(s.totals.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
