import type { AudiiApi } from '../../preload'

declare global {
  interface Window {
    audii: AudiiApi
  }
}

export {}
