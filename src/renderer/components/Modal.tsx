import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useT } from '@/lib/i18n'

interface Props {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  width?: string
  /** block Esc / backdrop close (e.g. while a payment is in flight) */
  locked?: boolean
}

export function Modal({ title, onClose, children, width = 'max-w-lg', locked }: Props) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    useUi.setState((s) => ({ modals: s.modals + 1 }))
    const prev = document.activeElement as HTMLElement | null
    // respect a child's autoFocus; otherwise focus the first field, never the close button
    if (!box.current?.contains(document.activeElement)) {
      const el = box.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button:not([data-close])')
      el?.focus()
    }
    return () => {
      useUi.setState((s) => ({ modals: s.modals - 1 }))
      prev?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // only the top-most modal reacts
      const all = document.querySelectorAll('[data-modal]')
      if (all[all.length - 1] !== box.current) return
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-6 animate-fade-in"
      onPointerDown={(e) => e.target === e.currentTarget && !locked && onClose()}
    >
      <div ref={box} data-modal role="dialog" aria-modal="true" className={`card w-full ${width} max-h-full flex flex-col animate-pop`}>
        {title !== undefined && (
          <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3">
            <h2 className="text-xl font-bold">{title}</h2>
            {!locked && (
              <button className="btn-icon" onClick={onClose} aria-label={t('Close')} data-close>
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="px-6 pb-6 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
