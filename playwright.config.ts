import { defineConfig } from '@playwright/test'

// Drives the built Electron app (run `npm run e2e`, which builds first).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
})
