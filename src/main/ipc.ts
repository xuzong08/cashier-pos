import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { CATEGORY_COLORS, CATEGORY_ICONS, IPC, type Result } from '@shared/ipc'
import { translate } from '@shared/i18n'
import type { Settings, User } from '@shared/types'
import type { Repo } from './repo'
import { UserError } from './repo'
import type { ScannerHub } from './scanners'
import type { Backups } from './backup'
import { exportOrders, exportProducts, importProducts } from './io'
import { receiptEscPos, receiptHtml, testOrder, zReportEscPos, zReportHtml, DRAWER_KICK } from './receipt'
import { printHtml, saveHtmlAsPdf, sendRaw } from './printer'

export interface Ctx {
  repo: Repo
  scanners: ScannerHub
  backups: Backups
  mainWindow: () => BrowserWindow | null
  isTrustedSender: (e: IpcMainInvokeEvent) => boolean
  onSettingsChanged: (prev: Settings, next: Settings) => void
  setKiosk: (on: boolean) => void
  restore: () => Promise<boolean>
  dataDir: string
}

// ---------- schemas ----------
const id = z.number().int().positive()
const str = (max = 200) => z.string().max(max)
const cents = z.number().int().min(0).max(100_000_000)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const method = z.enum(['cash', 'card', 'qr'])
const dataUrl = z
  .string()
  .max(3_000_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,/)

const productInput = z.object({
  id: id.optional(),
  name: str(80).min(1),
  price: cents,
  categoryId: id,
  photo: dataUrl.nullable(),
  emoji: str(16),
  stock: z.number().int().min(-100000).max(1_000_000),
  lowStock: z.number().int().min(0).max(100000),
  barcode: str(64).nullable(),
  availableAt: str(40).nullable()
})

const placeOrder = z.object({
  lines: z
    .array(z.object({ productId: id, qty: z.number().int().min(1).max(999), note: str(200).optional() }))
    .max(200),
  tableNo: str(10).optional(),
  orderType: z.enum(['dine_in', 'takeaway']).optional(),
  customer: str(60).optional(),
  promoCode: str(40).optional(),
  hold: z.boolean().optional(),
  payment: z.object({ method, tendered: cents.optional() }).optional(),
  heldOrderId: id.optional()
})

const settingsPatch = z
  .object({
    storeName: str(80),
    storeAddress: str(200),
    receiptFooter: str(200),
    receiptLogo: dataUrl.nullable(),
    paymentQr: dataUrl.nullable(),
    receiptCode: z.enum(['none', 'barcode', 'qr']),
    currency: z.string().regex(/^[A-Z]{3}$/),
    locale: str(20),
    taxRate: z.number().min(0).max(100),
    wedgeEnabled: z.boolean(),
    wedgeMaxIntervalMs: z.number().int().min(5).max(500),
    wedgeMinLength: z.number().int().min(1).max(64),
    wedgePrefix: str(20),
    wedgeSuffix: str(20),
    serialEnabled: z.boolean(),
    serialPath: str(200),
    serialBaud: z.number().int().min(300).max(921600),
    serialDataBits: z.union([z.literal(7), z.literal(8)]),
    serialParity: z.enum(['none', 'even', 'odd']),
    serialTerminator: z.enum(['CR', 'LF', 'CRLF']),
    hidEnabled: z.boolean(),
    hidPath: str(500),
    cameraDeviceId: str(500),
    scanBeep: z.boolean(),
    printerConnection: z.enum(['usb', 'network', 'serial', 'system']),
    printerName: str(200),
    printerHost: str(100),
    printerPort: z.number().int().min(1).max(65535),
    printerSerialPath: str(200),
    printerBaud: z.number().int().min(300).max(921600),
    paperWidth: z.union([z.literal(58), z.literal(80)]),
    autoPrint: z.boolean(),
    drawerOnCash: z.boolean(),
    kiosk: z.boolean(),
    launchAtStartup: z.boolean(),
    customerDisplay: z.boolean(),
    autoBackupHours: z.number().int().min(0).max(168),
    autoUpdate: z.boolean(),
    theme: z.enum(['light', 'dark', 'system']),
    language: z.enum(['en', 'id', 'zh']),
    lowPower: z.boolean(),
    floorWidth: z.number().int().min(300).max(5000),
    floorHeight: z.number().int().min(300).max(5000),
    floorGrid: z.number().int().min(0).max(200)
  })
  .partial()
  .strict()

// Settings any signed-in cashier may change (hardware pairing at the till). Everything else is Admin-only.
const CASHIER_SETTINGS = new Set<keyof Settings>(['cameraDeviceId', 'scanBeep', 'theme', 'language', 'lowPower'])

type Access = 'public' | 'user' | 'admin'

export function registerIpc(ctx: Ctx): void {
  let user: User | null = null
  const { repo } = ctx

  function handle<A extends unknown[], R>(
    channel: string,
    access: Access,
    schema: z.ZodType<A>,
    fn: (args: A, e: IpcMainInvokeEvent) => R | Promise<R>
  ): void {
    ipcMain.handle(channel, async (e, ...raw): Promise<Result<R>> => {
      try {
        if (!ctx.isTrustedSender(e)) throw new UserError('Untrusted sender')
        if (access !== 'public' && !user) throw new UserError('Please sign in')
        if (access === 'admin' && user?.role !== 'admin') throw new UserError('Admin only')
        const parsed = schema.safeParse(raw)
        if (!parsed.success) throw new UserError('Invalid input: {why}', { why: parsed.error.issues[0]?.message ?? 'bad request' })
        return { ok: true, data: await fn(parsed.data, e) }
      } catch (err) {
        if (!(err instanceof UserError)) console.error(`[ipc ${channel}]`, err)
        const lang = repo.settings().language
        const msg = err instanceof UserError ? translate(lang, err.message, err.vars) : translate(lang, 'Something went wrong')
        return { ok: false, error: msg }
      }
    })
  }
  const none = z.tuple([])

  // ---------- auth ----------
  handle(IPC.authUsers, 'public', none, () => repo.users())
  handle(IPC.authLogin, 'public', z.tuple([id, z.string().regex(/^\d{4,8}$/)]), ([uid, pin]) => (user = repo.login(uid, pin)))
  handle(IPC.authLogout, 'public', none, () => ((user = null), null))
  handle(IPC.authCurrent, 'public', none, () => user)
  handle(
    IPC.usersSave,
    'admin',
    z.tuple([z.object({ id: id.optional(), name: str(60).min(1), role: z.enum(['admin', 'cashier']), pin: z.string().regex(/^\d{4,8}$/).optional() })]),
    ([u]) => repo.saveUser(u)
  )
  handle(IPC.usersDelete, 'admin', z.tuple([id]), ([uid]) => {
    if (uid === user?.id) throw new UserError('You cannot delete yourself')
    repo.deleteUser(uid)
    return null
  })

  // ---------- catalog ----------
  handle(IPC.categoriesList, 'user', none, () => repo.categories())
  handle(
    IPC.categoriesSave,
    'admin',
    z.tuple([z.object({ id: id.optional(), name: str(40).min(1), tag: str(40), icon: z.enum(CATEGORY_ICONS), color: z.enum(CATEGORY_COLORS) })]),
    ([cat]) => repo.saveCategory(cat)
  )
  handle(IPC.categoriesDelete, 'admin', z.tuple([id]), ([cid]) => (repo.deleteCategory(cid), null))

  // ---------- dining tables ----------
  const coord = z.number().min(0).max(5000)
  handle(IPC.tablesList, 'user', none, () => repo.tables())
  handle(
    IPC.tablesSave,
    'admin',
    z.tuple([
      z.object({
        id: id.optional(),
        name: z.string().trim().min(1).max(10),
        zone: str(30),
        x: coord,
        y: coord,
        w: z.number().min(40).max(600),
        h: z.number().min(40).max(600),
        shape: z.enum(['round', 'square']),
        seats: z.number().int().min(1).max(50)
      })
    ]),
    ([t]) => repo.saveTable(t)
  )
  handle(IPC.tablesDelete, 'admin', z.tuple([id]), ([tid]) => (repo.deleteTable(tid), null))
  handle(IPC.productsList, 'user', none, () => repo.products())
  handle(IPC.productsSave, 'admin', z.tuple([productInput]), ([p]) => repo.saveProduct(p))
  handle(IPC.productsDelete, 'admin', z.tuple([id]), ([pid]) => (repo.deleteProduct(pid), null))
  handle(IPC.productsByBarcode, 'user', z.tuple([str(128)]), ([code]) => repo.productByBarcode(code.trim()))
  handle(IPC.productsExport, 'admin', z.tuple([z.enum(['csv', 'xlsx'])]), async ([fmt]) => {
    const win = ctx.mainWindow()
    const opts = { defaultPath: `bitepoint-products.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] }
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    await exportProducts(repo, r.filePath, fmt)
    return r.filePath
  })
  handle(IPC.productsImport, 'admin', none, async () => {
    const win = ctx.mainWindow()
    const opts = { properties: ['openFile' as const], filters: [{ name: 'Spreadsheet', extensions: ['csv', 'xlsx'] }] }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return null
    try {
      return await importProducts(repo, r.filePaths[0])
    } catch (e) {
      throw new UserError('Import failed: {why}', { why: (e as Error).message })
    }
  })

  // ---------- promos ----------
  handle(IPC.promosList, 'user', none, () => repo.promos())
  handle(IPC.promosFind, 'user', z.tuple([str(40)]), ([code]) => repo.findPromo(code))
  handle(
    IPC.promosSave,
    'admin',
    z.tuple([
      z
        .object({ id: id.optional(), code: z.string().regex(/^[A-Za-z0-9_-]{2,30}$/), type: z.enum(['percent', 'fixed']), value: z.number().int().min(0), active: z.boolean() })
        .refine((p) => p.type !== 'percent' || p.value <= 100, 'Percent must be 0-100')
    ]),
    ([p]) => repo.savePromo(p)
  )
  handle(IPC.promosDelete, 'admin', z.tuple([id]), ([pid]) => (repo.deletePromo(pid), null))

  // ---------- orders ----------
  const afterPayment = async (orderId: number): Promise<void> => {
    const s = repo.settings()
    const o = repo.order(orderId)
    if (!o) return
    const kick = s.drawerOnCash && o.paymentMethod === 'cash'
    if (s.autoPrint) await printOrder(orderId, kick).catch((e) => console.error('auto print', e))
    else if (kick) await sendRaw(s, DRAWER_KICK).catch((e) => console.error('drawer', e))
  }
  handle(IPC.ordersPlace, 'user', z.tuple([placeOrder]), async ([input]) => {
    const o = repo.placeOrder(input, user)
    if (o.paid) await afterPayment(o.id)
    return repo.order(o.id)!
  })
  handle(IPC.ordersPay, 'user', z.tuple([z.object({ orderId: id, method, tendered: cents.optional() })]), async ([input]) => {
    const o = repo.pay(input)
    await afterPayment(o.id)
    return o
  })
  handle(
    IPC.ordersList,
    'user',
    z.tuple([
      z.object({
        search: str(60).optional(),
        status: z.enum(['held', 'in_progress', 'ready', 'completed', 'refunded', 'all', 'active', 'unpaid']).optional(),
        from: date.optional(),
        to: date.optional(),
        limit: z.number().int().min(1).max(1000).optional()
      })
    ]),
    ([q]) => repo.orders(q)
  )
  handle(IPC.ordersGet, 'user', z.tuple([id]), ([oid]) => repo.order(oid))
  handle(IPC.ordersSetStatus, 'user', z.tuple([id, z.enum(['in_progress', 'ready', 'completed'])]), ([oid, s]) => repo.setStatus(oid, s))
  handle(IPC.ordersRefund, 'admin', z.tuple([id]), ([oid]) => repo.refund(oid))
  handle(IPC.ordersDeleteHeld, 'user', z.tuple([id]), ([oid]) => (repo.deleteHeld(oid), null))
  handle(IPC.ordersExport, 'admin', z.tuple([date, date, z.enum(['csv', 'xlsx'])]), async ([from, to, fmt]) => {
    const win = ctx.mainWindow()
    const opts = { defaultPath: `orders-${from}_${to}.${fmt}`, filters: [{ name: fmt === 'csv' ? 'CSV' : 'Excel', extensions: [fmt] }] }
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    await exportOrders(repo.ordersForExport(from, to), r.filePath, fmt, repo.settings(), { from, to })
    return r.filePath
  })

  // ---------- stats ----------
  handle(IPC.statsDashboard, 'user', none, () => repo.dashboard())
  handle(IPC.statsSummary, 'admin', z.tuple([date]), ([d]) => repo.summary(d))
  handle(IPC.statsZReport, 'admin', z.tuple([date]), ([d]) => repo.zReport(d))

  // ---------- settings ----------
  // public: the login screen needs store name, kiosk and currency before anyone signs in
  handle(IPC.settingsGet, 'public', none, () => repo.settings())
  handle(IPC.settingsSave, 'user', z.tuple([settingsPatch]), ([patch]) => {
    if (user?.role !== 'admin') {
      const blocked = Object.keys(patch).filter((k) => !CASHIER_SETTINGS.has(k as keyof Settings))
      if (blocked.length) throw new UserError('Admin only')
    }
    const prev = repo.settings()
    const next = repo.saveSettings(patch as Partial<Settings>)
    ctx.onSettingsChanged(prev, next)
    return next
  })

  // ---------- hardware ----------
  handle(IPC.serialList, 'user', none, () => ctx.scanners.listPorts())
  handle(IPC.serialConnect, 'admin', none, () => (ctx.scanners.connectSerial(repo.settings()), null))
  handle(IPC.serialDisconnect, 'admin', none, () => (ctx.scanners.disconnectSerial(), null))
  handle(IPC.hidList, 'user', none, () => {
    try {
      return ctx.scanners.listHid()
    } catch (e) {
      throw new UserError((e as Error).message)
    }
  })
  handle(IPC.hidConnect, 'admin', none, () => (ctx.scanners.connectHid(repo.settings()), null))
  handle(IPC.hidDisconnect, 'admin', none, () => (ctx.scanners.disconnectHid(), null))
  handle(IPC.hardwareStatus, 'user', none, () => ctx.scanners.status)

  // ---------- printing ----------
  async function printOrder(orderId: number, kick = false): Promise<void> {
    const s = repo.settings()
    const o = orderId === 0 ? testOrder() : repo.order(orderId)
    if (!o) throw new UserError('Order not found')
    if (s.printerConnection === 'system') {
      await printHtml(s, receiptHtml(o, s))
      if (kick) await sendRaw(s, DRAWER_KICK).catch(() => undefined)
    } else await sendRaw(s, await receiptEscPos(o, s, { kick }))
  }
  handle(IPC.printersList, 'user', none, async () => {
    const win = ctx.mainWindow()
    const list = win ? await win.webContents.getPrintersAsync() : []
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!(p as { isDefault?: boolean }).isDefault }))
  })
  handle(IPC.printReceipt, 'user', z.tuple([id]), async ([oid]) => (await printOrder(oid), null))
  handle(IPC.printTest, 'user', none, async () => (await printOrder(0), null))
  handle(IPC.printZReport, 'admin', z.tuple([date]), async ([d]) => {
    const s = repo.settings()
    const z = repo.summary(d)
    if (s.printerConnection === 'system') await printHtml(s, zReportHtml(z, s))
    else await sendRaw(s, zReportEscPos(z, s))
    return null
  })
  handle(IPC.receiptPdf, 'user', z.tuple([id]), async ([oid]) => {
    const s = repo.settings()
    const o = repo.order(oid)
    if (!o) throw new UserError('Order not found')
    return saveHtmlAsPdf(ctx.mainWindow(), s, receiptHtml(o, s), `receipt-${o.number}`)
  })
  handle(IPC.drawerOpen, 'user', none, async () => (await sendRaw(repo.settings(), DRAWER_KICK), null))

  // ---------- backup ----------
  handle(IPC.backupNow, 'admin', none, () => ctx.backups.now())
  handle(IPC.backupList, 'admin', none, () => ctx.backups.list())
  handle(IPC.backupExport, 'admin', none, async () => {
    const win = ctx.mainWindow()
    const opts = { defaultPath: `bitepoint-backup-${new Date().toISOString().slice(0, 10)}.db`, filters: [{ name: 'Database', extensions: ['db'] }] }
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    return ctx.backups.now(r.filePath)
  })
  handle(IPC.backupRestore, 'admin', none, () => ctx.restore())
  handle(IPC.ordersClearAll, 'admin', none, async () => {
    await ctx.backups.now() // safety copy first
    return repo.clearOrders()
  })

  // ---------- window ----------
  handle(IPC.winKiosk, 'user', z.tuple([z.boolean()]), ([on]) => {
    if (!on && user?.role !== 'admin' && repo.settings().kiosk) throw new UserError('Only an Admin can leave kiosk mode')
    ctx.setKiosk(on)
    return on
  })
  handle(IPC.appInfo, 'public', none, () => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: ctx.dataDir,
    isPackaged: app.isPackaged
  }))
}
