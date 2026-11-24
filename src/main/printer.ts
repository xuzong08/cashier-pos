import { BrowserWindow, dialog, type WebContents } from 'electron'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SerialPort } from 'serialport'
import type { Settings } from '@shared/types'
import { UserError } from './repo'

// Raw ESC/POS to an installed Windows printer queue (USB printers show up as queues).
const WIN_RAW_PS1 = `param([string]$Printer, [string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class BpRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Cannot open printer (" + Marshal.GetLastWin32Error() + ")");
    try {
      if (StartDocPrinter(h, 1, new DOCINFO { pDocName = "Cashier", pDataType = "RAW" }) == 0) throw new Exception("StartDoc failed (" + Marshal.GetLastWin32Error() + ")");
      StartPagePrinter(h); int w; bool ok = WritePrinter(h, data, data.Length, out w); EndPagePrinter(h); EndDocPrinter(h);
      if (!ok || w != data.Length) throw new Exception("Write failed (" + Marshal.GetLastWin32Error() + ")");
    } finally { ClosePrinter(h); }
  }
}
"@
[BpRawPrint]::Send($Printer, [System.IO.File]::ReadAllBytes($Path))
`

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 20000, windowsHide: true }, (err, _out, stderr) =>
      err ? reject(new UserError('Printer error: {why}', { why: (stderr || err.message).trim().split('\n').pop() ?? '' })) : resolve()
    )
  )
}

async function sendToQueue(printerName: string, data: Buffer): Promise<void> {
  if (!printerName) throw new UserError('Pick a printer in Settings › Printer')
  const dir = await mkdtemp(join(tmpdir(), 'bitepoint-'))
  try {
    const bin = join(dir, 'job.bin')
    await writeFile(bin, data)
    if (process.platform === 'win32') {
      const ps1 = join(dir, 'raw.ps1')
      await writeFile(ps1, WIN_RAW_PS1, 'utf8')
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Printer', printerName, '-Path', bin])
    } else {
      await run('lp', ['-d', printerName, '-o', 'raw', bin])
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function sendTcp(host: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port })
    sock.setTimeout(5000)
    sock.on('connect', () => sock.end(data))
    sock.on('close', (hadError) => (hadError ? undefined : resolve()))
    sock.on('timeout', () => {
      sock.destroy()
      reject(new UserError('Printer at {addr} did not respond', { addr: `${host}:${port}` }))
    })
    sock.on('error', (e) => reject(new UserError('Cannot reach printer {addr} ({why})', { addr: `${host}:${port}`, why: e.message })))
  })
}

function sendSerial(path: string, baudRate: number, data: Buffer): Promise<void> {
  if (!path) return Promise.reject(new UserError('Pick the printer COM port in Settings › Printer'))
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate, autoOpen: false })
    port.open((err) => {
      if (err) return reject(new UserError('Cannot open {port}: {why}', { port: path, why: err.message }))
      port.write(data, (werr) => {
        if (werr) return reject(new UserError(werr.message))
        port.drain(() => port.close(() => resolve()))
      })
    })
  })
}

/** Send raw ESC/POS bytes over the configured connection. */
export async function sendRaw(s: Settings, data: Buffer): Promise<void> {
  switch (s.printerConnection) {
    case 'network':
      return sendTcp(s.printerHost, s.printerPort, data)
    case 'serial':
      return sendSerial(s.printerSerialPath, s.printerBaud, data)
    case 'usb':
    case 'system':
      // system mode has no raw channel of its own; drivers for receipt printers pass raw jobs through
      return sendToQueue(s.printerName, data)
  }
}

async function renderHtml(html: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  return win
}

async function pageHeightMicrons(wc: WebContents): Promise<number> {
  const px = (await wc.executeJavaScript('document.documentElement.scrollHeight')) as number
  return Math.ceil((px / 96) * 25400) + 2000
}

/** Print HTML through the OS driver (system printer fallback). */
export async function printHtml(s: Settings, html: string): Promise<void> {
  const win = await renderHtml(html)
  try {
    const height = await pageHeightMicrons(win.webContents)
    await new Promise<void>((resolve, reject) =>
      win.webContents.print(
        {
          silent: !!s.printerName,
          deviceName: s.printerName || undefined,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: s.paperWidth * 1000, height }
        },
        (ok, reason) => (ok || reason === 'cancelled' ? resolve() : reject(new UserError('Print failed: {why}', { why: reason })))
      )
    )
  } finally {
    win.destroy()
  }
}

export async function saveHtmlAsPdf(parent: BrowserWindow | null, s: Settings, html: string, name: string): Promise<string | null> {
  const opts = { defaultPath: `${name}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }
  const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null
  const win = await renderHtml(html)
  try {
    const height = await pageHeightMicrons(win.webContents)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: s.paperWidth / 25.4, height: height / 25400 }
    })
    await writeFile(res.filePath, pdf)
    return res.filePath
  } finally {
    win.destroy()
  }
}
