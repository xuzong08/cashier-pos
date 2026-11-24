import { computeChange, computeTotals } from '@shared/cart'
import {
  DEFAULT_SETTINGS,
  type Category,
  type DiningTable,
  type DiningTableInput,
  type DashboardStats,
  type Order,
  type OrderQuery,
  type OrderStatus,
  type PayInput,
  type PaymentMethod,
  type PlaceOrderInput,
  type Product,
  type ProductInput,
  type Promo,
  type SalesSummary,
  type Settings,
  type User
} from '@shared/types'
import { hashPin, verifyPin, type DB } from './db'

/** Thrown for user-facing failures. `message` is an i18n key (English text); vars fill its {placeholders}. */
export class UserError extends Error {
  constructor(
    message: string,
    public vars?: Record<string, string | number>
  ) {
    super(message)
  }
}

type Row = Record<string, unknown>

const toProduct = (r: Row): Product => ({
  id: r.id as number,
  name: r.name as string,
  price: r.price as number,
  categoryId: r.category_id as number,
  photo: (r.photo as string) ?? null,
  emoji: r.emoji as string,
  stock: r.stock as number,
  lowStock: r.low_stock as number,
  barcode: (r.barcode as string) ?? null,
  availableAt: (r.available_at as string) ?? null,
  active: !!r.active
})

const toPromo = (r: Row): Promo => ({
  id: r.id as number,
  code: r.code as string,
  type: r.type as Promo['type'],
  value: r.value as number,
  active: !!r.active
})

export class Repo {
  constructor(private db: DB) {}

  // ---------- users ----------
  users(): User[] {
    return this.db.prepare('SELECT id, name, role FROM users ORDER BY role, name').all() as User[]
  }

  login(userId: number, pin: string): User {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Row | undefined
    if (!r || !verifyPin(pin, r.pin_hash as string, r.pin_salt as string)) throw new UserError('Wrong PIN')
    return { id: r.id as number, name: r.name as string, role: r.role as User['role'] }
  }

  saveUser(u: { id?: number; name: string; role: User['role']; pin?: string }): User {
    if (u.id) {
      this.db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(u.name, u.role, u.id)
      if (u.pin) {
        const h = hashPin(u.pin)
        this.db.prepare('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?').run(h.hash, h.salt, u.id)
      }
      this.assertAdminExists()
      return { id: u.id, name: u.name, role: u.role }
    }
    if (!u.pin) throw new UserError('PIN is required for a new user')
    const h = hashPin(u.pin)
    const id = Number(
      this.db.prepare('INSERT INTO users (name, role, pin_hash, pin_salt) VALUES (?, ?, ?, ?)').run(u.name, u.role, h.hash, h.salt)
        .lastInsertRowid
    )
    return { id, name: u.name, role: u.role }
  }

  deleteUser(id: number): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM users WHERE id = ?').run(id)
      this.assertAdminExists()
    })()
  }

  private assertAdminExists(): void {
    const n = (this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n
    if (n === 0) throw new UserError('At least one Admin must remain')
  }

  // ---------- catalog ----------
  categories(): Category[] {
    return this.db.prepare('SELECT id, name, tag, icon, color FROM categories ORDER BY sort, id').all() as Category[]
  }

  saveCategory(cat: Omit<Category, 'id'> & { id?: number }): Category {
    const clash = this.db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id IS NOT ?').get(cat.name.trim(), cat.id ?? null)
    if (clash) throw new UserError('Category "{name}" already exists', { name: cat.name.trim() })
    const vals = [cat.name.trim(), cat.tag.trim() || cat.name.trim(), cat.icon, cat.color]
    if (cat.id) {
      this.db.prepare('UPDATE categories SET name=?, tag=?, icon=?, color=? WHERE id=?').run(...vals, cat.id)
      return { ...cat, id: cat.id }
    }
    const sort = (this.db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 n FROM categories').get() as { n: number }).n
    const id = Number(this.db.prepare('INSERT INTO categories (name, tag, icon, color, sort) VALUES (?,?,?,?,?)').run(...vals, sort).lastInsertRowid)
    return { ...cat, id }
  }

  deleteCategory(id: number): void {
    const n = (this.db.prepare('SELECT COUNT(*) n FROM products WHERE category_id = ? AND active = 1').get(id) as { n: number }).n
    if (n) throw new UserError('Move its {n} product(s) to another category first', { n })
    // deleted products keep a reference for history, so park them on the first remaining category
    const other = this.db.prepare('SELECT id FROM categories WHERE id != ? ORDER BY sort LIMIT 1').get(id) as { id: number } | undefined
    if (!other) throw new UserError('At least one category must remain')
    this.db.transaction(() => {
      this.db.prepare('UPDATE products SET category_id = ? WHERE category_id = ?').run(other.id, id)
      this.db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    })()
  }

  // ---------- dining tables ----------
  tables(): DiningTable[] {
    return this.db.prepare('SELECT id, name, zone, x, y, w, h, shape, seats FROM dining_tables WHERE active = 1 ORDER BY zone, name').all() as DiningTable[]
  }

  saveTable(t: DiningTableInput): DiningTable {
    const name = t.name.trim().toUpperCase()
    const clash = this.db.prepare('SELECT id FROM dining_tables WHERE name = ? AND id IS NOT ?').get(name, t.id ?? null) as { id: number } | undefined
    if (clash) {
      // a soft-deleted table with that name is simply brought back
      const gone = this.db.prepare('SELECT id FROM dining_tables WHERE id = ? AND active = 0').get(clash.id)
      if (!gone || t.id) throw new UserError('Table {name} already exists', { name })
      t = { ...t, id: clash.id }
    }
    const vals = [name, t.zone.trim(), Math.round(t.x), Math.round(t.y), Math.round(t.w), Math.round(t.h), t.shape, t.seats]
    if (t.id) {
      this.db.prepare('UPDATE dining_tables SET name=?, zone=?, x=?, y=?, w=?, h=?, shape=?, seats=?, active=1 WHERE id=?').run(...vals, t.id)
      return { ...t, name, id: t.id }
    }
    const id = Number(this.db.prepare('INSERT INTO dining_tables (name, zone, x, y, w, h, shape, seats) VALUES (?,?,?,?,?,?,?,?)').run(...vals).lastInsertRowid)
    return { ...t, name, id }
  }

  deleteTable(id: number): void {
    const t = this.db.prepare('SELECT name FROM dining_tables WHERE id = ?').get(id) as { name: string } | undefined
    if (!t) return
    const open = this.db
      .prepare("SELECT COUNT(*) n FROM orders WHERE table_no = ? COLLATE NOCASE AND (status IN ('in_progress','ready') OR (paid = 0 AND status NOT IN ('held','refunded')))")
      .get(t.name) as { n: number }
    if (open.n) throw new UserError('Table {name} has an open order', { name: t.name })
    this.db.prepare('UPDATE dining_tables SET active = 0 WHERE id = ?').run(id)
  }


  categoryIdByName(name: string): number | null {
    const r = this.db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE OR tag = ? COLLATE NOCASE').get(name, name) as
      | { id: number }
      | undefined
    return r?.id ?? null
  }

  products(): Product[] {
    return (this.db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all() as Row[]).map(toProduct)
  }

  product(id: number): Product | null {
    const r = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Row | undefined
    return r ? toProduct(r) : null
  }

  productByBarcode(code: string): Product | null {
    const r = this.db.prepare('SELECT * FROM products WHERE barcode = ? AND active = 1').get(code) as Row | undefined
    return r ? toProduct(r) : null
  }

  saveProduct(p: ProductInput): Product {
    const barcode = p.barcode?.trim() || null
    if (barcode) {
      const clash = this.db.prepare('SELECT id, name FROM products WHERE barcode = ? AND id IS NOT ?').get(barcode, p.id ?? null) as
        | { id: number; name: string }
        | undefined
      if (clash) throw new UserError('Barcode already used by "{name}"', { name: clash.name })
    }
    const vals = [p.name.trim(), p.price, p.categoryId, p.photo, p.emoji || '🍽️', p.stock, p.lowStock, barcode, p.availableAt || null]
    if (p.id) {
      this.db
        .prepare(
          `UPDATE products SET name=?, price=?, category_id=?, photo=?, emoji=?, stock=?, low_stock=?, barcode=?, available_at=?, active=1
           WHERE id=?`
        )
        .run(...vals, p.id)
      return this.product(p.id)!
    }
    const id = Number(
      this.db
        .prepare(
          'INSERT INTO products (name, price, category_id, photo, emoji, stock, low_stock, barcode, available_at) VALUES (?,?,?,?,?,?,?,?,?)'
        )
        .run(...vals).lastInsertRowid
    )
    return this.product(id)!
  }

  /** Soft delete keeps order history intact; barcode is freed for reuse. */
  deleteProduct(id: number): void {
    this.db.prepare('UPDATE products SET active = 0, barcode = NULL WHERE id = ?').run(id)
  }

  // ---------- promos ----------
  promos(): Promo[] {
    return (this.db.prepare('SELECT * FROM promos ORDER BY code').all() as Row[]).map(toPromo)
  }

  findPromo(code: string): Promo | null {
    const r = this.db.prepare('SELECT * FROM promos WHERE code = ? AND active = 1').get(code.trim()) as Row | undefined
    return r ? toPromo(r) : null
  }

  savePromo(p: Omit<Promo, 'id'> & { id?: number }): Promo {
    const code = p.code.trim().toUpperCase()
    if (p.id) {
      this.db.prepare('UPDATE promos SET code=?, type=?, value=?, active=? WHERE id=?').run(code, p.type, p.value, p.active ? 1 : 0, p.id)
      return { ...p, code, id: p.id }
    }
    try {
      const id = Number(
        this.db.prepare('INSERT INTO promos (code, type, value, active) VALUES (?,?,?,?)').run(code, p.type, p.value, p.active ? 1 : 0)
          .lastInsertRowid
      )
      return { ...p, code, id }
    } catch {
      throw new UserError('Promo code {code} already exists', { code })
    }
  }

  deletePromo(id: number): void {
    this.db.prepare('DELETE FROM promos WHERE id = ?').run(id)
  }

  // ---------- settings ----------
  settings(): Settings {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined
    return { ...DEFAULT_SETTINGS, ...(r ? (JSON.parse(r.value) as Partial<Settings>) : {}) }
  }

  saveSettings(patch: Partial<Settings>): Settings {
    const next = { ...this.settings(), ...patch }
    this.db.prepare("INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
      JSON.stringify(next)
    )
    return next
  }

  // ---------- orders ----------
  private orderFromRow(r: Row): Order {
    const items = this.db.prepare('SELECT product_id, name, price, qty, note FROM order_items WHERE order_id = ? ORDER BY id').all(r.id) as Row[]
    return {
      id: r.id as number,
      number: r.number as string,
      status: r.status as OrderStatus,
      tableNo: (r.table_no as string) ?? null,
      orderType: (r.order_type as Order['orderType']) ?? 'dine_in',
      customer: (r.customer as string) ?? null,
      items: items.map((i) => ({
        productId: i.product_id as number,
        name: i.name as string,
        price: i.price as number,
        qty: i.qty as number,
        note: (i.note as string) ?? null
      })),
      subtotal: r.subtotal as number,
      discount: r.discount as number,
      tax: r.tax as number,
      total: r.total as number,
      promoCode: (r.promo_code as string) ?? null,
      paymentMethod: (r.payment_method as PaymentMethod) ?? null,
      paid: !!r.paid,
      tendered: (r.tendered as number) ?? null,
      change: (r.change_due as number) ?? null,
      cashierId: (r.cashier_id as number) ?? null,
      cashierName: (r.cashier_name as string) ?? null,
      createdAt: r.created_at as string,
      paidAt: (r.paid_at as string) ?? null
    }
  }

  order(id: number): Order | null {
    const r = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Row | undefined
    return r ? this.orderFromRow(r) : null
  }

  orders(q: OrderQuery): Order[] {
    const where: string[] = []
    const args: unknown[] = []
    const status = q.status ?? 'all'
    if (status === 'active') where.push("status IN ('in_progress','ready')")
    else if (status === 'unpaid') where.push("paid = 0 AND status NOT IN ('held','refunded')")
    else if (status !== 'all') {
      where.push('status = ?')
      args.push(status)
    } else where.push("status != 'held'")
    if (q.search?.trim()) {
      where.push('(number LIKE ? OR customer LIKE ? OR table_no LIKE ?)')
      const s = `%${q.search.trim()}%`
      args.push(s, s, s)
    }
    if (q.from) {
      where.push('date(created_at) >= ?')
      args.push(q.from)
    }
    if (q.to) {
      where.push('date(created_at) <= ?')
      args.push(q.to)
    }
    args.push(q.limit ?? 200) // IPC validation caps renderer requests at 1000
    const rows = this.db
      .prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`)
      .all(...args) as Row[]
    return rows.map((r) => this.orderFromRow(r))
  }

  /** Prices, stock and totals are always recomputed here; the renderer is not trusted. */
  placeOrder(input: PlaceOrderInput, user: User | null): Order {
    const settings = this.settings()
    return this.db.transaction(() => {
      if (input.heldOrderId) {
        const held = this.db.prepare("SELECT id FROM orders WHERE id = ? AND status = 'held'").get(input.heldOrderId)
        if (held) this.db.prepare('DELETE FROM orders WHERE id = ?').run(input.heldOrderId)
      }
      if (!input.lines.length) throw new UserError('Cart is empty')

      // merge duplicate product lines with the same note
      const lines = input.lines.map((l) => {
        const p = this.product(l.productId)
        if (!p || !p.active) throw new UserError('A product in the cart no longer exists')
        return { p, qty: l.qty, note: l.note?.trim() || null }
      })
      if (!input.hold) {
        const need = new Map<number, number>()
        for (const l of lines) need.set(l.p.id, (need.get(l.p.id) ?? 0) + l.qty)
        for (const [id, qty] of need) {
          const p = lines.find((l) => l.p.id === id)!.p
          if (p.stock < qty) throw new UserError('Only {n} × {name} left in stock', { n: p.stock, name: p.name })
        }
      }

      const promo = input.promoCode ? this.findPromo(input.promoCode) : null
      if (input.promoCode && !promo) throw new UserError('Promo code is not valid')
      const t = computeTotals(
        lines.map((l) => ({ price: l.p.price, qty: l.qty })),
        settings.taxRate,
        promo
      )

      let paid = 0
      let method: PaymentMethod | null = null
      let tendered: number | null = null
      let change: number | null = null
      if (!input.hold && input.payment) {
        method = input.payment.method
        tendered = method === 'cash' ? (input.payment.tendered ?? 0) : t.total
        if (tendered < t.total) throw new UserError('Cash received is less than the total')
        change = computeChange(t.total, tendered)
        paid = 1
      }

      const id = Number(
        this.db
          .prepare(
            `INSERT INTO orders (status, order_type, table_no, customer, subtotal, discount, tax, total, promo_code, payment_method, paid, tendered,
             change_due, cashier_id, cashier_name, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CASE WHEN ? = 1 THEN datetime('now','localtime') END)`
          )
          .run(
            input.hold ? 'held' : 'in_progress',
            input.orderType ?? 'dine_in',
            // take-away orders never hold a table
            input.orderType === 'takeaway' ? null : input.tableNo?.trim() || null,
            input.customer?.trim() || null,
            t.subtotal,
            t.discount,
            t.tax,
            t.total,
            promo?.code ?? null,
            method,
            paid,
            tendered,
            change,
            user?.id ?? null,
            user?.name ?? null,
            paid
          ).lastInsertRowid
      )
      this.db.prepare("UPDATE orders SET number = printf('BP-%06d', id) WHERE id = ?").run(id)
      const ins = this.db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty, note) VALUES (?,?,?,?,?,?)')
      const dec = this.db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
      for (const l of lines) {
        ins.run(id, l.p.id, l.p.name, l.p.price, l.qty, l.note)
        if (!input.hold) dec.run(l.qty, l.p.id)
      }
      return this.order(id)!
    })()
  }

  pay(input: PayInput): Order {
    const o = this.order(input.orderId)
    if (!o) throw new UserError('Order not found')
    if (o.paid) throw new UserError('Order is already paid')
    if (o.status === 'held' || o.status === 'refunded') throw new UserError('This order cannot be paid')
    const tendered = input.method === 'cash' ? (input.tendered ?? 0) : o.total
    if (tendered < o.total) throw new UserError('Cash received is less than the total')
    this.db
      .prepare(
        "UPDATE orders SET paid = 1, payment_method = ?, tendered = ?, change_due = ?, paid_at = datetime('now','localtime') WHERE id = ?"
      )
      .run(input.method, tendered, computeChange(o.total, tendered), o.id)
    return this.order(o.id)!
  }

  setStatus(id: number, status: OrderStatus): Order {
    const o = this.order(id)
    if (!o) throw new UserError('Order not found')
    if (o.status === 'held' || o.status === 'refunded') throw new UserError('Status cannot be changed')
    this.db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id)
    return this.order(id)!
  }

  refund(id: number): Order {
    return this.db.transaction(() => {
      const o = this.order(id)
      if (!o) throw new UserError('Order not found')
      if (!o.paid || o.status === 'refunded') throw new UserError('Only paid orders can be refunded')
      const inc = this.db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
      for (const i of o.items) inc.run(i.qty, i.productId)
      this.db.prepare("UPDATE orders SET status = 'refunded', refunded_at = datetime('now','localtime') WHERE id = ?").run(id)
      return this.order(id)!
    })()
  }

  /** Wipes all orders and day-close reports (e.g. sample data); products, stock and users stay. */
  clearOrders(): number {
    return this.db.transaction(() => {
      const n = (this.db.prepare('SELECT COUNT(*) n FROM orders').get() as { n: number }).n
      this.db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM z_reports;')
      return n
    })()
  }

  deleteHeld(id: number): void {
    this.db.prepare("DELETE FROM orders WHERE id = ? AND status = 'held'").run(id)
  }

  // ---------- stats ----------
  dashboard(): DashboardStats {
    const one = <T>(sql: string, ...a: unknown[]): T => this.db.prepare(sql).get(...a) as T
    const today = one<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE status != 'held' AND date(created_at) = date('now','localtime')").n
    const avg7 = one<{ n: number }>(
      `SELECT COUNT(*) / 7.0 n FROM orders WHERE status != 'held'
       AND date(created_at) BETWEEN date('now','localtime','-7 days') AND date('now','localtime','-1 days')`
    ).n
    const total = one<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE status != 'held'").n
    const thisWeek = one<{ n: number }>(
      "SELECT COUNT(*) n FROM orders WHERE status != 'held' AND date(created_at) > date('now','localtime','-7 days')"
    ).n
    const lastWeek = one<{ n: number }>(
      `SELECT COUNT(*) n FROM orders WHERE status != 'held'
       AND date(created_at) BETWEEN date('now','localtime','-14 days') AND date('now','localtime','-7 days')`
    ).n
    const waiting = one<{ n: number }>("SELECT COUNT(*) n FROM orders WHERE status IN ('in_progress','ready')").n
    // "usual" queue: average orders per opening hour (assume 12h day) over the last week
    const usualQueue = avg7 / 12
    const pct = (now: number, usual: number): number => (usual > 0 ? Math.round(((now - usual) / usual) * 100) : 0)

    const popular = this.db
      .prepare(
        `SELECT p.id productId, p.name, p.emoji, p.photo, SUM(i.qty) count FROM order_items i
         JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
         WHERE o.status NOT IN ('held','refunded') AND date(o.created_at) > date('now','localtime','-30 days') AND p.active = 1
         GROUP BY p.id ORDER BY count DESC LIMIT 5`
      )
      .all() as DashboardStats['popular']
    const outOfStock = this.db
      .prepare('SELECT id, name, available_at availableAt FROM products WHERE active = 1 AND stock <= 0 ORDER BY name')
      .all() as DashboardStats['outOfStock']
    const lowStock = this.db
      .prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock > 0 AND stock <= low_stock ORDER BY stock')
      .all() as DashboardStats['lowStock']

    return {
      newOrders: today,
      newOrdersDelta: pct(today, avg7),
      totalOrders: total,
      totalOrdersDelta: pct(thisWeek, lastWeek),
      waiting,
      waitingDelta: pct(waiting, usualQueue),
      popular,
      outOfStock,
      lowStock
    }
  }

  summary(date: string): SalesSummary {
    const paidRows = this.db
      .prepare("SELECT * FROM orders WHERE paid = 1 AND status != 'refunded' AND date(paid_at) = ?")
      .all(date) as Row[]
    const refunds = (
      this.db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status = 'refunded' AND date(refunded_at) = ?").get(date) as {
        n: number
      }
    ).n
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 }
    let totalSales = 0
    let tax = 0
    let discount = 0
    for (const r of paidRows) {
      totalSales += r.total as number
      tax += r.tax as number
      discount += r.discount as number
      byMethod[r.payment_method as PaymentMethod] += r.total as number
    }
    const topSellers = this.db
      .prepare(
        `SELECT i.name, SUM(i.qty) qty, SUM(i.qty * i.price) revenue FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.paid = 1 AND o.status != 'refunded' AND date(o.paid_at) = ? GROUP BY i.product_id ORDER BY qty DESC LIMIT 10`
      )
      .all(date) as SalesSummary['topSellers']
    return { date, totalSales, orderCount: paidRows.length, refunds, tax, discount, byMethod, topSellers }
  }

  zReport(date: string): SalesSummary {
    const s = this.summary(date)
    this.db.prepare('INSERT INTO z_reports (date, data) VALUES (?, ?)').run(date, JSON.stringify(s))
    return s
  }

  ordersForExport(from: string, to: string): Order[] {
    return this.orders({ from, to, status: 'all', limit: 1_000_000 }).reverse()
  }
}
