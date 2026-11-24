import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Calculator,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Maximize,
  Minimize,
  Minus,
  Settings as SettingsIcon,
  Square,
  UtensilsCrossed,
  Armchair,
  ChefHat,
  X
} from 'lucide-react'
import { tr } from '@shared/i18n'
import { useT } from '@/lib/i18n'
import { api } from '@/lib/api'
import { useApp, useIsAdmin } from '@/store/app'
import { useCart } from '@/store/cart'
import { confirmDialog, toast } from '@/store/ui'

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-10 h-10 rounded-xl bg-teal flex items-center justify-center text-white shadow-sm">
        <ChefHat size={24} strokeWidth={2.2} />
      </div>
      {!compact && <div className="font-extrabold text-teal text-xl leading-tight">Cashier</div>}
    </div>
  )
}

export function TitleBar() {
  const t = useT()
  const kiosk = useApp((s) => s.kiosk)
  const isMac = window.platform === 'darwin'
  const toggleKiosk = async (): Promise<void> => {
    const r = await api.win.setKiosk(!kiosk)
    if (!r.ok) toast.err(r.error)
  }
  if (kiosk)
    return (
      <button onClick={toggleKiosk} className="fixed top-2 right-2 z-40 btn-icon bg-surface/70 shadow" title={t('Exit kiosk mode')} aria-label={t('Exit kiosk mode')}>
        <Minimize size={18} />
      </button>
    )
  return (
    <div className={`drag h-9 flex items-center justify-between shrink-0 ${isMac ? 'pl-20' : 'pl-4'}`}>
      <span className="text-xs font-semibold text-muted">Cashier</span>
      <div className="no-drag flex h-full">
        <button onClick={toggleKiosk} className="w-11 h-full flex items-center justify-center hover:bg-line" title={t('Kiosk mode')} aria-label={t('Kiosk mode')}>
          <Maximize size={15} />
        </button>
        {!isMac && (
          <>
            <button onClick={() => api.win.minimize()} className="w-11 h-full flex items-center justify-center hover:bg-line" aria-label={t('Minimize')}>
              <Minus size={16} />
            </button>
            <button onClick={() => api.win.maximize()} className="w-11 h-full flex items-center justify-center hover:bg-line" aria-label={t('Maximize')}>
              <Square size={13} />
            </button>
            <button onClick={() => api.win.close()} className="w-11 h-full flex items-center justify-center hover:bg-rose-500 hover:text-white" aria-label={t('Close')}>
              <X size={17} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const NAV = [
  { to: '/', label: tr('Dashboard'), icon: LayoutGrid, end: true },
  { to: '/menu', label: tr('Menu'), icon: UtensilsCrossed },
  { to: '/orders', label: tr('Orders'), icon: ClipboardList },
  { to: '/tables', label: tr('Table'), icon: Armchair },
  { to: '/accounting', label: tr('Accounting'), icon: Calculator, admin: true },
  { to: '/settings', label: tr('Settings'), icon: SettingsIcon }
]

function Sidebar() {
  const t = useT()
  const user = useApp((s) => s.user)!
  const logout = useApp((s) => s.logout)
  const isAdmin = useIsAdmin()
  const nav = useNavigate()
  const cartCount = useCart((s) => s.lines.length)

  const doLogout = async (): Promise<void> => {
    if (cartCount && !(await confirmDialog({ title: t('Log out?'), message: t('The current cart will be kept for the next cashier.'), confirmLabel: t('Log out') }))) return
    await logout()
    nav('/login')
  }

  return (
    <aside className="w-[clamp(200px,15vw,250px)] shrink-0 flex flex-col px-4 pb-5 pt-2">
      <div className="px-2 mb-8">
        <Logo />
      </div>
      <nav className="flex flex-col gap-1.5">
        {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex items-center gap-3 min-h-12 px-4 rounded-full font-semibold transition active:scale-[0.98] ${
                isActive ? 'bg-yellow text-on-yellow shadow-sm' : 'text-muted hover:bg-surface hover:text-ink'
              }`
            }
          >
            <n.icon size={20} />
            {t(n.label)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto card p-3 flex items-center gap-2.5">
        <div className="w-11 h-11 rounded-full bg-teal text-white font-bold flex items-center justify-center shrink-0">
          {user.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm leading-tight line-clamp-2">{user.name}</div>
          <div className="text-xs text-muted">{t(user.role === 'admin' ? 'Admin' : 'Cashier')}</div>
        </div>
        <button className="btn-icon text-rose-500" onClick={doLogout} title={t('Logout')} aria-label={t('Logout')}>
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}

export function Shell() {
  return (
    <div className="h-full flex flex-col">
      <TitleBar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden pr-4 pb-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
