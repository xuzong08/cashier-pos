import { create } from 'zustand'
import { formatMoney } from '@shared/cart'
import { DEFAULT_SETTINGS, type Category, type HardwareStatus, type Product, type Settings, type User } from '@shared/types'
import { api, unwrap } from '@/lib/api'

interface AppState {
  user: User | null
  settings: Settings
  products: Product[]
  categories: Category[]
  hardware: HardwareStatus
  kiosk: boolean
  ready: boolean
  init(): Promise<void>
  login(userId: number, pin: string): Promise<void>
  logout(): Promise<void>
  loadCatalog(): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  user: null,
  settings: DEFAULT_SETTINGS,
  products: [],
  categories: [],
  hardware: { serial: { state: 'off' }, hid: { state: 'off' } },
  kiosk: false,
  ready: false,

  async init() {
    const [settings, user] = await Promise.all([unwrap(api.settings.get()), unwrap(api.auth.current())])
    set({ settings, user, kiosk: settings.kiosk })
    if (user) await get().loadCatalog()
    api.on.hardwareStatus((hardware) => set({ hardware }))
    api.on.kiosk((kiosk) => set({ kiosk }))
    set({ ready: true })
  },

  async login(userId, pin) {
    const user = await unwrap(api.auth.login(userId, pin))
    set({ user })
    await get().loadCatalog()
    set({ hardware: await unwrap(api.hardware.status()) })
  },

  async logout() {
    await api.auth.logout()
    set({ user: null })
  },

  async loadCatalog() {
    const [products, categories] = await Promise.all([unwrap(api.products.list()), unwrap(api.categories.list())])
    set({ products, categories })
  },

  async saveSettings(patch) {
    set({ settings: await unwrap(api.settings.save(patch)) })
  }
}))

export const useIsAdmin = (): boolean => useApp((s) => s.user?.role === 'admin')

export function useMoney(): (cents: number) => string {
  const currency = useApp((s) => s.settings.currency)
  const locale = useApp((s) => s.settings.locale)
  return (c) => formatMoney(c, currency, locale)
}
