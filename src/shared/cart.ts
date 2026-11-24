import type { Promo, Totals } from './types'

/** Lines only need price (cents) and qty. */
export interface PricedLine {
  price: number
  qty: number
}

export function computeDiscount(subtotal: number, promo: Pick<Promo, 'type' | 'value'> | null | undefined): number {
  if (!promo || subtotal <= 0) return 0
  if (promo.type === 'percent') {
    const pct = Math.min(Math.max(promo.value, 0), 100)
    return Math.round((subtotal * pct) / 100)
  }
  return Math.min(Math.max(Math.round(promo.value), 0), subtotal)
}

/** Tax is charged on the discounted subtotal. */
export function computeTotals(
  lines: PricedLine[],
  taxRate: number,
  promo?: Pick<Promo, 'type' | 'value'> | null
): Totals {
  let subtotal = 0
  let itemCount = 0
  for (const l of lines) {
    if (!Number.isFinite(l.price) || !Number.isFinite(l.qty) || l.qty <= 0) continue
    subtotal += Math.round(l.price) * Math.floor(l.qty)
    itemCount += Math.floor(l.qty)
  }
  const discount = computeDiscount(subtotal, promo)
  const taxable = subtotal - discount
  const tax = Math.round((taxable * Math.max(taxRate, 0)) / 100)
  return { subtotal, discount, tax, total: taxable + tax, itemCount }
}

export function computeChange(total: number, tendered: number): number {
  return Math.max(0, Math.round(tendered) - Math.round(total))
}

/** Suggested cash amounts: exact, then the next round notes above the total. */
export function quickAmounts(total: number): number[] {
  const out = new Set<number>([total])
  for (const step of [100, 500, 1000, 2000, 5000, 10000]) {
    const v = Math.ceil(total / step) * step
    if (v > total) out.add(v)
  }
  return [...out].sort((a, b) => a - b).slice(0, 6)
}

export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}

/** Parse "12.50" / "12,50" into cents. Returns NaN on garbage. */
export function parseMoney(input: string): number {
  const s = input.trim().replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN
  return Math.round(parseFloat(s) * 100)
}

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}
