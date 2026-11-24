import { Circle, Square } from 'lucide-react'
import type { DiningTableInput } from '@shared/types'
import { useT } from '@/lib/i18n'

const int = (v: string, min: number, max: number, fallback: number): number => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** Name, zone, seats, shape (and optionally size) of one table. Controlled. */
export function TableFields({ value, onChange, withSize }: { value: DiningTableInput; onChange: (v: DiningTableInput) => void; withSize?: boolean }) {
  const t = useT()
  const set = <K extends keyof DiningTableInput>(k: K, v: DiningTableInput[K]): void => onChange({ ...value, [k]: v })
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="tf-name">
            {t('Table name')}
          </label>
          <input id="tf-name" className="field font-bold uppercase" maxLength={10} value={value.name} onChange={(e) => set('name', e.target.value.toUpperCase())} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="tf-zone">
            {t('Zone')}
          </label>
          <input id="tf-zone" className="field" maxLength={30} value={value.zone} placeholder={t('e.g. Terrace')} onChange={(e) => set('zone', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="tf-seats">
            {t('Seats')}
          </label>
          <input id="tf-seats" className="field" inputMode="numeric" value={value.seats} onChange={(e) => set('seats', int(e.target.value, 1, 50, value.seats))} />
        </div>
        <div>
          <div className="label">{t('Shape')}</div>
          <div className="grid grid-cols-2 gap-2">
            {(['square', 'round'] as const).map((s) => (
              <button key={s} type="button" onClick={() => set('shape', s)} aria-pressed={value.shape === s} className={`chip justify-center rounded-xl ${value.shape === s ? 'bg-teal text-white' : 'bg-bg'}`}>
                {s === 'round' ? <Circle size={16} /> : <Square size={16} />}
                {s === 'round' ? t('Round') : t('Square')}
              </button>
            ))}
          </div>
        </div>
      </div>
      {withSize && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tf-w">
              {t('Width')}
            </label>
            <input id="tf-w" className="field" inputMode="numeric" value={value.w} onChange={(e) => set('w', int(e.target.value, 40, 600, value.w))} />
          </div>
          <div>
            <label className="label" htmlFor="tf-h">
              {t('Depth')}
            </label>
            <input id="tf-h" className="field" inputMode="numeric" value={value.h} onChange={(e) => set('h', int(e.target.value, 40, 600, value.h))} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Suggest the next free name in a zone: A1..A8 taken -> A9. */
export function nextTableName(names: string[], zone: string): string {
  const prefix = (zone.trim()[0] ?? 'T').toUpperCase()
  for (let i = 1; ; i++) if (!names.includes(`${prefix}${i}`)) return `${prefix}${i}`
}
