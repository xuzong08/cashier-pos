import { useEffect, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { beep } from '@/lib/beep'
import { dispatchScan, useScanHandler } from '@/lib/scanBus'
import { WedgeDetector, isEditable, undoTyped } from '@/lib/wedge'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { toast } from '@/store/ui'
import { tNow } from '@/lib/i18n'
import { dateLocaleOf } from '@shared/i18n'
import { computeTotals } from '@shared/cart'
import { Shell } from '@/components/Shell'
import { ConfirmHost, Spinner, Toasts } from '@/components/Overlays'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { Pos } from '@/pages/Pos'
import { MenuPage } from '@/pages/Menu'
import { OrdersPage } from '@/pages/Orders'
import { TablesPage } from '@/pages/Tables'
import { AccountingPage } from '@/pages/Accounting'
import { SettingsPage } from '@/pages/Settings'
import { TestBarcodes } from '@/pages/TestBarcodes'
import { CustomerDisplay } from '@/pages/CustomerDisplay'

/** Looks up a barcode and adds it to the cart. Shared by every scanner type and manual entry. */
export async function addByBarcode(code: string, nav: (to: string) => void, onPos: boolean): Promise<void> {
  const { settings, user } = useApp.getState()
  const r = await api.products.byBarcode(code)
  if (!r.ok) return toast.err(r.error)
  const p = r.data
  if (!p) {
    if (settings.scanBeep) beep(false)
    toast.err(
      tNow('Barcode not found: {code}', { code }),
      user?.role === 'admin' ? { label: tNow('Add as new product'), run: () => nav(`/menu?new=${encodeURIComponent(code)}`) } : undefined
    )
    return
  }
  if (useCart.getState().add(p) === 'no-stock') {
    if (settings.scanBeep) beep(false)
    toast.err(p.stock <= 0 ? tNow('{name} is out of stock', { name: p.name }) : tNow('Only {n} × {name} in stock', { n: p.stock, name: p.name }))
    return
  }
  if (settings.scanBeep) beep()
  toast.ok(tNow('Added {name}', { name: p.name }))
  if (!onPos) nav('/pos')
}

/** App-wide: keyboard-wedge detection, serial/HID events from main, default add-to-cart, shortcuts. */
function Services() {
  const s = useApp((st) => st.settings)
  const nav = useNavigate()
  const loc = useLocation()

  useEffect(() => {
    if (!s.wedgeEnabled) return
    const det = new WedgeDetector({ maxIntervalMs: s.wedgeMaxIntervalMs, minLength: s.wedgeMinLength, prefix: s.wedgePrefix, suffix: s.wedgeSuffix })
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey) return det.reset()
      if (e.repeat) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('[data-wedge="off"]')) return
      const scan = det.feed(e.key, e.timeStamp)
      if (!scan) return
      e.preventDefault()
      e.stopPropagation()
      // the scanner typed into a focused field: take those characters back out
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        if (isEditable(t)) undoTyped(t, scan.rawLength)
      }
      dispatchScan(scan.code, 'wedge')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [s.wedgeEnabled, s.wedgeMaxIntervalMs, s.wedgeMinLength, s.wedgePrefix, s.wedgeSuffix])

  useEffect(() => api.on.scan((e) => dispatchScan(e.code, e.source)), [])

  const onPos = loc.pathname === '/pos'
  useScanHandler((code) => void addByBarcode(code, nav, onPos))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const fire = (name: string): void => {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(name))
      }
      if (e.key === 'F2') {
        e.preventDefault()
        if (!onPos) nav('/pos')
        setTimeout(() => document.getElementById('pos-search')?.focus(), 50)
      } else if (e.key === 'F4') fire('bp:pay')
      else if (e.key === 'F8') fire('bp:hold')
      else if (e.key === 'F9') {
        e.preventDefault()
        void api.print.openDrawer().then((r) => (r.ok ? toast.ok(tNow('Cash drawer opened')) : toast.err(r.error)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, onPos])

  // mirror the cart onto the customer-facing display
  useEffect(() => {
    if (!s.customerDisplay) return
    const push = (): void => {
      const c = useCart.getState()
      const st = useApp.getState().settings
      api.win.updateDisplay({
        lines: c.lines,
        totals: computeTotals(c.lines, st.taxRate, c.promo),
        storeName: st.storeName,
        currency: st.currency,
        locale: st.locale
      })
    }
    push()
    return useCart.subscribe(push)
  }, [s.customerDisplay])

  return null
}

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const user = useApp((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

/** Dark/light class and date locale on <html>. */
function useAppearance(): void {
  const theme = useApp((s) => s.settings.theme)
  const lang = useApp((s) => s.settings.language)
  const lowPower = useApp((s) => s.settings.lowPower)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => void document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    document.documentElement.lang = dateLocaleOf(lang)
  }, [lang])
  useEffect(() => {
    document.documentElement.classList.toggle('low-power', lowPower)
  }, [lowPower])
}

export function App() {
  const ready = useApp((s) => s.ready)
  useAppearance()
  if (!ready) return <Spinner label="Cashier…" />
  return (
    <HashRouter>
      <Routes>
        <Route path="/customer-display" element={<CustomerDisplay />} />
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Services />
              <Shell />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<Pos />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="accounting" element={<RequireAuth admin><AccountingPage /></RequireAuth>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="test-barcodes" element={<TestBarcodes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
      <ConfirmHost />
    </HashRouter>
  )
}
