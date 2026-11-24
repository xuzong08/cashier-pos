import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, session, shell, type IpcMainInvokeEvent } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EVT, IPC, type ScanEvent } from '@shared/ipc'
import type { CustomerDisplayState, Settings } from '@shared/types'
import { openDb, type DB } from './db'
import { Repo, UserError } from './repo'
import { ScannerHub } from './scanners'
import { Backups, isSqliteFile } from './backup'
import { registerIpc } from './ipc'

// Tests and portable installs can point the data folder elsewhere.
// The app was renamed BitePoint POS -> Cashier; keep the original data folder so existing shops keep their data.
app.setPath('userData', process.env.BITEPOINT_DATA_DIR || join(app.getPath('appData'), 'BitePoint POS'))

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

const DEV_URL = process.env.ELECTRON_RENDERER_URL
const RENDERER_FILE = join(__dirname, '../renderer/index.html')
const PRELOAD = join(__dirname, '../preload/index.js')

let mainWin: BrowserWindow | null = null
let displayWin: BrowserWindow | null = null
let db: DB
let repo: Repo
let backupTimer: NodeJS.Timeout | null = null
let lastDisplay: CustomerDisplayState | null = null

const dataDir = (): string => app.getPath('userData')
const dbFile = (): string => join(dataDir(), 'bitepoint.db')

function isTrustedSender(e: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  return DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(pathToFileURL(RENDERER_FILE).href)
}

function load(win: BrowserWindow, hash = ''): void {
  if (DEV_URL) void win.loadURL(`${DEV_URL}${hash ? `#${hash}` : ''}`)
  else void win.loadFile(RENDERER_FILE, { hash })
}

function secure(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (ev, url) => {
    if (!(DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://'))) ev.preventDefault()
  })
}

const isDark = (s: Settings): boolean => s.theme === 'dark' || (s.theme === 'system' && nativeTheme.shouldUseDarkColors)

function createMainWindow(s: Settings): void {
  const mac = process.platform === 'darwin'
  mainWin = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: mac,
    titleBarStyle: mac ? 'hiddenInset' : undefined,
    backgroundColor: isDark(s) ? '#121615' : '#F1F1EC',
    kiosk: s.kiosk,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true
    }
  })
  secure(mainWin)
  mainWin.once('ready-to-show', () => {
    if (!s.kiosk && screen.getPrimaryDisplay().workAreaSize.width <= 1440) mainWin?.maximize()
    mainWin?.show()
  })
  mainWin.on('closed', () => {
    mainWin = null
    displayWin?.close()
  })
  mainWin.on('enter-full-screen', () => mainWin?.webContents.send(EVT.kioskChanged, true))
  mainWin.on('leave-full-screen', () => mainWin?.webContents.send(EVT.kioskChanged, false))
  load(mainWin)
}

function setKiosk(on: boolean): void {
  if (!mainWin) return
  mainWin.setKiosk(on)
  mainWin.webContents.send(EVT.kioskChanged, on)
}

/** Second window on another monitor, showing the live cart to the customer. */
function syncCustomerDisplay(enabled: boolean): void {
  if (!enabled) {
    displayWin?.close()
    displayWin = null
    return
  }
  if (displayWin) return
  const primary = screen.getPrimaryDisplay()
  const other = screen.getAllDisplays().find((d) => d.id !== primary.id)
  const area = (other ?? primary).workArea
  displayWin = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: other ? area.width : 900,
    height: other ? area.height : 600,
    fullscreen: !!other,
    frame: !other,
    title: 'Cashier — Customer display',
    backgroundColor: '#0B6B63',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  secure(displayWin)
  displayWin.setMenu(null)
  displayWin.on('closed', () => (displayWin = null))
  displayWin.webContents.on('did-finish-load', () => lastDisplay && displayWin?.webContents.send(EVT.displayState, lastDisplay))
  load(displayWin, '/customer-display')
}

function scheduleBackups(hours: number, backups: Backups): void {
  if (backupTimer) clearInterval(backupTimer)
  backupTimer = null
  if (hours > 0) backupTimer = setInterval(() => void backups.now().catch((e) => console.error('auto backup', e)), hours * 3600_000)
}

function applySystemSettings(prev: Settings | null, s: Settings, backups: Backups): void {
  if (app.isPackaged && prev?.launchAtStartup !== s.launchAtStartup) app.setLoginItemSettings({ openAtLogin: s.launchAtStartup })
  if (prev && prev.kiosk !== s.kiosk) setKiosk(s.kiosk)
  if (prev?.customerDisplay !== s.customerDisplay) syncCustomerDisplay(s.customerDisplay)
  if (prev?.autoBackupHours !== s.autoBackupHours) scheduleBackups(s.autoBackupHours, backups)
}

async function restoreFromFile(backups: Backups, scanners: ScannerHub): Promise<boolean> {
  const opts = { properties: ['openFile' as const], filters: [{ name: 'Cashier backup', extensions: ['db'] }] }
  const r = mainWin ? await dialog.showOpenDialog(mainWin, opts) : await dialog.showOpenDialog(opts)
  const file = r.filePaths[0]
  if (r.canceled || !file) return false
  if (!isSqliteFile(file)) throw new UserError('That file is not a Cashier backup')
  await backups.now() // safety copy of the current data first
  scanners.dispose()
  db.close()
  for (const ext of ['-wal', '-shm']) rmSync(dbFile() + ext, { force: true })
  copyFileSync(file, dbFile())
  app.relaunch()
  app.exit(0)
  return true
}

app.on('second-instance', () => {
  if (!mainWin) return
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.focus()
})

app.whenReady().then(() => {
  mkdirSync(dataDir(), { recursive: true })
  db = openDb(dbFile())
  repo = new Repo(db)
  const backups = new Backups(join(dataDir(), 'backups'), () => db)

  // Camera is the only permission the renderer may use; everything else is denied.
  const allowed = new Set(['media', 'speaker-selection'])
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)))
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm))
  // Block any network request that is not the app itself (offline-only, no remote content).
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    if (!details.webContentsId) return cb({}) // main-process requests (auto-updater)
    const u = details.url
    const ok =
      u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('devtools://') || (DEV_URL && /^(https?|wss?):\/\/localhost[:/]/.test(u))
    cb({ cancel: !ok })
  })

  const scanners = new ScannerHub(
    (source, code) => {
      const ev: ScanEvent = { source, code }
      mainWin?.webContents.send(EVT.scan, ev)
    },
    (status) => mainWin?.webContents.send(EVT.hardwareStatus, status)
  )

  registerIpc({
    repo,
    scanners,
    backups,
    mainWindow: () => mainWin,
    isTrustedSender,
    onSettingsChanged: (prev, next) => applySystemSettings(prev, next, backups),
    setKiosk,
    restore: () => restoreFromFile(backups, scanners),
    dataDir: dataDir()
  })
  ipcMain.on(IPC.winMinimize, (e) => isTrustedSender(e) && mainWin?.minimize())
  ipcMain.on(IPC.winMaximize, (e) => {
    if (!isTrustedSender(e) || !mainWin) return
    if (mainWin.isMaximized()) mainWin.unmaximize()
    else mainWin.maximize()
  })
  ipcMain.on(IPC.winClose, (e) => isTrustedSender(e) && mainWin?.close())
  ipcMain.on(IPC.displayUpdate, (e, state: CustomerDisplayState) => {
    if (!isTrustedSender(e) || !state || !Array.isArray(state.lines)) return
    lastDisplay = state
    displayWin?.webContents.send(EVT.displayState, state)
  })

  const s = repo.settings()
  createMainWindow(s)
  applySystemSettings(null, s, backups)
  if (s.serialEnabled && s.serialPath) scanners.connectSerial(s)
  if (s.hidEnabled && s.hidPath) scanners.connectHid(s)

  // one backup per launch, unless this is a fresh database
  if (existsSync(dbFile())) void backups.now().catch((e) => console.error('startup backup', e))

  if (app.isPackaged && s.autoUpdate) {
    import('electron-updater')
      .then(({ autoUpdater }) => autoUpdater.checkForUpdatesAndNotify())
      .catch((e) => console.error('update check', e))
  }

  app.on('before-quit', () => scanners.dispose())
})

app.on('window-all-closed', () => {
  db?.close()
  app.quit()
})
