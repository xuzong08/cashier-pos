import { describe, expect, it } from 'vitest'
import { computeChange, computeDiscount, computeTotals, ean13CheckDigit, isValidEan13, parseMoney, quickAmounts } from '@shared/cart'

describe('computeTotals', () => {
  it('sums lines and applies tax', () => {
    const t = computeTotals(
      [
        { price: 340, qty: 2 },
        { price: 190, qty: 1 }
      ],
      10
    )
    expect(t).toEqual({ subtotal: 870, discount: 0, tax: 87, total: 957, itemCount: 3 })
  })

  it('returns zeros for an empty cart', () => {
    expect(computeTotals([], 10)).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0, itemCount: 0 })
  })

  it('taxes the discounted amount, not the subtotal', () => {
    const t = computeTotals([{ price: 1000, qty: 1 }], 10, { type: 'percent', value: 10 })
    expect(t.discount).toBe(100)
    expect(t.tax).toBe(90)
    expect(t.total).toBe(990)
  })

  it('rounds half-cent tax to the nearest cent', () => {
    // 10% of 655 = 65.5 -> 66
    expect(computeTotals([{ price: 655, qty: 1 }], 10).tax).toBe(66)
  })

  it('supports zero and fractional tax rates', () => {
    expect(computeTotals([{ price: 999, qty: 1 }], 0).total).toBe(999)
    expect(computeTotals([{ price: 1000, qty: 1 }], 7.5).tax).toBe(75)
  })

  it('ignores invalid lines', () => {
    const t = computeTotals(
      [
        { price: 500, qty: 0 },
        { price: 500, qty: -2 },
        { price: NaN, qty: 1 },
        { price: 200, qty: 1 }
      ],
      0
    )
    expect(t.subtotal).toBe(200)
    expect(t.itemCount).toBe(1)
  })
})

describe('computeDiscount', () => {
  it('percent discount', () => {
    expect(computeDiscount(2000, { type: 'percent', value: 25 })).toBe(500)
  })
  it('clamps percent to 0..100', () => {
    expect(computeDiscount(2000, { type: 'percent', value: 150 })).toBe(2000)
    expect(computeDiscount(2000, { type: 'percent', value: -5 })).toBe(0)
  })
  it('fixed discount never exceeds the subtotal', () => {
    expect(computeDiscount(300, { type: 'fixed', value: 500 })).toBe(300)
    expect(computeDiscount(3000, { type: 'fixed', value: 500 })).toBe(500)
  })
  it('fixed discount larger than subtotal gives a zero total, never negative', () => {
    const t = computeTotals([{ price: 300, qty: 1 }], 10, { type: 'fixed', value: 500 })
    expect(t.total).toBe(0)
  })
  it('no promo means no discount', () => {
    expect(computeDiscount(1000, null)).toBe(0)
  })
})

describe('cash helpers', () => {
  it('change is tendered minus total, never negative', () => {
    expect(computeChange(715, 1000)).toBe(285)
    expect(computeChange(715, 700)).toBe(0)
  })
  it('quick amounts start with exact and round up to notes', () => {
    expect(quickAmounts(715)).toEqual([715, 800, 1000, 2000, 5000, 10000])
    expect(quickAmounts(1000)[0]).toBe(1000)
    expect(new Set(quickAmounts(1000)).size).toBe(quickAmounts(1000).length)
  })
  it('parses money input', () => {
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('12,50')).toBe(1250)
    expect(parseMoney('7')).toBe(700)
    expect(parseMoney('abc')).toBeNaN()
    expect(parseMoney('1.234')).toBeNaN()
  })
})

describe('EAN-13', () => {
  it('computes check digits', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1) // 4006381333931
    expect(ean13CheckDigit('200000000001')).toBe(5)
  })
  it('validates codes', () => {
    expect(isValidEan13('4006381333931')).toBe(true)
    expect(isValidEan13('4006381333932')).toBe(false)
    expect(isValidEan13('123')).toBe(false)
  })
})
