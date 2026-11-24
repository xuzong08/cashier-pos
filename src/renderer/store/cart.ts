import { create } from 'zustand'
import { computeTotals } from '@shared/cart'
import type { CartLine, Order, OrderType, Product, Promo, Totals } from '@shared/types'
import { useApp } from './app'

interface CartState {
  lines: CartLine[]
  tableNo: string
  orderType: OrderType
  customer: string
  promo: Promo | null
  heldOrderId: number | null
  /** bumps on every add so the UI can animate the row */
  lastAdded: { productId: number; at: number } | null
  add(p: Product, qty?: number): 'added' | 'no-stock'
  setQty(productId: number, qty: number): void
  setNote(productId: number, note: string): void
  remove(productId: number): void
  setMeta(m: Partial<Pick<CartState, 'tableNo' | 'customer' | 'orderType'>>): void
  setPromo(p: Promo | null): void
  clear(): void
  loadHeld(o: Order): void
}

const EMPTY = { lines: [], tableNo: '', orderType: 'dine_in' as OrderType, customer: '', promo: null, heldOrderId: null, lastAdded: null }

export const useCart = create<CartState>((set, get) => ({
  ...EMPTY,

  add(p, qty = 1) {
    const line = get().lines.find((l) => l.productId === p.id)
    if ((line?.qty ?? 0) + qty > p.stock) return 'no-stock'
    set((s) => ({
      lines: line
        ? s.lines.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + qty } : l))
        : [...s.lines, { productId: p.id, name: p.name, price: p.price, qty }],
      lastAdded: { productId: p.id, at: Date.now() }
    }))
    return 'added'
  },
  setQty(productId, qty) {
    if (qty <= 0) return get().remove(productId)
    set((s) => ({ lines: s.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)) }))
  },
  setNote(productId, note) {
    set((s) => ({ lines: s.lines.map((l) => (l.productId === productId ? { ...l, note } : l)) }))
  },
  remove(productId) {
    set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) }))
  },
  setMeta(m) {
    set(m)
  },
  setPromo(promo) {
    set({ promo })
  },
  clear() {
    set(EMPTY)
  },
  loadHeld(o) {
    const products = useApp.getState().products
    set({
      ...EMPTY,
      heldOrderId: o.id,
      tableNo: o.tableNo ?? '',
      orderType: o.orderType,
      customer: o.customer ?? '',
      lines: o.items.map((i) => {
        const p = products.find((x) => x.id === i.productId)
        return { productId: i.productId, name: p?.name ?? i.name, price: p?.price ?? i.price, qty: i.qty, note: i.note ?? undefined }
      })
    })
  }
}))

export function useTotals(): Totals {
  const lines = useCart((s) => s.lines)
  const promo = useCart((s) => s.promo)
  const taxRate = useApp((s) => s.settings.taxRate)
  return computeTotals(lines, taxRate, promo)
}
