import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    __LOGINOM_AI_AGENT__?: {
      deepLinks?: string[]
    }
  }
}
