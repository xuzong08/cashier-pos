import { Printer } from 'lucide-react'
import { useApp, useMoney } from '@/store/app'
import { Barcode } from '@/components/Barcode'
import { Greeting } from './Dashboard'
import { useT } from '@/lib/i18n'

/** Every product barcode on screen, so scanners can be tested without real packaging. */
export function TestBarcodes() {
  const t = useT()
  const products = useApp((s) => s.products).filter((p) => p.barcode)
  const money = useMoney()
  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <Greeting title={t('Test barcodes')} />
      <div className="card p-4 flex items-center gap-4">
        <p className="text-muted flex-1">
          {t('Point a scanner or camera at a code below (screen brightness up helps). Unknown-code test:')} <b className="font-mono text-ink">9999999999994</b>.
        </p>
        <button className="btn-ghost" onClick={() => window.print()}>
          <Printer size={18} /> {t('Print this page')}
        </button>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {products.map((p) => (
            <div key={p.id} className="card p-4 flex flex-col items-center gap-2">
              <div className="font-bold text-center">
                {p.emoji} {p.name}
              </div>
              <Barcode text={p.barcode!} bcid={/^\d{13}$/.test(p.barcode!) ? 'ean13' : 'code128'} scale={2} height={16} />
              <div className="text-sm text-muted">
                {money(p.price)} · {t('{n} in stock', { n: p.stock })}
              </div>
            </div>
          ))}
          <div className="card p-4 flex flex-col items-center gap-2">
            <div className="font-bold">{t('QR · first product')}</div>
            {products[0] && <Barcode text={products[0].barcode!} bcid="qrcode" scale={4} />}
          </div>
          <div className="card p-4 flex flex-col items-center gap-2">
            <div className="font-bold">{t('Unknown barcode')}</div>
            <Barcode text="9999999999994" bcid="ean13" scale={2} height={16} />
          </div>
        </div>
      </div>
    </div>
  )
}
