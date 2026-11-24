import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Order } from '@shared/types'
import { exportOrders } from '../../src/main/io'

const order = (n: number, status: Order['status'], total: number): Order =>
  ({
    id: n,
    number: `BP-00000${n}`,
    status,
    tableNo: 'A1',
    orderType: n === 3 ? 'takeaway' : 'dine_in',
    customer: n === 2 ? '=HYPERLINK("x")' : 'Mia',
    items: [{ productId: 1, name: 'Croissant', price: total, qty: 1, note: null }],
    subtotal: total,
    discount: 0,
    tax: 0,
    total,
    promoCode: null,
    paymentMethod: 'cash',
    paid: true,
    tendered: total,
    change: 0,
    cashierId: 1,
    cashierName: 'Sam',
    createdAt: '2026-11-24 09:05:00',
    paidAt: '2026-11-24 09:05:00'
  }) as Order

const orders = [order(1, 'completed', 1000), order(2, 'refunded', 500), order(3, 'completed', 250)]
const dir = mkdtempSync(join(tmpdir(), 'cashier-export-'))

describe('order export', () => {
  it('writes a styled Excel sheet with currency format and a totals row', async () => {
    const file = join(dir, 'o.xlsx')
    await exportOrders(orders, file, 'xlsx', DEFAULT_SETTINGS, { from: '2026-11-24', to: '2026-11-24' })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.worksheets[0]
    expect(ws.getCell('A1').value).toBe(DEFAULT_SETTINGS.storeName)
    expect(ws.getCell('A3').value).toBe('Order No')
    expect((ws.getCell('A3').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF0B6B63')
    expect(ws.getCell('D4').value).toBe('Dine in')
    expect(ws.getCell('D6').value).toBe('Take away')
    expect(ws.getCell('N4').numFmt).toBe('"$"#,##0.00')
    expect(ws.getCell('N4').value).toBe(10)
    const total = ws.getRow(7)
    expect(total.getCell(1).value).toBe('TOTAL')
    expect((total.getCell(14).value as ExcelJS.CellFormulaValue).formula).toBe('SUMIF(E4:E6,"<>Refunded",N4:N6)')
  })

  it('writes a tidy CSV that Excel opens safely', async () => {
    const file = join(dir, 'o.csv')
    await exportOrders(orders, file, 'csv', { ...DEFAULT_SETTINGS, language: 'id' }, { from: '2026-11-24', to: '2026-11-24' })
    const text = readFileSync(file, 'utf8')
    const lines = text.replace(/^﻿/, '').trim().split('\r\n')
    expect(lines[0]).toBe('No. Pesanan,Tanggal,Jam,Tipe,Status,Pembayaran,Meja,Pelanggan,Kasir,Item,Subtotal,Diskon,Pajak,Total')
    expect(lines[1]).toBe('BP-000001,2026-11-24,09:05,Makan di tempat,Selesai,Tunai,A1,Mia,Sam,1× Croissant,10.00,0.00,0.00,10.00')
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`) // formula injection neutralised
  })
})
