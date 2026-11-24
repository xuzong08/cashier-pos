import Database from 'better-sqlite3'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { ean13CheckDigit } from '@shared/cart'
import { defaultTables } from '@shared/floor'

export type DB = Database.Database

/** Each entry runs once; PRAGMA user_version tracks progress. Append only, never edit. */
const MIGRATIONS: (string | ((db: DB) => void))[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','cashier')),
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    photo TEXT,
    emoji TEXT NOT NULL DEFAULT '🍽️',
    stock INTEGER NOT NULL DEFAULT 0,
    low_stock INTEGER NOT NULL DEFAULT 5,
    barcode TEXT UNIQUE,
    available_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE promos (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
    value INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    number TEXT,
    status TEXT NOT NULL,
    table_no TEXT,
    customer TEXT,
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL,
    tax INTEGER NOT NULL,
    total INTEGER NOT NULL,
    promo_code TEXT,
    payment_method TEXT,
    paid INTEGER NOT NULL DEFAULT 0,
    tendered INTEGER,
    change_due INTEGER,
    cashier_id INTEGER,
    cashier_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    paid_at TEXT,
    refunded_at TEXT
  );
  CREATE INDEX orders_created ON orders(created_at);
  CREATE INDEX orders_status ON orders(status);
  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    note TEXT
  );
  CREATE INDEX order_items_order ON order_items(order_id);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE z_reports (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  `,
  // 2: dining tables with floor-plan positions, seeded with the old fixed A1-C8 layout
  (db) => {
    db.exec(`
    CREATE TABLE dining_tables (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      zone TEXT NOT NULL DEFAULT '',
      x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL,
      shape TEXT NOT NULL CHECK (shape IN ('round','square')),
      seats INTEGER NOT NULL DEFAULT 4,
      active INTEGER NOT NULL DEFAULT 1
    );`)
    const ins = db.prepare('INSERT INTO dining_tables (name, zone, x, y, w, h, shape, seats) VALUES (?,?,?,?,?,?,?,?)')
    for (const t of defaultTables()) ins.run(t.name, t.zone, t.x, t.y, t.w, t.h, t.shape, t.seats)
  },
  // 3: dine-in vs take-away
  "ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'dine_in' CHECK (order_type IN ('dine_in','takeaway'));"
]

export function openDb(file: string): DB {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  if ((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n === 0) seed(db)
  return db
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      const m = MIGRATIONS[v]
      if (typeof m === 'string') db.exec(m)
      else m(db)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export function hashPin(pin: string, salt = randomBytes(16).toString('hex')): { hash: string; salt: string } {
  return { hash: scryptSync(pin, salt, 32).toString('hex'), salt }
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  const a = Buffer.from(hashPin(pin, salt).hash, 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** In-store EAN-13 range (prefix 200). */
export function seedBarcode(n: number): string {
  const first12 = '200' + String(n).padStart(9, '0')
  return first12 + ean13CheckDigit(first12)
}

const CATEGORIES: [string, string, string, string][] = [
  // name, tag, lucide icon, color key
  ['Breads', 'Bread', 'Wheat', 'amber'],
  ['Cakes', 'Cake', 'CakeSlice', 'pink'],
  ['Donuts', 'Donut', 'Donut', 'violet'],
  ['Pastries', 'Pastry', 'Croissant', 'orange'],
  ['Sandwich', 'Sandwich', 'Sandwich', 'green'],
  ['Tarts', 'Tart', 'Cookie', 'rose'],
  ['Meals', 'Meal', 'Soup', 'sky']
]

// name, price (cents), category index, emoji, stock, availableAt
const PRODUCTS: [string, number, number, string, number, string | null][] = [
  ['Sourdough Loaf', 650, 0, '🍞', 24, null],
  ['French Baguette', 320, 0, '🥖', 40, null],
  ['Multigrain Bread', 580, 0, '🍞', 18, null],
  ['Butter Brioche', 490, 0, '🍞', 4, null],
  ['Sesame Bagel', 240, 0, '🥯', 35, null],
  ['Red Velvet Slice', 480, 1, '🍰', 16, null],
  ['Chocolate Fudge Cake', 520, 1, '🎂', 12, null],
  ['New York Cheesecake', 550, 1, '🍰', 10, null],
  ['Carrot Cake', 460, 1, '🍰', 0, '15:00'],
  ['Vanilla Cupcake', 310, 1, '🧁', 30, null],
  ['Glazed Donut', 190, 2, '🍩', 60, null],
  ['Choco Sprinkle Donut', 230, 2, '🍩', 45, null],
  ['Strawberry Donut', 230, 2, '🍩', 3, null],
  ['Boston Cream Donut', 260, 2, '🍩', 0, '14:00'],
  ['Butter Croissant', 340, 3, '🥐', 50, null],
  ['Pain au Chocolat', 380, 3, '🥐', 32, null],
  ['Almond Croissant', 420, 3, '🥐', 20, null],
  ['Cinnamon Roll', 360, 3, '🌀', 22, null],
  ['Soft Pretzel', 280, 3, '🥨', 25, null],
  ['Apple Danish', 350, 3, '🍏', 14, null],
  ['Club Sandwich', 790, 4, '🥪', 15, null],
  ['Tuna Melt', 690, 4, '🥪', 12, null],
  ['Egg & Cheese Croissant', 620, 4, '🥐', 18, null],
  ['Veggie Wrap', 650, 4, '🌯', 10, null],
  ['Lemon Tart', 440, 5, '🍋', 14, null],
  ['Fruit Tart', 490, 5, '🥧', 9, null],
  ['Portuguese Egg Tart', 220, 5, '🥧', 40, null],
  ['Pecan Pie Slice', 470, 5, '🥧', 0, 'Tomorrow 07:00'],
  ['Chicken Pesto Pasta', 1150, 6, '🍝', 20, null],
  ['Caesar Salad', 890, 6, '🥗', 15, null],
  ['Tomato Soup & Bread', 750, 6, '🍲', 18, null]
]


function seed(db: DB): void {
  db.transaction(() => {
    const u = db.prepare('INSERT INTO users (name, role, pin_hash, pin_salt) VALUES (?, ?, ?, ?)')
    const a = hashPin('1234')
    u.run('Jordan Lee', 'admin', a.hash, a.salt)
    const c = hashPin('0000')
    u.run('Sam Rivera', 'cashier', c.hash, c.salt)

    const ci = db.prepare('INSERT INTO categories (name, tag, icon, color, sort) VALUES (?, ?, ?, ?, ?)')
    const catIds = CATEGORIES.map((cat, i) => Number(ci.run(...cat, i).lastInsertRowid))

    const pi = db.prepare(
      'INSERT INTO products (name, price, category_id, emoji, stock, low_stock, barcode, available_at) VALUES (?, ?, ?, ?, ?, 5, ?, ?)'
    )
    PRODUCTS.forEach(([name, price, cat, emoji, stock, avail], i) =>
      pi.run(name, price, catIds[cat], emoji, stock, seedBarcode(i + 1), avail)
    )

    db.prepare('INSERT INTO promos (code, type, value) VALUES (?, ?, ?)').run('SWEET10', 'percent', 10)
    db.prepare('INSERT INTO promos (code, type, value) VALUES (?, ?, ?)').run('BITE5', 'fixed', 500)
  })()
}

