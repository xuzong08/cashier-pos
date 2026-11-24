import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Users } from 'lucide-react'
import { clampToFloor, snap, type Floor } from '@shared/floor'
import { tr } from '@shared/i18n'
import type { DiningTable } from '@shared/types'
import { useT } from '@/lib/i18n'

export type TableState = 'free' | 'in_progress' | 'ready' | 'completed'

const STATE_CLS: Record<TableState, string> = {
  free: 'bg-surface border-line text-ink',
  in_progress: 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  ready: 'bg-emerald-100 border-emerald-500 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200',
  completed: 'bg-sky-100 border-sky-500 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200'
}
const LEGEND: [TableState, string][] = [
  ['free', tr('Free')],
  ['in_progress', tr('Cooking now')],
  ['ready', tr('Ready to serve')],
  ['completed', tr('Waiting for payment')]
]

interface Props<T extends DiningTable> {
  tables: T[]
  floor: Floor
  stateOf?: (t: T) => TableState
  editable?: boolean
  selectedId?: number | null
  onSelect?: (id: number | null) => void
  onMove?: (id: number, x: number, y: number) => void
  onTap?: (t: T) => void
}

/** Floor plan: tables placed in floor units, scaled to fit the box. Edit mode drags with mouse or touch. */
export function FloorMap<T extends DiningTable>({ tables, floor, stateOf, editable, selectedId, onSelect, onMove, onTap }: Props<T>) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = size.w && size.h ? Math.min(size.w / floor.width, size.h / floor.height) : 0

  const down = (e: RPointerEvent, tb: T): void => {
    if (!editable) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: tb.id, x: tb.x, y: tb.y, px: e.clientX, py: e.clientY, ox: tb.x, oy: tb.y, moved: false })
  }
  const move = (e: RPointerEvent, tb: T): void => {
    if (!drag || drag.id !== tb.id || !scale) return
    const dx = (e.clientX - drag.px) / scale
    const dy = (e.clientY - drag.py) / scale
    const r = clampToFloor({ x: snap(drag.ox + dx, floor.grid), y: snap(drag.oy + dy, floor.grid), w: tb.w, h: tb.h }, floor)
    setDrag({ ...drag, x: r.x, y: r.y, moved: drag.moved || Math.abs(dx) + Math.abs(dy) > 4 })
  }
  const up = (tb: T): void => {
    if (!drag || drag.id !== tb.id) return
    if (drag.moved) onMove?.(tb.id, drag.x, drag.y)
    onSelect?.(tb.id)
    setDrag(null)
  }

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      <div ref={box} className="flex-1 min-h-0 relative" onPointerDown={(e) => e.target === e.currentTarget && onSelect?.(null)}>
        {scale > 0 && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-bg border-2 border-dashed border-line"
            style={{
              width: floor.width * scale,
              height: floor.height * scale,
              backgroundImage: floor.grid ? 'radial-gradient(var(--color-line) 1.5px, transparent 1.5px)' : undefined,
              backgroundSize: floor.grid ? `${floor.grid * scale}px ${floor.grid * scale}px` : undefined
            }}
            onPointerDown={(e) => e.target === e.currentTarget && onSelect?.(null)}
            data-testid="floor"
          >
            {tables.map((tb) => {
              const pos = drag?.id === tb.id ? drag : tb
              const state = stateOf?.(tb) ?? 'free'
              const sel = selectedId === tb.id
              return (
                <button
                  key={tb.id}
                  type="button"
                  data-testid="floor-table"
                  aria-label={`${t('Table')} ${tb.name}`}
                  onPointerDown={(e) => down(e, tb)}
                  onPointerMove={(e) => move(e, tb)}
                  onPointerUp={() => up(tb)}
                  onClick={() => !editable && onTap?.(tb)}
                  className={`absolute border-2 flex flex-col items-center justify-center font-extrabold leading-tight shadow-sm select-none touch-none transition-[box-shadow,transform] ${
                    tb.shape === 'round' ? 'rounded-full' : 'rounded-2xl'
                  } ${STATE_CLS[state]} ${sel ? 'ring-4 ring-yellow z-10' : ''} ${editable ? 'cursor-grab active:cursor-grabbing' : 'active:scale-95'} ${drag?.id === tb.id ? 'shadow-[var(--shadow-lift)] z-20' : ''}`}
                  style={{ left: pos.x * scale, top: pos.y * scale, width: tb.w * scale, height: tb.h * scale, fontSize: Math.max(11, Math.min(tb.w, tb.h) * scale * 0.26) }}
                >
                  {tb.name}
                  <span className="flex items-center gap-0.5 text-[0.6em] font-semibold opacity-70">
                    <Users size={11} /> {tb.seats}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {!editable && (
        <div className="flex flex-wrap gap-4 justify-center text-sm text-muted">
          {LEGEND.map(([s, label]) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`w-4 h-4 rounded border-2 ${STATE_CLS[s]}`} /> {t(label)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
