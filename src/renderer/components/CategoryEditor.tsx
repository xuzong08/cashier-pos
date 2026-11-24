import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@shared/ipc'
import type { Category } from '@shared/types'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { useApp } from '@/store/app'
import { confirmDialog, toast } from '@/store/ui'
import { CATEGORY_ICON, CategoryTag, TAG, categoryIcon } from './bits'
import { Modal } from './Modal'

type Draft = Omit<Category, 'id'> & { id?: number }

function CategoryForm({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const t = useT()
  const loadCatalog = useApp((s) => s.loadCatalog)
  const [d, setD] = useState(draft)
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    setBusy(true)
    const r = await api.categories.save({ ...d, tag: d.tag.trim() || d.name.trim() })
    setBusy(false)
    if (!r.ok) return toast.err(r.error)
    await loadCatalog()
    toast.ok(t('Category saved'))
    onClose()
  }
  return (
    <Modal title={d.id ? t('Edit category') : t('New category')} onClose={onClose} width="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="cat-name">
              {t('Name')}
            </label>
            <input id="cat-name" className="field" maxLength={40} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="cat-tag">
              {t('Tag on product cards')}
            </label>
            <input id="cat-tag" className="field" maxLength={40} value={d.tag} placeholder={d.name} onChange={(e) => setD({ ...d, tag: e.target.value })} />
          </div>
        </div>
        <div>
          <div className="label">{t('Icon')}</div>
          <div className="grid grid-cols-8 gap-2">
            {CATEGORY_ICONS.map((name) => {
              const I = CATEGORY_ICON[name]
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={d.icon === name}
                  onClick={() => setD({ ...d, icon: name })}
                  className={`h-11 rounded-xl flex items-center justify-center transition active:scale-95 ${d.icon === name ? 'bg-teal text-white' : 'bg-bg text-teal hover:bg-line'}`}
                >
                  <I size={20} />
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div className="label">{t('Color')}</div>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={d.color === c}
                onClick={() => setD({ ...d, color: c })}
                className={`min-h-11 px-4 rounded-xl text-sm font-semibold ${TAG[c]} ${d.color === c ? 'ring-2 ring-teal ring-offset-2 ring-offset-surface' : ''}`}
              >
                {d.tag || d.name || t('Tag')}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-teal" disabled={!d.name.trim() || busy} onClick={save}>
          {busy ? t('Saving…') : t('Save')}
        </button>
      </div>
    </Modal>
  )
}

export function CategoryEditor({ onClose }: { onClose: () => void }) {
  const t = useT()
  const categories = useApp((s) => s.categories)
  const products = useApp((s) => s.products)
  const loadCatalog = useApp((s) => s.loadCatalog)
  const [edit, setEdit] = useState<Draft | null>(null)

  const remove = async (c: Category): Promise<void> => {
    const ok = await confirmDialog({ title: t('Delete {name}?', { name: c.name }), message: t('Only empty categories can be deleted.'), danger: true, confirmLabel: t('Delete') })
    if (!ok) return
    const r = await api.categories.remove(c.id)
    if (!r.ok) return toast.err(r.error)
    await loadCatalog()
    toast.ok(t('Category deleted'))
  }

  return (
    <Modal title={t('Categories')} onClose={onClose} width="max-w-xl">
      <div className="flex flex-col">
        {categories.map((c) => {
          const I = categoryIcon(c.icon)
          const n = products.filter((p) => p.categoryId === c.id).length
          return (
            <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
              <span className="w-11 h-11 rounded-xl bg-bg text-teal flex items-center justify-center">
                <I size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{c.name}</div>
                <div className="text-sm text-muted">{t('{n} products', { n })}</div>
              </div>
              <CategoryTag cat={c} />
              <button className="btn-icon" onClick={() => setEdit(c)} aria-label={`${t('Edit')} ${c.name}`}>
                <Pencil size={16} />
              </button>
              <button className="btn-icon text-rose-500" onClick={() => remove(c)} aria-label={`${t('Delete')} ${c.name}`}>
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
      </div>
      <button className="btn-yellow mt-4" onClick={() => setEdit({ name: '', tag: '', icon: 'Utensils', color: 'green' })}>
        <Plus size={18} /> {t('New category')}
      </button>
      {edit && <CategoryForm draft={edit} onClose={() => setEdit(null)} />}
    </Modal>
  )
}
