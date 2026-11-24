import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Seeded product #1 "Sourdough Loaf" costs 6.50 with barcode 2000000000015 (tax 10% -> 7.15).
const BARCODE = '2000000000015'

let app: ElectronApplication

/** Types like a keyboard-wedge scanner: ~4 ms per key, then Enter. Runs inside the page so test-runner lag can't stretch the gaps. */
const scan = (code: string): Promise<void> =>
  page.evaluate(async (c) => {
    const target = document.activeElement ?? document.body
    for (const key of [...c, 'Enter']) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await new Promise((r) => setTimeout(r, 4))
    }
  }, code)
let page: Page
let dataDir: string

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bitepoint-e2e-'))
  app = await electron.launch({ args: ['.'], env: { ...process.env, BITEPOINT_DATA_DIR: dataDir, ELECTRON_RENDERER_URL: '' } })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
})

test('cashier scans an item with a keyboard-wedge scanner and pays cash', async () => {
  // sign in as the cashier with the PIN pad
  await page.getByRole('button', { name: /Sam Rivera/ }).click()
  await page.keyboard.type('0000')
  await expect(page.getByText('Nice! We have a lot of orders')).toBeVisible()

  await page.getByRole('button', { name: /CREATE NEW ORDER/ }).click()
  await expect(page.getByTestId('pos-search')).toBeVisible()
  await expect(page.getByTestId('product-card').first()).toBeVisible()
  await page.waitForTimeout(300) // let the grid finish mounting so keystroke timing is realistic

  await scan(BARCODE)

  const line = page.getByTestId('cart-line')
  await expect(line).toHaveCount(1)
  await expect(line).toContainText('Sourdough Loaf')
  await expect(page.getByTestId('cart-total')).toHaveText('$7.15')

  // scanning the same code again increments the quantity
  await scan(BARCODE)
  await expect(page.getByTestId('line-qty')).toHaveText('2')
  await expect(page.getByTestId('cart-total')).toHaveText('$14.30')

  // pay with cash: 20.00 received -> 5.70 change
  await page.getByTestId('place-order').click()
  await expect(page.getByTestId('pay-total')).toHaveText('$14.30')
  await page.getByTestId('cash-input').fill('20')
  await expect(page.getByTestId('pay-change')).toHaveText('$5.70')
  await page.getByTestId('confirm-payment').click()

  await expect(page.getByText('Payment complete')).toBeVisible()
  await expect(page.getByTestId('receipt-change')).toContainText('$5.70')
  await page.getByTestId('new-order').click()
  await expect(page.getByTestId('cart-line')).toHaveCount(0)
})

test('typing in the search box slowly is not treated as a scan', async () => {
  const search = page.getByTestId('pos-search')
  await search.click()
  await search.pressSequentially('croissant', { delay: 80 })
  await expect(search).toHaveValue('croissant')
  await expect(page.getByTestId('product-card')).toHaveCount(3)
})

test('language and dark mode switch instantly from Settings › Appearance', async () => {
  await page.evaluate(() => (location.hash = '/settings'))
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByTestId('lang-id').click()
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.evaluate(() => (location.hash = '/'))
  await expect(page.getByText('Mantap! Pesanan kita banyak')).toBeVisible()

  // back to English + light so other runs start clean
  await page.evaluate(() => (location.hash = '/settings'))
  await page.getByRole('button', { name: 'Tampilan' }).click()
  await page.getByTestId('lang-en').click()
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('low-power mode turns off animations', async () => {
  const toggle = page.getByRole('switch', { name: /Low-power mode/ })
  await toggle.click()
  await expect(page.locator('html')).toHaveClass(/low-power/)
  await page.evaluate(() => (location.hash = '/'))
  const anim = await page.locator('.animate-slide-in').first().evaluate((el) => getComputedStyle(el).animationName)
  expect(anim).toBe('none')
  await page.evaluate(() => (location.hash = '/settings'))
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByRole('switch', { name: /Low-power mode/ }).click()
  await expect(page.locator('html')).not.toHaveClass(/low-power/)
})

test('take-away order paid by QR', async () => {
  await page.evaluate(() => (location.hash = '/pos'))
  await page.getByTestId('type-takeaway').click()
  await expect(page.getByPlaceholder('Table')).toHaveCount(0)
  await page.getByTestId('product-card').first().click()
  await page.getByTestId('place-order').click()
  await page.getByRole('dialog').getByRole('button', { name: 'QR', exact: true }).click()
  await expect(page.getByText('No payment QR yet')).toBeVisible()
  await page.getByTestId('confirm-payment').click()
  await expect(page.getByTestId('receipt-type')).toContainText('Take away')
  await page.getByTestId('new-order').click()
  await expect(page.getByTestId('type-dine_in')).toHaveAttribute('aria-checked', 'true')
})
