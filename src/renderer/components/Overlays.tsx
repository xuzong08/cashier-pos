import { CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'
import { useUi } from '@/store/ui'
import { Modal } from './Modal'
import { useT } from '@/lib/i18n'

const ICON = { success: CheckCircle2, error: XCircle, info: Info }
const TONE = { success: 'text-emerald-600', error: 'text-rose-600', info: 'text-teal' }

export function Toasts() {
  const tx = useT()
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismiss)
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none" aria-live="polite">
      {toasts.map((t) => {
        const I = ICON[t.kind]
        return (
          <div key={t.id} className="pointer-events-auto card flex items-center gap-3 pl-4 pr-2 py-2 min-h-14 shadow-[var(--shadow-lift)] animate-toast" role="status">
            <I className={TONE[t.kind]} size={22} />
            <span className="font-semibold max-w-md">{t.message}</span>
            {t.action && (
              <button
                className="btn-teal min-h-10 text-sm"
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="btn min-h-10 px-3 text-muted" onClick={() => dismiss(t.id)} aria-label={tx('Dismiss')}>
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function ConfirmHost() {
  const t = useT()
  const req = useUi((s) => s.confirmReq)
  if (!req) return null
  return (
    <Modal title={req.title} onClose={() => req.resolve(false)} width="max-w-md">
      <p className="text-muted mb-6">{req.message}</p>
      <div className="flex justify-end gap-3">
        <button className="btn-ghost" onClick={() => req.resolve(false)}>
          {t('Cancel')}
        </button>
        <button className={req.danger ? 'btn bg-rose-600 text-white hover:bg-rose-700' : 'btn-teal'} onClick={() => req.resolve(true)} autoFocus>
          {req.confirmLabel ?? t('Confirm')}
        </button>
      </div>
    </Modal>
  )
}

export function Empty({ icon: I, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 text-muted animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-bg flex items-center justify-center mb-3">
        <I size={28} className="text-muted" />
      </div>
      <div className="font-semibold text-ink">{title}</div>
      {hint && <div className="text-sm mt-1">{hint}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted" role="status">
      <span className="w-5 h-5 rounded-full border-[3px] border-teal/25 border-t-teal animate-spin" />
      {label ?? t('Loading…')}
    </div>
  )
}
