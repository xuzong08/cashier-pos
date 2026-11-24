// Money is always integer cents. Rates are percent numbers (10 = 10%).

export type Role = 'admin' | 'cashier'

export interface User {
  id: number
  name: string
  role: Role
}

export interface Category {
  id: number
  name: string
  tag: string // singular label on product cards
  icon: string // lucide icon name
  color: string // tag color class key
}

export interface Product {
  id: number
  name: string
  price: number // cents
  categoryId: number
  photo: string | null // data URL
  emoji: string
  stock: number
  lowStock: number // warn at or below this
  barcode: string | null
  availableAt: string | null // free text, e.g. "18:00"
  active: boolean
}

export type ProductInput = Omit<Product, 'id' | 'active'> & { id?: number }

/** Kitchen flow: in_progress -> ready -> completed. Payment is the separate `paid` flag. */
export type OrderStatus = 'held' | 'in_progress' | 'ready' | 'completed' | 'refunded'
export type PaymentMethod = 'cash' | 'card' | 'qr'
export type OrderType = 'dine_in' | 'takeaway'

export interface CartLine {
  productId: number
  name: string
  price: number
  qty: number
  note?: string
}

export interface Promo {
  id: number
  code: string
  type: 'percent' | 'fixed'
  value: number // percent number or cents
  active: boolean
}

export interface Totals {
  subtotal: number
  discount: number
  tax: number
  total: number
  itemCount: number
}

export interface OrderItem {
  productId: number
  name: string
  price: number
  qty: number
  note: string | null
}

export interface Order {
  id: number
  number: string // e.g. BP-000123
  status: OrderStatus
  tableNo: string | null
  orderType: OrderType
  customer: string | null
  items: OrderItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  promoCode: string | null
  paymentMethod: PaymentMethod | null
  paid: boolean
  tendered: number | null
  change: number | null
  cashierId: number | null
  cashierName: string | null
  createdAt: string // ISO
  paidAt: string | null
}

export interface PlaceOrderInput {
  lines: { productId: number; qty: number; note?: string }[]
  tableNo?: string
  orderType?: OrderType
  customer?: string
  promoCode?: string
  hold?: boolean
  payment?: { method: PaymentMethod; tendered?: number }
  /** resume: replaces a held order */
  heldOrderId?: number
}

export interface PayInput {
  orderId: number
  method: PaymentMethod
  tendered?: number
}

export interface OrderQuery {
  search?: string
  status?: OrderStatus | 'all' | 'active' | 'unpaid'
  from?: string // YYYY-MM-DD
  to?: string
  limit?: number
}

export interface DashboardStats {
  newOrders: number
  newOrdersDelta: number
  totalOrders: number
  totalOrdersDelta: number
  waiting: number
  waitingDelta: number
  popular: { productId: number; name: string; emoji: string; photo: string | null; count: number }[]
  outOfStock: { id: number; name: string; availableAt: string | null }[]
  lowStock: { id: number; name: string; stock: number }[]
}

export interface SalesSummary {
  date: string
  totalSales: number
  orderCount: number
  refunds: number
  tax: number
  discount: number
  byMethod: Record<PaymentMethod, number>
  topSellers: { name: string; qty: number; revenue: number }[]
}

export type PrinterConnection = 'usb' | 'network' | 'serial' | 'system'
export type Theme = 'light' | 'dark' | 'system'
export type Language = 'en' | 'id' | 'zh'

export interface DiningTable {
  id: number
  name: string
  zone: string
  /** floor-plan position and size, in floor units (see Settings.floorWidth/Height) */
  x: number
  y: number
  w: number
  h: number
  shape: 'round' | 'square'
  seats: number
}

export type DiningTableInput = Omit<DiningTable, 'id'> & { id?: number }

export interface Settings {
  storeName: string
  storeAddress: string
  receiptFooter: string
  receiptLogo: string | null // data URL
  /** the shop's own payment QR (e.g. Alipay / bank), shown when the customer pays by QR */
  paymentQr: string | null // data URL
  receiptCode: 'none' | 'barcode' | 'qr'
  currency: string
  locale: string
  taxRate: number
  // scanner
  wedgeEnabled: boolean
  wedgeMaxIntervalMs: number
  wedgeMinLength: number
  wedgePrefix: string
  wedgeSuffix: string
  serialEnabled: boolean
  serialPath: string
  serialBaud: number
  serialDataBits: 7 | 8
  serialParity: 'none' | 'even' | 'odd'
  serialTerminator: 'CR' | 'LF' | 'CRLF'
  hidEnabled: boolean
  hidPath: string
  cameraDeviceId: string
  scanBeep: boolean
  // printer
  printerConnection: PrinterConnection
  printerName: string // OS printer for usb/system
  printerHost: string
  printerPort: number
  printerSerialPath: string
  printerBaud: number
  paperWidth: 58 | 80
  autoPrint: boolean
  drawerOnCash: boolean
  // system
  kiosk: boolean
  launchAtStartup: boolean
  customerDisplay: boolean
  autoBackupHours: number
  autoUpdate: boolean
  // appearance (per station)
  theme: Theme
  language: Language
  /** weak PCs: no animations or blur, lighter camera decoding */
  lowPower: boolean
  // floor plan
  floorWidth: number
  floorHeight: number
  floorGrid: number
}

export const DEFAULT_SETTINGS: Settings = {
  storeName: 'BitePoint Bakery',
  storeAddress: '12 Baker Street, Springfield',
  receiptFooter: 'Thank you! See you again soon.',
  receiptLogo: null,
  paymentQr: null,
  receiptCode: 'qr',
  currency: 'USD',
  locale: 'en-US',
  taxRate: 10,
  wedgeEnabled: true,
  wedgeMaxIntervalMs: 35,
  wedgeMinLength: 4,
  wedgePrefix: '',
  wedgeSuffix: '',
  serialEnabled: false,
  serialPath: '',
  serialBaud: 9600,
  serialDataBits: 8,
  serialParity: 'none',
  serialTerminator: 'CR',
  hidEnabled: false,
  hidPath: '',
  cameraDeviceId: '',
  scanBeep: true,
  printerConnection: 'system',
  printerName: '',
  printerHost: '192.168.1.100',
  printerPort: 9100,
  printerSerialPath: '',
  printerBaud: 9600,
  paperWidth: 80,
  autoPrint: false,
  drawerOnCash: true,
  kiosk: false,
  launchAtStartup: false,
  customerDisplay: false,
  autoBackupHours: 6,
  autoUpdate: false,
  theme: 'light',
  language: 'en',
  lowPower: false,
  floorWidth: 1200,
  floorHeight: 800,
  floorGrid: 20
}

export interface PortInfo {
  path: string
  manufacturer?: string
  vendorId?: string
  productId?: string
}

export interface HidInfo {
  path: string
  product?: string
  manufacturer?: string
  vendorId: number
  productId: number
  usagePage?: number
  usage?: number
}

export type DeviceStatus = { state: 'off' | 'connecting' | 'connected' | 'error'; message?: string }

export interface HardwareStatus {
  serial: DeviceStatus
  hid: DeviceStatus
}

export interface CustomerDisplayState {
  lines: CartLine[]
  totals: Totals
  storeName: string
  currency: string
  locale: string
  message?: string
}
