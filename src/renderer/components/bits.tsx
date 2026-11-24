import {
  Apple,
  Beef,
  CakeSlice,
  CheckCircle2,
  ChefHat,
  Clock3,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Donut,
  FileSpreadsheet,
  FileText,
  Fish,
  Hand,
  IceCreamCone,
  Pizza,
  RotateCcw,
  ShoppingBag,
  Salad,
  Sandwich,
  Soup,
  Utensils,
  Wheat,
  type LucideIcon
} from 'lucide-react'
import { tr } from '@shared/i18n'
import type { CATEGORY_COLORS, CATEGORY_ICONS } from '@shared/ipc'
import type { Category, OrderStatus, Product } from '@shared/types'
import { useT } from '@/lib/i18n'

const STATUS: Record<OrderStatus, { label: string; hint: string; cls: string; dot: string; icon: LucideIcon }> = {
  ready: { label: tr('Ready'), hint: tr('Ready to serve'), cls: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', icon: CheckCircle2 },
  in_progress: { label: tr('In Progress'), hint: tr('Cooking now'), cls: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', icon: ChefHat },
  completed: { label: tr('Completed'), hint: tr('Waiting for payment'), cls: 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', icon: Clock3 },
  held: { label: tr('On Hold'), hint: tr('Parked order'), cls: 'bg-stone-100 text-stone-600 dark:bg-stone-500/20 dark:text-stone-300', dot: 'bg-stone-400', icon: Hand },
  refunded: { label: tr('Refunded'), hint: tr('Money returned'), cls: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300', dot: 'bg-rose-500', icon: RotateCcw }
}

export const statusLabel = (s: OrderStatus): string => STATUS[s].label

export function StatusPill({ status, paid, onClick }: { status: OrderStatus; paid?: boolean; onClick?: () => void }) {
  const t = useT()
  const s = STATUS[status]
  const hint = status === 'completed' && paid ? t('Paid · done') : t(s.hint)
  const I = s.icon
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className="flex flex-col items-end gap-1 shrink-0" title={onClick ? t('Advance status') : undefined}>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${s.cls} ${onClick ? 'active:scale-95' : ''}`}>
        <I size={15} />
        {t(s.label)}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {hint}
      </span>
    </Tag>
  )
}

export const NEXT_STATUS: Partial<Record<OrderStatus, 'ready' | 'completed'>> = { in_progress: 'ready', ready: 'completed' }

export const TAG: Record<(typeof CATEGORY_COLORS)[number], string> = {
  amber: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  pink: 'bg-pink-50 dark:bg-pink-500/15 text-pink-600 dark:text-pink-300',
  violet: 'bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300',
  orange: 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300',
  green: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rose: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300',
  sky: 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'
}

export const CATEGORY_ICON: Record<(typeof CATEGORY_ICONS)[number], LucideIcon> = {
  Wheat,
  CakeSlice,
  Donut,
  Croissant,
  Sandwich,
  Cookie,
  Soup,
  Coffee,
  IceCreamCone,
  Pizza,
  Salad,
  CupSoda,
  Beef,
  Fish,
  Apple,
  Utensils
}

export const categoryIcon = (name: string): LucideIcon => CATEGORY_ICON[name as keyof typeof CATEGORY_ICON] ?? Utensils

export function CategoryTag({ cat }: { cat?: Category }) {
  if (!cat) return null
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${TAG[cat.color as keyof typeof TAG] ?? TAG.green}`}>{cat.tag}</span>
}

export function ProductThumb({ p, size = 'md' }: { p: Pick<Product, 'photo' | 'emoji' | 'name'>; size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'w-12 h-12 text-2xl rounded-xl', md: 'w-full aspect-[4/3] text-6xl rounded-2xl', lg: 'w-28 h-28 text-6xl rounded-2xl' }[size]
  return (
    <div className={`${box} bg-bg flex items-center justify-center overflow-hidden shrink-0`}>
      {p.photo ? (
        <img src={p.photo} alt={p.name} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <span className="drop-shadow-sm" aria-hidden>
          {p.emoji}
        </span>
      )}
    </div>
  )
}

export function TableBadge({ table, takeaway }: { table: string | null; takeaway?: boolean }) {
  const t = useT()
  if (takeaway)
    return (
      <div className="w-12 h-12 rounded-xl bg-yellow text-on-yellow flex items-center justify-center shrink-0" title={t('Take away')} aria-label={t('Take away')}>
        <ShoppingBag size={22} />
      </div>
    )
  return <div className="w-12 h-12 rounded-xl bg-teal text-white font-bold flex items-center justify-center shrink-0">{table || '—'}</div>
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 min-h-12 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span>
        <span className="font-semibold block">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-14 h-8 rounded-full transition shrink-0 ${checked ? 'bg-teal' : 'bg-line'}`}
      >
        <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-6' : ''}`} />
      </button>
    </label>
  )
}

/** Excel / CSV pair used by every export. */
export function ExportButtons({ onExport }: { onExport: (fmt: 'xlsx' | 'csv') => void }) {
  const t = useT()
  return (
    <div className="flex rounded-xl overflow-hidden bg-bg" role="group" aria-label={t('Export')}>
      <button className="btn rounded-none bg-transparent hover:bg-line" onClick={() => onExport('xlsx')}>
        <FileSpreadsheet size={18} className="text-emerald-600" /> Excel
      </button>
      <span className="w-px bg-line" />
      <button className="btn rounded-none bg-transparent hover:bg-line" onClick={() => onExport('csv')}>
        <FileText size={18} /> CSV
      </button>
    </div>
  )
}
