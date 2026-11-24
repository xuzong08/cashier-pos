import { describe, expect, it } from 'vitest'
import { clampToFloor, defaultTables, findFreeSpot, overlaps, snap } from '@shared/floor'
import { moneyFormat, normHeader, orderRow } from '../../src/main/io'
import type { Order } from '@shared/types'

const floor = { width: 1200, height: 800, grid: 20 }

describe('floor plan', () => {
  it('snaps to the grid', () => {
    expect(snap(29, 20)).toBe(20)
    expect(snap(31, 20)).toBe(40)
    expect(snap(33.4, 0)).toBe(33)
  })

  it('keeps tables on the floor', () => {
    expect(clampToFloor({ x: -50, y: 790, w: 100, h: 100 }, floor)).toMatchObject({ x: 0, y: 700 })
    expect(clampToFloor({ x: 1150, y: 10, w: 100, h: 100 }, floor)).toMatchObject({ x: 1100, y: 10 })
  })

  it('detects overlap, with an optional gap', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    expect(overlaps(a, { x: 99, y: 0, w: 10, h: 10 })).toBe(true)
    expect(overlaps(a, { x: 100, y: 0, w: 10, h: 10 })).toBe(false)
    expect(overlaps(a, { x: 110, y: 0, w: 10, h: 10 }, 20)).toBe(true)
  })

  it('finds a free spot that does not touch existing tables', () => {
    const tables = defaultTables()
    const spot = findFreeSpot(tables, { w: 100, h: 100 }, floor)
    const placed = { ...spot, w: 100, h: 100 }
    expect(tables.some((t) => overlaps(placed, t))).toBe(false)
    expect(placed.x + placed.w).toBeLessThanOrEqual(floor.width)
    expect(placed.y + placed.h).toBeLessThanOrEqual(floor.height)
  })

  it('falls back to the corner when the floor is full', () => {
    expect(findFreeSpot([{ x: 0, y: 0, w: 300, h: 300 }], { w: 100, h: 100 }, { width: 300, height: 300, grid: 20 })).toEqual({ x: 0, y: 0 })
  })

  it('default layout has 24 tables inside the default floor', () => {
    const t = defaultTables()
    expect(t).toHaveLength(24)
    expect(new Set(t.map((x) => x.name)).size).toBe(24)
    for (const x of t) expect(clampToFloor(x, floor)).toEqual(x)
  })
})

describe('exports', () => {
  it('normalises import headers so old and new files both work', () => {
    expect(normHeader('Low Stock')).toBe('lowstock')
    expect(normHeader('lowStock')).toBe('lowstock')
    expect(normHeader('Available At')).toBe('availableat')
  })

  it('builds an Excel money format with the shop currency', () => {
    expect(moneyFormat('USD', 'en-US')).toBe('"$"#,##0.00')
    expect(moneyFormat('IDR', 'id-ID')).toBe('"Rp"#,##0')
  })

  it('turns an order into a clean row', () => {
    const o = {
      number: 'BP-000001',
      createdAt: '2026-11-24 15:58:12',
      status: 'completed',
      paid: true,
      paymentMethod: 'cash',
      tableNo: 'A1',
      customer: 'Mia',
      cashierName: 'Sam',
      items: [
        { productId: 1, name: 'Croissant', price: 340, qty: 2, note: null },
        { productId: 2, name: 'Donut', price: 190, qty: 1, note: null }
      ],
      subtotal: 870,
      discount: 0,
      tax: 87,
      total: 957
    } as unknown as Order
    expect(orderRow(o, 'en')).toMatchObject({ date: '2026-11-24', time: '15:58', status: 'Completed', payment: 'Cash', items: '2× Croissant, 1× Donut', total: 9.57 })
    expect(orderRow(o, 'id')).toMatchObject({ status: 'Selesai', payment: 'Tunai' })
    expect(orderRow({ ...o, paid: false } as Order, 'en').payment).toBe('Unpaid')
  })
})
