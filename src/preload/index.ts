import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Library, MiniCommand, PlayerSnapshot, ScanProgress, Settings } from '../shared/types'

export interface SplashStatus {
  message: string
  progress: number
  done: boolean
}

export interface AppInfo {
  version: string
  platform: string
  electron: string
  userData: string
}

const subscribe = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  rendererReady: (): void => ipcRenderer.send('app:renderer-ready'),

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch)
  },

  library: {
    get: (): Promise<Library> => ipcRenderer.invoke('library:get'),
    scan: (): Promise<Library> => ipcRenderer.invoke('library:scan'),
    addFolder: (): Promise<Library | null> => ipcRenderer.invoke('library:addFolder'),
    removeFolder: (folder: string): Promise<Library> => ipcRenderer.invoke('library:removeFolder', folder),
    reveal: (filePath: string): Promise<void> => ipcRenderer.invoke('library:reveal', filePath),
    onProgress: (listener: (progress: ScanProgress) => void) => subscribe('library:progress', listener),
    onUpdated: (listener: (library: Library) => void) => subscribe('library:updated', listener)
  },

  analysis: {
    save: (payload: { id: string; bpm: number | null; energy: number | null; mtime: number }): Promise<void> =>
      ipcRenderer.invoke('analysis:save', payload)
  },

  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    maximize: (): void => ipcRenderer.send('window:maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onStateChange: (listener: (maximized: boolean) => void) => subscribe('window:state', listener)
  },

  splash: {
    onStatus: (listener: (status: SplashStatus) => void) => subscribe('splash:status', listener)
  },

  /** Pont entre la fenêtre principale (qui détient le son) et le mini-lecteur. */
  mini: {
    publish: (snapshot: PlayerSnapshot): void => ipcRenderer.send('player:publish', snapshot),
    onState: (listener: (snapshot: PlayerSnapshot) => void) => subscribe('mini:state', listener),
    send: (command: MiniCommand): void => ipcRenderer.send('mini:command', command),
    onCommand: (listener: (command: MiniCommand) => void) => subscribe('mini:command', listener),
    setCollapsed: (collapsed: boolean): void => ipcRenderer.send('mini:collapsed', collapsed),
    restoreMain: (): void => ipcRenderer.send('mini:restore')
  }
}

export type AudiiApi = typeof api

contextBridge.exposeInMainWorld('audii', api)
