import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
test('moved table and new table survive a restart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'bp-persist-'))
  const open = async () => {
    const app = await electron.launch({ args: ['.'], env: { ...process.env, BITEPOINT_DATA_DIR: dataDir, ELECTRON_RENDERER_URL: '' } })
    const page = await app.firstWindow()
    await page.getByRole('button', { name: /Jordan Lee/ }).click()
    await page.keyboard.type('1234')
    await page.getByText('Nice! We have').waitFor()
    return { app, page }
  }
  let { app, page } = await open()
  await page.evaluate(() => (location.hash = '/tables'))
  await page.getByTestId('add-table').click()
  await page.getByTestId('add-table-save').click()
  await expect(page.getByTestId('floor-table')).toHaveCount(25)
  await page.evaluate(() => (location.hash = '/settings'))
  await page.getByRole('button', { name: 'Table map' }).click()
  const tb = page.getByTestId('floor-table').first()
  // wait until the floor has been measured and stops moving
  let b = (await tb.boundingBox())!
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    const nb = (await tb.boundingBox())!
    if (nb.x === b.x && nb.y === b.y && nb.width === b.width) break
    b = nb
  }
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 280, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await tb.boundingBox())!.y).toBeGreaterThan(b.y + 100)
  const before = await page.evaluate(async () => (await window.api.tables.list()))
  await page.getByTestId('save-layout').click()
  await page.getByText('Table layout saved').waitFor()
  const saved = await page.evaluate(async () => (await window.api.tables.list()))
  const pid = app.process().pid!
  await app.close()
  // the single-instance lock is only released once the old process is fully gone
  for (let i = 0; i < 100 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100))
  ;({ app, page } = await open())
  const after = await page.evaluate(async () => (await window.api.tables.list()))
  await app.close()
  if (!before.ok || !saved.ok || !after.ok) throw new Error('list failed')
  const a1Before = before.data.find((t) => t.name === 'A1')!
  const a1After = after.data.find((t) => t.name === 'A1')!
  console.log('A1 before', a1Before.x, a1Before.y, 'after restart', a1After.x, a1After.y, 'tables', after.data.length)
  expect(after.data).toHaveLength(25)
  expect(a1After.y).toBeGreaterThan(a1Before.y)
  expect(after.data).toEqual(saved.data)
})
