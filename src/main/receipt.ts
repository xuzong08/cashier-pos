import { toSVG } from 'bwip-js/node'
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'
import { formatMoney } from '@shared/cart'
import { translate, type Vars } from '@shared/i18n'
import type { Order, SalesSummary, Settings } from '@shared/types'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const METHOD: Record<string, string> = { cash: 'Cash', card: 'Card', qr: 'QR' }

// shortcut: raw ESC/POS prints Chinese labels in English, because most thermal printers need a GB18030 code page
// and a Chinese font for it; switch the printer to "System printer" for fully Chinese receipts, or add GB18030 encoding here.
const escPosLabel =
  (s: Settings) =>
  (k: string, v?: Vars): string =>
    translate(s.language === 'zh' ? 'en' : s.language, k, v)

function codeSvg(kind: Settings['receiptCode'], text: string): string {
  if (kind === 'none') return ''
  try {
    return kind === 'qr'
      ? toSVG({ bcid: 'qrcode', text, scale: 3 })
      : toSVG({ bcid: 'code128', text, scale: 2, height: 10, includetext: true, textxalign: 'center' })
  } catch {
    return ''
  }
}

const CSS = (width: 58 | 80): string => `
  @page { size: ${width}mm auto; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; padding: 3mm ${width === 58 ? 2 : 4}mm; width: ${width}mm; font: ${width === 58 ? 11 : 12}px/1.35 'Courier New', monospace; color: #000 }
  .c { text-align: center } .r { text-align: right } .b { font-weight: 700 }
  .big { font-size: 1.35em } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 }
  table { width: 100%; border-collapse: collapse } td { vertical-align: top; padding: 1px 0 }
  img.logo { max-width: 60%; max-height: 22mm; display: block; margin: 0 auto 4px }
  .code svg { max-width: 70%; height: auto; display: block; margin: 6px auto 0 }
`

export function receiptHtml(o: Order, s: Settings): string {
  const L = (k: string, v?: Vars): string => esc(translate(s.language, k, v))
  const m = (c: number): string => formatMoney(c, s.currency, s.locale)
  const rows = o.items
    .map(
      (i) => `<tr><td colspan="2">${esc(i.name)}${i.note ? `<br><small>  ${esc(i.note)}</small>` : ''}</td></tr>
      <tr><td>&nbsp;&nbsp;${i.qty} x ${m(i.price)}</td><td class="r">${m(i.qty * i.price)}</td></tr>`
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(s.paperWidth)}</style></head><body>
  ${s.receiptLogo ? `<img class="logo" src="${esc(s.receiptLogo)}">` : ''}
  <div class="c b big">${esc(s.storeName)}</div>
  <div class="c">${esc(s.storeAddress)}</div><hr>
  <table>
    <tr><td>${L('Order')}</td><td class="r b">${esc(o.number)}</td></tr>
    <tr><td>${L('Date')}</td><td class="r">${esc(o.paidAt ?? o.createdAt)}</td></tr>
    <tr><td>${L('Cashier')}</td><td class="r">${esc(o.cashierName ?? '-')}</td></tr>
    <tr><td colspan="2" class="b">${o.orderType === 'takeaway' ? L('Take away') : L('Dine in')}</td></tr>
    ${o.tableNo ? `<tr><td>${L('Table')}</td><td class="r">${esc(o.tableNo)}</td></tr>` : ''}
    ${o.customer ? `<tr><td>${L('Customer')}</td><td class="r">${esc(o.customer)}</td></tr>` : ''}
  </table><hr>
  <table>${rows}</table><hr>
  <table>
    <tr><td>${L('Subtotal')}</td><td class="r">${m(o.subtotal)}</td></tr>
    ${o.discount ? `<tr><td>${L('Discount')}${o.promoCode ? ` (${esc(o.promoCode)})` : ''}</td><td class="r">-${m(o.discount)}</td></tr>` : ''}
    <tr><td>${L('Tax ({rate}%)', { rate: s.taxRate })}</td><td class="r">${m(o.tax)}</td></tr>
    <tr class="b big"><td>${L('TOTAL')}</td><td class="r">${m(o.total)}</td></tr>
    ${
      o.paid
        ? `<tr><td>${L('Paid by')}</td><td class="r">${L(METHOD[o.paymentMethod ?? ''] ?? '-')}</td></tr>
           ${o.paymentMethod === 'cash' ? `<tr><td>${L('Cash')}</td><td class="r">${m(o.tendered ?? 0)}</td></tr><tr><td>${L('Change')}</td><td class="r">${m(o.change ?? 0)}</td></tr>` : ''}`
        : `<tr><td colspan="2" class="c b">*** ${L('NOT PAID')} ***</td></tr>`
    }
    ${o.status === 'refunded' ? `<tr><td colspan="2" class="c b">*** ${L('REFUNDED')} ***</td></tr>` : ''}
  </table><hr>
  <div class="c">${esc(s.receiptFooter)}</div>
  <div class="code">${codeSvg(s.receiptCode, o.number)}</div>
  </body></html>`
}

export function zReportHtml(z: SalesSummary, s: Settings): string {
  const L = (k: string, v?: Vars): string => esc(translate(s.language, k, v))
  const m = (c: number): string => formatMoney(c, s.currency, s.locale)
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(s.paperWidth)}</style></head><body>
  <div class="c b big">${esc(s.storeName)}</div><div class="c b">${L('Z REPORT')} · ${esc(z.date)}</div><hr>
  <table>
    <tr><td>${L('Orders')}</td><td class="r">${z.orderCount}</td></tr>
    <tr><td>${L('Cash')}</td><td class="r">${m(z.byMethod.cash)}</td></tr>
    <tr><td>${L('Card')}</td><td class="r">${m(z.byMethod.card)}</td></tr>
    <tr><td>${L('QR')}</td><td class="r">${m(z.byMethod.qr)}</td></tr>
    <tr><td>${L('Discounts')}</td><td class="r">${m(z.discount)}</td></tr>
    <tr><td>${L('Tax')}</td><td class="r">${m(z.tax)}</td></tr>
    <tr><td>${L('Refunds')}</td><td class="r">-${m(z.refunds)}</td></tr>
    <tr class="b big"><td>${L('NET SALES')}</td><td class="r">${m(z.totalSales - z.refunds)}</td></tr>
  </table><hr><div class="b">${L('Top sellers')}</div>
  <table>${z.topSellers.map((t) => `<tr><td>${t.qty} x ${esc(t.name)}</td><td class="r">${m(t.revenue)}</td></tr>`).join('')}</table>
  <hr><div class="c">${L('Printed {time}', { time: esc(new Date().toLocaleString(s.locale)) })}</div></body></html>`
}

function newPrinter(s: Settings): ThermalPrinter {
  // Interface is a placeholder: we only use the library to build the ESC/POS buffer; transports are ours.
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://127.0.0.1:9100',
    width: s.paperWidth === 58 ? 32 : 48,
    characterSet: CharacterSet.PC858_EURO,
    removeSpecialCharacters: true
  })
}

async function addLogo(p: ThermalPrinter, s: Settings): Promise<void> {
  const m = s.receiptLogo?.match(/^data:image\/png;base64,(.+)$/)
  if (!m) return
  try {
    p.alignCenter()
    await p.printImageBuffer(Buffer.from(m[1], 'base64'))
  } catch {
    // logo is optional; a bad image must not block the receipt
  }
}

export async function receiptEscPos(o: Order, s: Settings, opts: { kick?: boolean } = {}): Promise<Buffer> {
  const E = escPosLabel(s)
  const p = newPrinter(s)
  const m = (c: number): string => formatMoney(c, s.currency, s.locale)
  await addLogo(p, s)
  p.alignCenter()
  p.setTextDoubleHeight()
  p.bold(true)
  p.println(s.storeName)
  p.bold(false)
  p.setTextNormal()
  p.println(s.storeAddress)
  p.drawLine()
  p.alignLeft()
  p.leftRight(E('Order'), o.number)
  p.leftRight(E('Date'), o.paidAt ?? o.createdAt)
  p.leftRight(E('Cashier'), o.cashierName ?? '-')
  p.println(o.orderType === 'takeaway' ? E('Take away') : E('Dine in'))
  if (o.tableNo) p.leftRight(E('Table'), o.tableNo)
  if (o.customer) p.leftRight(E('Customer'), o.customer)
  p.drawLine()
  for (const i of o.items) {
    p.println(i.name)
    if (i.note) p.println(`  ${i.note}`)
    p.leftRight(`  ${i.qty} x ${m(i.price)}`, m(i.qty * i.price))
  }
  p.drawLine()
  p.leftRight(E('Subtotal'), m(o.subtotal))
  if (o.discount) p.leftRight(`${E('Discount')}${o.promoCode ? ` ${o.promoCode}` : ''}`, `-${m(o.discount)}`)
  p.leftRight(E('Tax ({rate}%)', { rate: s.taxRate }), m(o.tax))
  p.bold(true)
  p.setTextDoubleHeight()
  p.leftRight(E('TOTAL'), m(o.total))
  p.setTextNormal()
  p.bold(false)
  if (o.paid) {
    p.leftRight(E('Paid by'), E(METHOD[o.paymentMethod ?? ''] ?? '-'))
    if (o.paymentMethod === 'cash') {
      p.leftRight(E('Cash'), m(o.tendered ?? 0))
      p.leftRight(E('Change'), m(o.change ?? 0))
    }
  } else {
    p.alignCenter()
    p.println(`*** ${E('NOT PAID')} ***`)
  }
  if (o.status === 'refunded') {
    p.alignCenter()
    p.println(`*** ${E('REFUNDED')} ***`)
  }
  p.drawLine()
  p.alignCenter()
  p.println(s.receiptFooter)
  if (s.receiptCode === 'qr') p.printQR(o.number, { cellSize: 6, correction: 'M', model: 2 })
  if (s.receiptCode === 'barcode') p.code128(o.number, { width: 'MEDIUM', height: 60, text: 2 } as never)
  p.cut()
  if (opts.kick) p.openCashDrawer()
  return p.getBuffer()
}

export function zReportEscPos(z: SalesSummary, s: Settings): Buffer {
  const E = escPosLabel(s)
  const p = newPrinter(s)
  const m = (c: number): string => formatMoney(c, s.currency, s.locale)
  p.alignCenter()
  p.bold(true)
  p.println(s.storeName)
  p.println(`${E('Z REPORT')} ${z.date}`)
  p.bold(false)
  p.drawLine()
  p.alignLeft()
  p.leftRight(E('Orders'), String(z.orderCount))
  p.leftRight(E('Cash'), m(z.byMethod.cash))
  p.leftRight(E('Card'), m(z.byMethod.card))
  p.leftRight(E('QR'), m(z.byMethod.qr))
  p.leftRight(E('Discounts'), m(z.discount))
  p.leftRight(E('Tax'), m(z.tax))
  p.leftRight(E('Refunds'), `-${m(z.refunds)}`)
  p.bold(true)
  p.leftRight(E('NET SALES'), m(z.totalSales - z.refunds))
  p.bold(false)
  p.drawLine()
  for (const t of z.topSellers) p.leftRight(`${t.qty} x ${t.name}`.slice(0, 30), m(t.revenue))
  p.cut()
  return p.getBuffer()
}

/** ESC p m t1 t2: pulse drawer pin 2 for 50ms on / 500ms off. */
export const DRAWER_KICK = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])

export function testOrder(): Order {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  return {
    id: 0,
    number: 'TEST-0001',
    status: 'completed',
    tableNo: 'A1',
    orderType: 'dine_in',
    customer: 'Test Customer',
    items: [
      { productId: 0, name: 'Butter Croissant', price: 340, qty: 2, note: null },
      { productId: 0, name: 'Glazed Donut', price: 190, qty: 1, note: 'Extra glaze' }
    ],
    subtotal: 870,
    discount: 0,
    tax: 87,
    total: 957,
    promoCode: null,
    paymentMethod: 'cash',
    paid: true,
    tendered: 1000,
    change: 43,
    cashierId: null,
    cashierName: 'Printer test',
    createdAt: now,
    paidAt: now
  }
}
