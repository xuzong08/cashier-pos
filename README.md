# Cashier

Offline cashier / point-of-sale desktop app for bakeries and cafés.
Electron + React 18 + TypeScript + Vite + Tailwind CSS, with a local SQLite database.
It runs on Windows (main target), macOS and Linux from the same code.

- Touch-first UI for 1366×768 and larger screens. Every button is at least 44 px.
- Barcode scanning: keyboard-wedge (USB/Bluetooth), serial/COM, raw USB HID, and webcam/phone camera.
- ESC/POS receipt printing over USB, network or serial, plus a system-printer fallback (58 mm / 80 mm). Cash drawer kick.
- PIN sign-in with Cashier and Admin roles. Products, promos, order history, refunds, daily summary and Z report.
- Automatic local backups. Kiosk mode. Customer-facing second display.
- Languages: English, Bahasa Indonesia, 简体中文. Light and dark theme.
- Table map: drag-and-drop floor plan with live table status. Editable categories.
- Clean exports: styled Excel and tidy CSV.

**Does it need Wi-Fi or internet? No.** Everything runs on the computer: the database, scanning, USB/serial printing, backups.
A network is only needed for a **network (IP) receipt printer**, which needs your local network (router), not the internet.
Internet is only used for *Check for updates* (off by default) and for developers running `npm install` or building installers.

Starting PINs: **Admin `1234`** (Jordan Lee) and **Cashier `0000`** (Sam Rivera). They are not shown on the login screen. **Change both before real use** in Settings › Users.

---

## 1. Run in development

You need Node.js 22 or newer.

```powershell
npm install
npx install-electron        # downloads the Electron binary (npm 11 does not run install scripts by default)
npm run dev
```

The app opens with hot reload. The data lives in your app-data folder:

| OS | Database |
|---|---|
| Windows | `%APPDATA%\BitePoint POS\bitepoint.db` |
| macOS | `~/Library/Application Support/BitePoint POS/bitepoint.db` |
| Linux | `~/.config/BitePoint POS/bitepoint.db` |

The folder keeps its old name on purpose: the app was renamed from BitePoint POS to Cashier, and existing shops keep their data.

The first start creates the database and seeds 31 products, 7 categories, 2 users, 2 promo codes (`SWEET10` = 10 % off, `BITE5` = 5.00 off). There are no sample orders: the order history starts empty. On a database that still has the old sample orders, use Settings › System & backup › *Delete all orders* (it makes a backup first).
To start fresh, quit the app and delete the `bitepoint-pos` folder.

> **Behind a proxy?** Node's `fetch` ignores `HTTPS_PROXY`. Set `$env:NODE_USE_ENV_PROXY='1'` before `npx install-electron`.

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Compiles main, preload and renderer into `out/` |
| `npm start` | Runs the compiled app (no hot reload) |
| `npm run typecheck` | TypeScript check of the whole project |
| `npm test` | Unit tests (Vitest): cart totals, discounts, tax, scanner burst detection, HID decoding, translations, floor plan, exports |
| `npm run e2e` | Builds, then runs the Playwright end-to-end tests against the real Electron app (scan + cash payment, language/theme switch, table layout survives a restart) |
| `npm run dist` | Builds the installer for the current OS into `release/` |

## 2. Build the installer

```powershell
npm run dist
```

- **Windows:** `release\Cashier Setup 1.0.0.exe` (NSIS; lets the user choose the install folder; creates a desktop shortcut).
- **macOS:** `npm run dist:mac` on a Mac gives a `.dmg`. Sign and notarize it for distribution outside your own machines.
- **Linux:** `npm run dist:linux` gives an `.AppImage`.

Build each OS on that OS. The native modules (`better-sqlite3`, `serialport`, `node-hid`) ship prebuilt N-API binaries, so no C++ compiler is needed.

**Auto-update:** `electron-updater` is wired up but off by default (Settings › System › *Check for updates*).
Before you turn it on, set `build.publish.url` in `package.json` to the server or folder where you upload `latest.yml` and the installer.
The app still works fully offline. An update check only runs when online.

## 3. Barcode scanners

Open **Settings › Scanner**. The big teal box at the top is the **scanner test**.
While that tab is open, every scan from any source shows there and is *not* added to the cart.
Several scanner types can be active at the same time.

### A. USB or Bluetooth keyboard-wedge (most scanners)

1. Plug in the scanner, or pair it in Windows Bluetooth settings as a keyboard (HID) device.
2. Make sure the scanner sends **Enter** (or Tab) after each code. This is the factory default on most models.
3. In Settings › Scanner, keep **Keyboard-wedge › Enabled** on and scan a code. It appears in the test box.

How detection works: a burst of characters arriving faster than the **max gap** (default 35 ms) and ended by Enter/Tab counts as a scan.
Normal typing is slower, so it is ignored. If the scanner typed into a focused text field, Cashier removes those characters from the field again.

Tuning:
- Scans not detected → raise the max gap (try 50–80 ms). This is common with Bluetooth scanners.
- Short codes are ignored → lower **Min length**.
- Scanner adds a fixed prefix or suffix (for example an AIM ID like `]E0`) → enter it under **Strip prefix/suffix**.
- Use the *Human typing check* field to confirm that normal typing is not taken as a scan.

### B. Serial / COM-port scanners (USB virtual COM)

1. Put the scanner in *USB-COM* / *USB CDC* mode. Most scanners do this by scanning a setup barcode from their manual.
   On Windows 10/11 the CDC driver is built in. Some brands (Honeywell, Zebra) need their own "USB serial driver".
2. Check **Device Manager › Ports (COM & LPT)** for the port number, for example `COM5`.
3. In Settings › Scanner › Serial, pick the port, baud rate (often 9600 or 115200), data bits, parity and line terminator. Most scanners use **CR**.
4. Click **Connect**. The status turns green, and a **COM ready** badge shows in the POS top bar.
5. Turn on **Connect automatically at startup** to keep it.

If the cable is unplugged, the status shows *Disconnected, waiting for device…*. Cashier reconnects by itself when the device comes back.

### C. Raw USB HID scanners (optional, advanced)

Only for scanners in **HID-POS** mode (usage page 0x8C), or keyboard-mode scanners on Linux with udev permissions.
On Windows and macOS, the OS takes exclusive control of keyboard-mode scanners, so they cannot be opened raw.
Cashier then shows an error that tells you to use keyboard-wedge mode, which already works.

1. Switch the scanner to HID-POS mode with its setup barcode.
2. In Settings › Scanner › Raw USB HID, click refresh, pick the device (it is marked *· POS*), and click **Connect**.
3. On Linux, add a udev rule so your user can read `/dev/hidraw*`, for example:
   `SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0c2e", MODE="0666"`

### D. Webcam / phone camera

- On the POS screen, tap **Scan**. Pick a camera from the list: the laptop webcam, a USB camera, or a phone used as a webcam (for example Windows *Phone Link*, DroidCam or Camo).
- Supported formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 and QR.
- The panel stays open (continuous mode). Each scan beeps, flashes a green check and adds one item. The same code is ignored for 1.5 s.
- Torch: the button is active when the camera supports a light, which is mostly phones.
- Cashier uses the built-in `BarcodeDetector` where the OS provides it (macOS, ChromeOS). Otherwise it uses ZXing (Windows, Linux).
- If permission is denied: on Windows, go to **Settings › Privacy & security › Camera** and allow desktop apps. On macOS, go to **System Settings › Privacy & Security › Camera**.

### What happens on a scan

- Known barcode → 1 is added to the cart, or the quantity goes up by 1.
- Unknown barcode → the toast "Barcode not found". Admins also get **Add as new product**, which opens the product form with the barcode filled in.
- Manual entry: type the digits in the POS search bar and press **Enter**.

### Test barcodes

Go to **Settings › Scanner › Test barcodes page**. It shows the barcode of every product, a QR code, and an unknown code (`9999999999994`).
Scan them from the screen, or press *Print this page*. Turn the screen brightness up for laser scanners. Many laser scanners cannot read codes from a screen, but imager (2D) scanners can.

## 4. Thermal printer and cash drawer (Windows)

Open **Settings › Printer & drawer**, pick a connection type, then click **Print test receipt**.

| Connection | When to use | Setup |
|---|---|---|
| **USB (ESC/POS)** | USB receipt printer installed in Windows | Install the maker's driver (Epson TM, Xprinter, Star…), or add it as *Generic / Text Only* on its `USB00x` port. Pick it in the list. Cashier sends raw ESC/POS bytes to that print queue. |
| **Network IP** | Ethernet/Wi-Fi printer | Print the printer's self-test page (hold FEED while powering on) to find its IP. Enter the IP and port **9100**. Give the printer a fixed IP on your router. |
| **Serial / COM** | RS-232 or USB-serial printer | Pick the COM port and baud rate (usually 9600, sometimes 19200/38400). |
| **System printer** | Any printer, including A4, or if raw printing fails | Uses the Windows driver with a 58/80 mm receipt layout. Leave the printer empty to get the print dialog. |

- **Paper width:** choose 58 mm or 80 mm to match the roll.
- **Logo:** choose a PNG. It is scaled to 384 px wide and printed in black and white.
- **Receipt code:** a barcode or QR code of the order number.
- **Save as PDF:** on the receipt screen and in Order history.

**Cash drawer:** connect the drawer's RJ11/RJ12 cable to the printer's **DK** port (not to the PC).
Cashier sends the standard ESC/POS kick pulse (`ESC p 0 25 250`) through the printer:
- after each cash payment, if *Open cash drawer after cash payments* is on,
- from **Open drawer** in Settings or on the receipt screen,
- with **F9** anywhere in the app.

With *System printer* the pulse goes to the same Windows queue as a raw job. Most receipt-printer drivers pass it through.

Troubleshooting:
- *Cannot open printer* → the queue name changed. Pick the printer again.
- Garbled characters with *System printer* → use *USB (ESC/POS)* instead.
- Drawer does not open → test with the printer maker's utility. Some drawers use pin 5. Change `DRAWER_KICK` in `src/main/receipt.ts` to `0x1b,0x70,0x01,0x19,0xfa`.

## 5. Daily use

- **Keyboard shortcuts:** F2 = search, F4 = payment, F8 = hold order, F9 = open drawer, Esc = close dialog.
- **Hold / resume:** *Hold* parks the cart. *Held* in the POS top bar resumes it.
- **Void item:** use the pencil icon on a cart line, then *Void item*. **Clear cart** asks for confirmation.
- **Dine in / Take away:** the switch at the top of the cart. Take away hides the table field; receipts, order lists (yellow bag badge) and exports show the type.
- **Promo codes:** type the code in the cart under the items and press *Apply* (or Enter). The *Promo Applied* chip shows it; the x removes it. Admins create codes in Settings › *Promos* (percent or fixed amount, on/off).
- **QR payment:** an Admin uploads the shop's own payment QR (Alipay, WeChat Pay, bank) in Settings › *General* › *Payment QR* and presses *Save changes*. When the customer pays by QR, the dialog shows that QR and the amount; the customer types the amount in their app, and the cashier confirms once the money shows as received. The app cannot check the payment itself.
- **Pay later:** in the payment dialog, *Pay later — send to kitchen*. The order then waits in Dashboard › Payment.
- **Order status:** tap the status pill on the Dashboard to move an order from In Progress to Ready to Completed.
- **Refunds (Admin):** Orders › select an order › Refund. The items go back into stock.
- **End of day (Admin):** Accounting › *End of day (Z report)* records and prints the day's totals.
- **Exports (Admin):** Orders and Accounting have **Excel** and **CSV** buttons.
  - Excel: store name and date range on top, teal header row, filters, frozen header, real dates, money in the shop currency, a bold totals row that leaves refunds out.
  - CSV: one clean row per order (Order No, Date, Time, Status, Payment, Table, Customer, Cashier, Items, Subtotal, Discount, Tax, Total), money to 2 decimals, column names in the chosen language. It opens correctly in Excel (UTF-8 with BOM), and text that would run as a formula is neutralised.
- **Products (Admin):** Menu › Add / edit / delete. You can add a photo from a file or the webcam, and fill the barcode with *Scan to fill*. *Import* reads CSV or Excel with the columns Barcode, Name, Price, Category, Stock, Low Stock, Emoji, Available At (older files with `lowStock`-style headers still import). *Excel* / *CSV* export the same columns.
- **Categories (Admin):** Menu › *Categories*. Add, rename, change the tag text shown on product cards, the icon and the color. A category can be deleted once no product uses it.
- **Tables:** the Table page shows a **Map** (floor plan, colored by status: free, cooking, ready, waiting for payment) or a **List** by zone. Tap a free table to start an order for it; tap a busy one to pay or move its status. Admins have **+ Add table**.
- **Table map layout (Admin):** Settings › *Table map*. Drag tables with mouse or finger, tap one to change its name, zone, seats, shape (square/round) and size, or delete it. Set the floor width, depth and snap grid. Nothing is stored until **Save layout**.
- **Low-power mode:** Settings › *Appearance* › *Performance*. For older or slower PCs (4 GB RAM, Celeron/Pentium): turns off animations, blur and soft shadows, and camera scanning decodes 3 times a second instead of 9. Keyboard, serial and USB scanners are unaffected.
- **Language & theme:** Settings › *Appearance* (every user, applies instantly). Receipts printed through the *System printer* and PDFs use the chosen language. Raw ESC/POS receipts print Chinese labels in English, because most thermal printers need a special Chinese code page.
- **Backups (Admin):** a backup is made at every start and on the schedule you set. The last 20 are kept in the `backups` folder next to the database. Use *Save backup as…* to copy one to a USB stick. **Restore… replaces all current data**. It makes a safety backup first, then restarts the app.
- **Kiosk mode:** the ⛶ button in the title bar, or Settings › System. Only an Admin can leave kiosk mode when it is set in Settings.
- **Customer display:** Settings › System. Opens fullscreen on the second monitor, or as a window if there is only one.

## 6. Security notes

- `contextIsolation` and `sandbox` are on, and `nodeIntegration` is off. The renderer reaches native code only through the typed `window.api` bridge (`src/preload`).
- Every IPC call is validated with zod in the main process and checked against the signed-in user's role. The main process recomputes prices, stock and totals; it never trusts the renderer.
- The production build has a strict Content Security Policy. Requests to anything other than the app's own files are blocked, so the app loads no remote content.
- PINs are stored as salted scrypt hashes.

## 7. Project layout

```
src/
  main/        Electron main: db.ts (migrations + seed), repo.ts (queries), ipc.ts (validated handlers),
               scanners.ts (serial + HID), printer.ts / receipt.ts (ESC/POS + HTML), backup.ts, io.ts (CSV/Excel)
  preload/     contextBridge API
  renderer/    React app: pages/, components/, store/ (Zustand), lib/ (wedge detector, scan bus, api)
  shared/      types, IPC channel names, cart math
tests/
  unit/        Vitest
  e2e/         Playwright (Electron)
```
