import type {
  Category,
  CustomerDisplayState,
  DashboardStats,
  DiningTable,
  DiningTableInput,
  HardwareStatus,
  HidInfo,
  Order,
  OrderQuery,
  OrderStatus,
  PayInput,
  PlaceOrderInput,
  PortInfo,
  Product,
  ProductInput,
  Promo,
  SalesSummary,
  Settings,
  User
} from './types'

/** Allowed category icons (lucide names) and tag colors; the renderer maps them to components/classes. */
export const CATEGORY_ICONS = ['Wheat', 'CakeSlice', 'Donut', 'Croissant', 'Sandwich', 'Cookie', 'Soup', 'Coffee', 'IceCreamCone', 'Pizza', 'Salad', 'CupSoda', 'Beef', 'Fish', 'Apple', 'Utensils'] as const
export const CATEGORY_COLORS = ['amber', 'pink', 'violet', 'orange', 'green', 'rose', 'sky'] as const

/** Request/response channels (ipcRenderer.invoke / ipcMain.handle). */
export const IPC = {
  authUsers: 'auth:users',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authCurrent: 'auth:current',
  usersSave: 'users:save',
  usersDelete: 'users:delete',

  categoriesList: 'categories:list',
  categoriesSave: 'categories:save',
  categoriesDelete: 'categories:delete',
  tablesList: 'tables:list',
  tablesSave: 'tables:save',
  tablesDelete: 'tables:delete',
  productsList: 'products:list',
  productsSave: 'products:save',
  productsDelete: 'products:delete',
  productsByBarcode: 'products:byBarcode',
  productsExport: 'products:export',
  productsImport: 'products:import',

  promosList: 'promos:list',
  promosSave: 'promos:save',
  promosDelete: 'promos:delete',
  promosFind: 'promos:find',

  ordersPlace: 'orders:place',
  ordersPay: 'orders:pay',
  ordersList: 'orders:list',
  ordersGet: 'orders:get',
  ordersSetStatus: 'orders:setStatus',
  ordersRefund: 'orders:refund',
  ordersDeleteHeld: 'orders:deleteHeld',
  ordersExport: 'orders:export',

  statsDashboard: 'stats:dashboard',
  statsSummary: 'stats:summary',
  statsZReport: 'stats:zreport',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',

  serialList: 'serial:list',
  serialConnect: 'serial:connect',
  serialDisconnect: 'serial:disconnect',
  hidList: 'hid:list',
  hidConnect: 'hid:connect',
  hidDisconnect: 'hid:disconnect',
  hardwareStatus: 'hardware:status',

  printersList: 'print:printers',
  printReceipt: 'print:receipt',
  printTest: 'print:test',
  printZReport: 'print:zreport',
  receiptPdf: 'print:pdf',
  drawerOpen: 'drawer:open',

  backupNow: 'backup:now',
  backupList: 'backup:list',
  backupExport: 'backup:export',
  backupRestore: 'backup:restore',
  ordersClearAll: 'orders:clearAll',

  winMinimize: 'win:minimize',
  winMaximize: 'win:maximize',
  winClose: 'win:close',
  winKiosk: 'win:kiosk',
  displayUpdate: 'display:update',
  appInfo: 'app:info'
} as const

/** Main -> renderer push events. */
export const EVT = {
  scan: 'evt:scan', // { source, code }
  hardwareStatus: 'evt:hardwareStatus',
  displayState: 'evt:displayState',
  kioskChanged: 'evt:kiosk'
} as const

export type ScanSource = 'wedge' | 'serial' | 'hid' | 'camera' | 'manual'
export interface ScanEvent {
  source: ScanSource
  code: string
}

/** Every main-process call returns this so errors reach the UI as data. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface ImportReport {
  created: number
  updated: number
  skipped: { row: number; reason: string }[]
}

/** The API exposed on window.api by the preload script. */
export interface BiteApi {
  auth: {
    users(): Promise<Result<User[]>>
    login(userId: number, pin: string): Promise<Result<User>>
    logout(): Promise<Result<null>>
    current(): Promise<Result<User | null>>
  }
  users: {
    save(u: { id?: number; name: string; role: User['role']; pin?: string }): Promise<Result<User>>
    remove(id: number): Promise<Result<null>>
  }
  categories: {
    list(): Promise<Result<Category[]>>
    save(c: Omit<Category, 'id'> & { id?: number }): Promise<Result<Category>>
    remove(id: number): Promise<Result<null>>
  }
  tables: {
    list(): Promise<Result<DiningTable[]>>
    save(t: DiningTableInput): Promise<Result<DiningTable>>
    remove(id: number): Promise<Result<null>>
  }
  products: {
    list(): Promise<Result<Product[]>>
    save(p: ProductInput): Promise<Result<Product>>
    remove(id: number): Promise<Result<null>>
    byBarcode(code: string): Promise<Result<Product | null>>
    exportFile(format: 'csv' | 'xlsx'): Promise<Result<string | null>>
    importFile(): Promise<Result<ImportReport | null>>
  }
  promos: {
    list(): Promise<Result<Promo[]>>
    save(p: Omit<Promo, 'id'> & { id?: number }): Promise<Result<Promo>>
    remove(id: number): Promise<Result<null>>
    find(code: string): Promise<Result<Promo | null>>
  }
  orders: {
    place(input: PlaceOrderInput): Promise<Result<Order>>
    pay(input: PayInput): Promise<Result<Order>>
    list(q: OrderQuery): Promise<Result<Order[]>>
    get(id: number): Promise<Result<Order | null>>
    setStatus(id: number, status: Exclude<OrderStatus, 'refunded' | 'held'>): Promise<Result<Order>>
    refund(id: number): Promise<Result<Order>>
    deleteHeld(id: number): Promise<Result<null>>
    exportFile(from: string, to: string, format: 'csv' | 'xlsx'): Promise<Result<string | null>>
  }
  stats: {
    dashboard(): Promise<Result<DashboardStats>>
    summary(date: string): Promise<Result<SalesSummary>>
    zReport(date: string): Promise<Result<SalesSummary>>
  }
  settings: {
    get(): Promise<Result<Settings>>
    save(patch: Partial<Settings>): Promise<Result<Settings>>
  }
  hardware: {
    serialList(): Promise<Result<PortInfo[]>>
    serialConnect(): Promise<Result<null>>
    serialDisconnect(): Promise<Result<null>>
    hidList(): Promise<Result<HidInfo[]>>
    hidConnect(): Promise<Result<null>>
    hidDisconnect(): Promise<Result<null>>
    status(): Promise<Result<HardwareStatus>>
  }
  print: {
    printers(): Promise<Result<{ name: string; displayName: string; isDefault: boolean }[]>>
    receipt(orderId: number): Promise<Result<null>>
    test(): Promise<Result<null>>
    zReport(date: string): Promise<Result<null>>
    pdf(orderId: number): Promise<Result<string | null>>
    openDrawer(): Promise<Result<null>>
  }
  backup: {
    now(): Promise<Result<string>>
    list(): Promise<Result<{ name: string; size: number; date: string }[]>>
    exportFile(): Promise<Result<string | null>>
    restore(): Promise<Result<boolean>>
    clearOrders(): Promise<Result<number>>
  }
  win: {
    minimize(): void
    maximize(): void
    close(): void
    setKiosk(on: boolean): Promise<Result<boolean>>
    updateDisplay(state: CustomerDisplayState): void
    info(): Promise<Result<{ version: string; platform: string; dataDir: string; isPackaged: boolean }>>
  }
  on: {
    scan(cb: (e: ScanEvent) => void): () => void
    hardwareStatus(cb: (s: HardwareStatus) => void): () => void
    displayState(cb: (s: CustomerDisplayState) => void): () => void
    kiosk(cb: (on: boolean) => void): () => void
  }
}
