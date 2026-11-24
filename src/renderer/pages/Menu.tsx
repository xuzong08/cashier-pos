import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PackageSearch, Pencil, Plus, Search, Shapes, Upload } from 'lucide-react'
import type { Product } from '@shared/types'
import { api } from '@/lib/api'
import { useApp, useIsAdmin, useMoney } from '@/store/app'
import { toast } from '@/store/ui'
import { CategoryTag, ProductThumb } from '@/components/bits'
import { ProductForm } from '@/components/ProductForm'
import { Empty } from '@/components/Overlays'
import { Greeting } from './Dashboard'
import { CategoryEditor } from '@/components/CategoryEditor'
import { ExportButtons } from '@/components/bits'
import { useT } from '@/lib/i18n'

export function MenuPage() {
  const t = useT()
  const [catsOpen, setCatsOpen] = useState(false)
  const products = useApp((s) => s.products)
  const categories = useApp((s) => s.categories)
  const loadCatalog = useApp((s) => s.loadCatalog)
  const isAdmin = useIsAdmin()
  const money = useMoney()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<number | 'all'>('all')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')
  const [editing, setEditing] = useState<{ product?: Product; barcode?: string } | null>(null)

  // "Add as new product" from an unknown scan lands here with ?new=<barcode>
  useEffect(() => {
    const code = params.get('new')
    if (code !== null && isAdmin) {
      setEditing({ barcode: code })
      setParams({}, { replace: true })
    }
  }, [params, isAdmin, setParams])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return products.filter(
      (p) =>
        (cat === 'all' || p.categoryId === cat) &&
        (stockFilter === 'all' || (stockFilter === 'out' ? p.stock <= 0 : p.stock > 0 && p.stock <= p.lowStock)) &&
        (!s || p.name.toLowerCase().includes(s) || p.barcode?.includes(s))
    )
  }, [products, q, cat, stockFilter])

  const doExport = async (fmt: 'csv' | 'xlsx'): Promise<void> => {
    const r = await api.products.exportFile(fmt)
    if (!r.ok) toast.err(r.error)
    else if (r.data) toast.ok(t('Saved {file}', { file: r.data }))
  }
  const doImport = async (): Promise<void> => {
    const r = await api.products.importFile()
    if (!r.ok) return toast.err(r.error)
    if (!r.data) return
    await loadCatalog()
    const { created, updated, skipped } = r.data
    toast.ok(
      t('Imported: {created} new, {updated} updated', { created, updated }) +
        (skipped.length ? ' · ' + t('{n} skipped (row {row}: {why})', { n: skipped.length, row: skipped[0].row, why: skipped[0].reason }) : '')
    )
  }

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <Greeting title={t('Menu & products')} />
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <label className="relative flex-1 min-w-60">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field pl-10" placeholder={t('Search name or barcode')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="field w-44" value={cat} onChange={(e) => setCat(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label={t('Category')}>
          <option value="all">{t('All categories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="field w-40" value={stockFilter} onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)} aria-label={t('Stock filter')}>
          <option value="all">{t('All stock')}</option>
          <option value="low">{t('Low stock')}</option>
          <option value="out">{t('Out of Stock')}</option>
        </select>
        {isAdmin && (
          <>
            <button className="btn-ghost" onClick={() => setCatsOpen(true)}>
              <Shapes size={18} /> {t('Categories')}
            </button>
            <button className="btn-ghost" onClick={doImport}>
              <Upload size={18} /> {t('Import')}
            </button>
            <ExportButtons onExport={doExport} />
            <button className="btn-yellow" onClick={() => setEditing({})}>
              <Plus size={18} /> {t('Add product')}
            </button>
          </>
        )}
      </div>

      <div className="card flex-1 min-h-0 overflow-auto">
        {list.length === 0 ? (
          <Empty icon={PackageSearch} title={t('No products found')} hint={isAdmin ? t('Add one, or import a CSV / Excel file.') : undefined} />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface z-10 text-left text-sm text-muted">
              <tr>
                <th className="p-4 font-semibold">{t('Product')}</th>
                <th className="p-4 font-semibold">{t('Category')}</th>
                <th className="p-4 font-semibold text-right">{t('Price')}</th>
                <th className="p-4 font-semibold text-right">{t('Stock')}</th>
                <th className="p-4 font-semibold">{t('Barcode')}</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-line animate-fade-in">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <ProductThumb p={p} size="sm" />
                      <span className="font-semibold">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4">
                    <CategoryTag cat={categories.find((c) => c.id === p.categoryId)} />
                  </td>
                  <td className="px-4 text-right font-bold">{money(p.price)}</td>
                  <td className="px-4 text-right">
                    <span className={`font-semibold ${p.stock <= 0 ? 'text-rose-500' : p.stock <= p.lowStock ? 'text-amber-600' : ''}`}>
                      {p.stock <= 0 ? t('Out of Stock') : p.stock}
                    </span>
                  </td>
                  <td className="px-4 font-mono text-sm text-muted">{p.barcode ?? '—'}</td>
                  <td className="px-4 text-right">
                    {isAdmin && (
                      <button className="btn-icon" onClick={() => setEditing({ product: p })} aria-label={`${t('Edit')} ${p.name}`}>
                        <Pencil size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {catsOpen && <CategoryEditor onClose={() => setCatsOpen(false)} />}
      {editing && <ProductForm product={editing.product} barcode={editing.barcode} onClose={() => setEditing(null)} />}
    </div>
  )
}
