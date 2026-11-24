import type { BiteApi } from '@shared/ipc'

declare global {
  interface Window {
    api: BiteApi
    platform: NodeJS.Platform
  }
}

export {}
