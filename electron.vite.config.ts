import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Strict CSP in production builds. Dev needs inline (React refresh) + HMR websocket.
const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "media-src 'self' blob: mediastream:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "media-src 'self' blob: mediastream:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*; object-src 'none'"

function csp(): Plugin {
  let isBuild = false
  return {
    name: 'bitepoint-csp',
    configResolved(c) {
      isBuild = c.command === 'build'
    },
    transformIndexHtml(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${isBuild ? PROD_CSP : DEV_CSP}" />`
      return html.replace('<!--CSP-->', tag)
    }
  }
}

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    // electron-vite externalizes package.json dependencies by default (native modules stay in node_modules)
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer') } },
    plugins: [react(), tailwindcss(), csp()]
  }
})
