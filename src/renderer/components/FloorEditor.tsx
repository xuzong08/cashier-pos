import { useCallback, useEffect, useState } from 'react'
import { MousePointerClick, Plus, Save, Trash2 } from 'lucide-react'
import { findFreeSpot } from '@shared/floor'
import type { DiningTable, Settings } from '@shared/types'
import { api, unwrap } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { toast } from '@/store/ui'
import { FloorMap } from './FloorMap'
import { TableFields, nextTableName } from './TableForm'
import { Spinner } from './Overlays'

const same = (a: DiningTable, b: DiningTable): boolean => JSON.stringify(a) === JSON.stringify(b)

interface Props {
  settings: Settings
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  /** saves the settings draft (floor size); false if it failed */
  saveSettings: () => Promise<boolean>
}

/** Settings › Table map: drag tables, edit them, size the floor. Nothing is stored until "Save layout". */
export function FloorEditor({ settings: s, set, saveSettings }: Props) {
  const t = useT()
  const [saved, setSaved] = useState<DiningTable[] | null>(null)
  const [draft, setDraft] = useState<DiningTable[]>([])
  const [removed, setRemoved] = useState<number[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const floor = { width: s.floorWidth, height: s.floorHeight, grid: s.floorGrid }

  const load = useCallback(async () => {
    const list = await unwrap(api.tables.list()).catch((e) => (toast.err(e), []))
    setSaved(list)
    setDraft(list)
    setRemoved([])
  }, [])
  useEffect(() => void load(), [load])

  const selected = draft.find((d) => d.id === sel)
  const update = (v: DiningTable): void => setDraft((ds) => ds.map((d) => (d.id === v.id ? v : d)))
  const dirty = removed.length > 0 || draft.some((d) => d.id < 0 || !saved?.some((x) => x.id === d.id && same(x, d)))

  const add = (): void => {
    const zone = selected?.zone ?? draft[draft.length - 1]?.zone ?? 'A'
    const size = { w: 100, h: 100 }
    const spot = findFreeSpot(draft, size, floor)
    const tmp: DiningTable = { id: -Date.now(), name: nextTableName(draft.map((d) => d.name), zone), zone, seats: 4, shape: 'square', ...size, ...spot }
    setDraft((ds) => [...ds, tmp])
    setSel(tmp.id)
  }

  const remove = (): void => {
    if (!selected) return
    if (selected.id > 0) setRemoved((r) => [...r, selected.id])
    setDraft((ds) => ds.filter((d) => d.id !== selected.id))
    setSel(null)
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      if (!(await saveSettings())) return
      for (const id of removed) await unwrap(api.tables.remove(id))
      for (const d of draft) {
        const old = saved?.find((x) => x.id === d.id)
        if (d.id < 0) await unwrap(api.tables.save({ ...d, id: undefined }))
        else if (!old || !same(old, d)) await unwrap(api.tables.save(d))
      }
      toast.ok(t('Table layout saved'))
    } catch (e) {
      toast.err(e) // earlier steps stay saved; reload shows the real state
    } finally {
      setBusy(false)
      void load()
    }
  }

  const num = (v: string, min: number, max: number, fallback: number): number => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }

  if (!saved) return <Spinner />
  return (
    <div className="grid grid-cols-[1fr_300px] gap-4 h-[calc(100vh-230px)] min-h-[460px]">
      <section className="card p-4 flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-semibold text-muted" htmlFor="fl-w">
            {t('Floor width')}
          </label>
          <input id="fl-w" className="field w-24 min-h-10" inputMode="numeric" value={s.floorWidth} onChange={(e) => set('floorWidth', num(e.target.value, 300, 5000, s.floorWidth))} />
          <label className="text-sm font-semibold text-muted" htmlFor="fl-h">
            {t('Floor depth')}
          </label>
          <input id="fl-h" className="field w-24 min-h-10" inputMode="numeric" value={s.floorHeight} onChange={(e) => set('floorHeight', num(e.target.value, 300, 5000, s.floorHeight))} />
          <label className="text-sm font-semibold text-muted" htmlFor="fl-g">
            {t('Snap grid')}
          </label>
          <select id="fl-g" className="field w-24 min-h-10" value={s.floorGrid} onChange={(e) => set('floorGrid', Number(e.target.value))}>
            {[0, 10, 20, 40].map((g) => (
              <option key={g} value={g}>
                {g || t('Off')}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={add}>
            <Plus size={18} /> {t('Add table')}
          </button>
          <button className="btn-teal" onClick={save} disabled={busy} data-testid="save-layout">
            <Save size={18} /> {busy ? t('Saving…') : t('Save layout')}
            {dirty && !busy && <span className="w-2 h-2 rounded-full bg-yellow" />}
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <FloorMap
            tables={draft}
            floor={floor}
            editable
            selectedId={sel}
            onSelect={setSel}
            onMove={(id, x, y) => setDraft((ds) => ds.map((d) => (d.id === id ? { ...d, x, y } : d)))}
          />
        </div>
      </section>
      <aside className="card p-4 flex flex-col gap-3">
        {selected ? (
          <>
            <h3 className="font-bold text-lg">
              {t('Table')} {selected.name}
            </h3>
            <TableFields value={selected} onChange={(v) => update({ ...selected, ...v, id: selected.id })} withSize />
            <button className="btn-danger mt-auto" onClick={remove}>
              <Trash2 size={18} /> {t('Delete table')}
            </button>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-muted gap-2">
            <MousePointerClick size={32} />
            <p>{t('Drag tables to arrange the room. Tap a table to edit it.')}</p>
            <p className="text-sm">{t('{n} tables', { n: draft.length })}</p>
          </div>
        )}
      </aside>
    </div>
  )
}
