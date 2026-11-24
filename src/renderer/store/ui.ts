import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
  action?: { label: string; run: () => void }
}

interface ConfirmReq {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface UiState {
  toasts: Toast[]
  confirmReq: ConfirmReq | null
  /** open modal count; global shortcuts that would fight a dialog check this */
  modals: number
  toast(kind: Toast['kind'], message: string, action?: Toast['action']): void
  dismiss(id: number): void
  confirm(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean>
}

let nextId = 1

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  confirmReq: null,
  modals: 0,
  toast(kind, message, action) {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message, action }] }))
    setTimeout(() => get().dismiss(id), action ? 6000 : 3200)
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
  confirm(opts) {
    return new Promise((resolve) =>
      set({
        confirmReq: {
          ...opts,
          resolve: (ok) => {
            set({ confirmReq: null })
            resolve(ok)
          }
        }
      })
    )
  }
}))

export const toast = {
  ok: (m: string, action?: Toast['action']) => useUi.getState().toast('success', m, action),
  err: (m: unknown, action?: Toast['action']) =>
    useUi.getState().toast('error', m instanceof Error ? m.message : String(m), action),
  info: (m: string, action?: Toast['action']) => useUi.getState().toast('info', m, action)
}

export const confirmDialog = (opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> => useUi.getState().confirm(opts)
