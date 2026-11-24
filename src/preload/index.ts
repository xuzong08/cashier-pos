import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVT, IPC, type BiteApi } from '@shared/ipc'

const call =
  (ch: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(ch, ...args)

function listen<T>(ch: string) {
  return (cb: (v: T) => void) => {
    const h = (_e: IpcRendererEvent, v: T): void => cb(v)
    ipcRenderer.on(ch, h)
    return () => ipcRenderer.removeListener(ch, h)
  }
}

const api: BiteApi = {
  auth: { users: call(IPC.authUsers), login: call(IPC.authLogin), logout: call(IPC.authLogout), current: call(IPC.authCurrent) },
  users: { save: call(IPC.usersSave), remove: call(IPC.usersDelete) },
  categories: { list: call(IPC.categoriesList), save: call(IPC.categoriesSave), remove: call(IPC.categoriesDelete) },
  tables: { list: call(IPC.tablesList), save: call(IPC.tablesSave), remove: call(IPC.tablesDelete) },
  products: {
    list: call(IPC.productsList),
    save: call(IPC.productsSave),
    remove: call(IPC.productsDelete),
    byBarcode: call(IPC.productsByBarcode),
    exportFile: call(IPC.productsExport),
    importFile: call(IPC.productsImport)
  },
  promos: { list: call(IPC.promosList), save: call(IPC.promosSave), remove: call(IPC.promosDelete), find: call(IPC.promosFind) },
  orders: {
    place: call(IPC.ordersPlace),
    pay: call(IPC.ordersPay),
    list: call(IPC.ordersList),
    get: call(IPC.ordersGet),
    setStatus: call(IPC.ordersSetStatus),
    refund: call(IPC.ordersRefund),
    deleteHeld: call(IPC.ordersDeleteHeld),
    exportFile: call(IPC.ordersExport)
  },
  stats: { dashboard: call(IPC.statsDashboard), summary: call(IPC.statsSummary), zReport: call(IPC.statsZReport) },
  settings: { get: call(IPC.settingsGet), save: call(IPC.settingsSave) },
  hardware: {
    serialList: call(IPC.serialList),
    serialConnect: call(IPC.serialConnect),
    serialDisconnect: call(IPC.serialDisconnect),
    hidList: call(IPC.hidList),
    hidConnect: call(IPC.hidConnect),
    hidDisconnect: call(IPC.hidDisconnect),
    status: call(IPC.hardwareStatus)
  },
  print: {
    printers: call(IPC.printersList),
    receipt: call(IPC.printReceipt),
    test: call(IPC.printTest),
    zReport: call(IPC.printZReport),
    pdf: call(IPC.receiptPdf),
    openDrawer: call(IPC.drawerOpen)
  },
  backup: { now: call(IPC.backupNow), list: call(IPC.backupList), exportFile: call(IPC.backupExport), restore: call(IPC.backupRestore), clearOrders: call(IPC.ordersClearAll) },
  win: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    maximize: () => ipcRenderer.send(IPC.winMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    setKiosk: call(IPC.winKiosk),
    updateDisplay: (s) => ipcRenderer.send(IPC.displayUpdate, s),
    info: call(IPC.appInfo)
  },
  on: {
    scan: listen(EVT.scan),
    hardwareStatus: listen(EVT.hardwareStatus),
    displayState: listen(EVT.displayState),
    kiosk: listen(EVT.kioskChanged)
  }
} as BiteApi

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('platform', process.platform)
