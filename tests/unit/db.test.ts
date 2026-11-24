import { describe, expect, it } from 'vitest'
import { openDb } from '../../src/main/db'
import { Repo } from '../../src/main/repo'

describe('fresh database', () => {
  it('starts with products and tables but no orders', () => {
    const repo = new Repo(openDb(':memory:'))
    expect(repo.products().length).toBeGreaterThan(20)
    expect(repo.tables()).toHaveLength(24)
    expect(repo.orders({ status: 'all' })).toEqual([])
    expect(repo.dashboard().popular).toEqual([])
  })

  it('clearOrders removes orders but keeps products and stock', () => {
    const repo = new Repo(openDb(':memory:'))
    const p = repo.products().find((x) => x.stock > 2)!
    repo.placeOrder({ lines: [{ productId: p.id, qty: 2 }], payment: { method: 'card' } }, null)
    expect(repo.orders({ status: 'all' })).toHaveLength(1)
    expect(repo.clearOrders()).toBe(1)
    expect(repo.orders({ status: 'all' })).toEqual([])
    expect(repo.product(p.id)!.stock).toBe(p.stock - 2)
  })
})
