import ExcelJS from 'exceljs'
import { writeFile } from 'node:fs/promises'
import type { ImportReport } from '@shared/ipc'
import { tr, translate } from '@shared/i18n'
import type { Order, Product, Settings } from '@shared/types'
import type { Repo } from './repo'

const TEAL = 'FF0B6B63'
const ZEBRA = 'FFF4F4F0'
const TOTAL_FILL = 'FFFFF4D4'

/** Excel number format showing the shop currency symbol, e.g. "$"#,##0.00 or "Rp"#,##0. */
export function moneyFormat(currency: string, locale: string): string {
  const nf = new Intl.NumberFormat(locale, { style: 'currency', currency })
  const sym = nf.formatToParts(0).find((p) => p.type === 'currency')?.value ?? ''
  const dec = nf.resolvedOptions().maximumFractionDigits ?? 2
  return `"${sym.replace(/"/g, '')}"#,##0${dec ? '.' + '0'.repeat(dec) : ''}`
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 24
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } }
    c.alignment = { vertical: 'middle', horizontal: 'left' }
  })
}

function zebra(ws: ExcelJS.Worksheet, from: number, to: number, cols: number): void {
  for (let r = from; r <= to; r++) {
    if ((r - from) % 2 === 1)
      for (let c = 1; c <= cols; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
  }
}

// Import accepts the friendly headers below and older machine keys ("lowStock") alike.
export const normHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, '')

const PRODUCT_COLUMNS = [
  { header: 'Barcode', key: 'barcode', width: 18 },
  { header: 'Name', key: 'name', width: 30 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Category', key: 'category', width: 16 },
  { header: 'Stock', key: 'stock', width: 10 },
  { header: 'Low Stock', key: 'lowStock', width: 11 },
  { header: 'Emoji', key: 'emoji', width: 8 },
  { header: 'Available At', key: 'availableAt', width: 16 }
]

export async function exportProducts(repo: Repo, file: string, format: 'csv' | 'xlsx'): Promise<void> {
  const s = repo.settings()
  const cats = new Map(repo.categories().map((c) => [c.id, c.name]))
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = PRODUCT_COLUMNS
  for (const p of repo.products()) {
    ws.addRow({
      barcode: p.barcode ?? '',
      name: p.name,
      price: p.price / 100,
      category: cats.get(p.categoryId) ?? '',
      stock: p.stock,
      lowStock: p.lowStock,
      emoji: p.emoji,
      availableAt: p.availableAt ?? ''
    })
  }
  if (format === 'csv') {
    ws.getColumn('price').numFmt = '0.00'
    return void (await wb.csv.writeFile(file, { formatterOptions: { writeBOM: true } }))
  }
  styleHeader(ws.getRow(1))
  ws.getColumn('price').numFmt = moneyFormat(s.currency, s.locale)
  ws.getColumn('barcode').numFmt = '@' // keep long barcodes as text, not 2E+12
  ws.autoFilter = { from: 'A1', to: { row: 1, column: PRODUCT_COLUMNS.length } }
  zebra(ws, 2, ws.rowCount, PRODUCT_COLUMNS.length)
  await wb.xlsx.writeFile(file)
}

const cell = (v: ExcelJS.CellValue): string => {
  if (v == null) return ''
  if (typeof v === 'object' && 'text' in v) return String(v.text)
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '')
  return String(v).trim()
}

/** Upserts by barcode, then by exact name. Rows with errors are skipped and reported. */
export async function importProducts(repo: Repo, file: string): Promise<ImportReport> {
  const wb = new ExcelJS.Workbook()
  const ws = file.toLowerCase().endsWith('.csv') ? await wb.csv.readFile(file) : (await wb.xlsx.readFile(file), wb.worksheets[0])
  if (!ws) throw new Error('The file has no sheets')

  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).map((v) => normHeader(cell(v)))
  const col = (name: string): number => header.indexOf(normHeader(name))
  if (col('name') < 0 || col('price') < 0) throw new Error('Missing required columns: name, price')

  const existing = repo.products()
  const report: ImportReport = { created: 0, updated: 0, skipped: [] }
  const fallbackCat = repo.categories()[0]?.id

  ws.eachRow((row, n) => {
    if (n === 1) return
    const get = (k: string): string => (col(k) > 0 ? cell(row.getCell(col(k)).value) : '')
    const name = get('name')
    const price = Math.round(parseFloat(get('price').replace(',', '.')) * 100)
    if (!name) return report.skipped.push({ row: n, reason: 'name is empty' })
    if (!Number.isFinite(price) || price < 0) return report.skipped.push({ row: n, reason: 'price is not a number' })
    const barcode = get('barcode') || null
    const catId = (get('category') && repo.categoryIdByName(get('category'))) || fallbackCat
    const match: Product | undefined =
      (barcode ? existing.find((p) => p.barcode === barcode) : undefined) ?? existing.find((p) => p.name === name)
    const stock = parseInt(get('stock'), 10)
    const low = parseInt(get('lowstock'), 10)
    try {
      repo.saveProduct({
        id: match?.id,
        name,
        price,
        categoryId: catId,
        photo: match?.photo ?? null,
        emoji: get('emoji') || match?.emoji || '🍽️',
        stock: Number.isFinite(stock) ? stock : (match?.stock ?? 0),
        lowStock: Number.isFinite(low) ? low : (match?.lowStock ?? 5),
        barcode,
        availableAt: get('availableat') || null
      })
      if (match) report.updated++
      else report.created++
    } catch (e) {
      report.skipped.push({ row: n, reason: (e as Error).message })
    }
  })
  return report
}

const csvCell = (v: unknown): string => {
  const s = String(v ?? '')
  // leading =+-@ would run as a formula when opened in Excel
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const STATUS_LABEL: Record<Order['status'], string> = {
  in_progress: 'In Progress',
  ready: 'Ready',
  completed: 'Completed',
  held: 'On Hold',
  refunded: 'Refunded'
}
const METHOD_LABEL = { cash: 'Cash', card: 'Card', qr: 'QR' } as const

/** One clean, human-readable row per order (labels in the station language). */
export function orderRow(o: Order, lang: Settings['language']) {
  const t = (k: string): string => translate(lang, k)
  const [date, time] = o.createdAt.split(' ')
  return {
    number: o.number,
    date,
    time: time.slice(0, 5),
    type: t(o.orderType === 'takeaway' ? 'Take away' : 'Dine in'),
    status: t(STATUS_LABEL[o.status]),
    payment: o.paid && o.paymentMethod ? t(METHOD_LABEL[o.paymentMethod]) : t('Unpaid'),
    table: o.tableNo ?? '',
    customer: o.customer ?? '',
    cashier: o.cashierName ?? '',
    items: o.items.map((i) => `${i.qty}× ${i.name}`).join(', '),
    subtotal: o.subtotal / 100,
    discount: o.discount / 100,
    tax: o.tax / 100,
    total: o.total / 100
  }
}

const ORDER_COLUMNS = [
  { header: tr('Order No'), key: 'number', width: 13 },
  { header: tr('Date'), key: 'date', width: 12 },
  { header: tr('Time'), key: 'time', width: 8 },
  { header: tr('Type'), key: 'type', width: 11 },
  { header: tr('Status'), key: 'status', width: 13 },
  { header: tr('Payment'), key: 'payment', width: 11 },
  { header: tr('Table'), key: 'table', width: 8 },
  { header: tr('Customer'), key: 'customer', width: 18 },
  { header: tr('Cashier'), key: 'cashier', width: 16 },
  { header: tr('Items'), key: 'items', width: 46 },
  { header: tr('Subtotal'), key: 'subtotal', width: 12 },
  { header: tr('Discount'), key: 'discount', width: 12 },
  { header: tr('Tax'), key: 'tax', width: 11 },
  { header: tr('Total'), key: 'total', width: 13 }
] as const
const MONEY_KEYS = ['subtotal', 'discount', 'tax', 'total'] as const

export async function exportOrders(
  orders: Order[],
  file: string,
  format: 'csv' | 'xlsx',
  s: Settings,
  range: { from: string; to: string }
): Promise<void> {
  const t = (k: string, v?: Record<string, string | number>): string => translate(s.language, k, v)
  const rows = orders.map((o) => orderRow(o, s.language))

  if (format === 'csv') {
    const head = ORDER_COLUMNS.map((c) => csvCell(t(c.header))).join(',')
    const lines = rows.map((r) =>
      ORDER_COLUMNS.map((c) => {
        const v = r[c.key]
        return csvCell(typeof v === 'number' ? v.toFixed(2) : v)
      }).join(',')
    )
    await writeFile(file, '﻿' + [head, ...lines].join('\r\n') + '\r\n', 'utf8')
    return
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(t('Orders'), { views: [{ state: 'frozen', ySplit: 3 }] })
  const n = ORDER_COLUMNS.length
  ws.columns = ORDER_COLUMNS.map((c) => ({ key: c.key, width: c.width }))

  ws.mergeCells(1, 1, 1, n)
  ws.getCell(1, 1).value = s.storeName
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: TEAL } }
  ws.getRow(1).height = 26
  ws.mergeCells(2, 1, 2, n)
  ws.getCell(2, 1).value = t('Orders {from} to {to} · {count} orders', { from: range.from, to: range.to, count: rows.length })
  ws.getCell(2, 1).font = { color: { argb: 'FF8A918E' } }

  const header = ws.getRow(3)
  header.values = ORDER_COLUMNS.map((c) => t(c.header))
  styleHeader(header)
  for (const r of rows) {
    const row = ws.addRow(r)
    if (r.status === t('Refunded')) row.font = { color: { argb: 'FFE11D48' } }
  }
  const first = 4
  const last = ws.rowCount
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: n } }
  zebra(ws, first, last, n)
  ws.getColumn('items').alignment = { wrapText: true, vertical: 'top' }
  const money = moneyFormat(s.currency, s.locale)
  for (const k of MONEY_KEYS) ws.getColumn(k).numFmt = money

  if (rows.length) {
    // totals leave refunded orders out, matching the Accounting screen
    const statusCol = ws.getColumn('status').letter
    const total = ws.addRow({ number: t('TOTAL'), items: t('{n} orders, refunds excluded', { n: rows.length }) })
    for (const k of MONEY_KEYS) {
      const L = ws.getColumn(k).letter
      total.getCell(k).value = { formula: `SUMIF(${statusCol}${first}:${statusCol}${last},"<>${t('Refunded')}",${L}${first}:${L}${last})` }
    }
    total.font = { bold: true }
    total.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }
      c.border = { top: { style: 'medium', color: { argb: TEAL } } }
    })
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  await wb.xlsx.writeFile(file)
}
