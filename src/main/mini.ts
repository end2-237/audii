import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import type { PlayerSnapshot } from '../shared/types'
import { store } from './store'

/**
 * Mini-lecteur flottant.
 *
 * Quand la fenêtre principale est réduite, une petite fenêtre sans cadre
 * reste au-dessus des autres applications : pochette, titre, transport. Elle
 * peut aussi se replier en pastille pour ne presque plus rien occuper.
 */

export const MINI_EXPANDED = { width: 322, height: 92 }
export const MINI_COLLAPSED = { width: 68, height: 68 }

let miniWindow: BrowserWindow | null = null
let collapsed = false
let lastSnapshot: PlayerSnapshot | null = null

const rendererDir = path.join(__dirname, '../renderer')
const devServer = process.env.AUDII_DEV_SERVER

/** Coin bas-droit de l'écran courant, avec une marge. */
function defaultPosition(width: number, height: number): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + workArea.height - height - 24)
  }
}

/** Fenêtre du mini-lecteur, pour les captures du test de fumée. */
export function getMiniWindow(): BrowserWindow | null {
  return miniWindow && !miniWindow.isDestroyed() ? miniWindow : null
}

async function createMini(): Promise<BrowserWindow> {
  const settings = await store.getSettings()
  const size = collapsed ? MINI_COLLAPSED : MINI_EXPANDED
  const position = settings.miniPosition ?? defaultPosition(size.width, size.height)

  const window = new BrowserWindow({
    ...size,
    ...position,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    title: 'Audii',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  // « floating » place la fenêtre au-dessus des applications ordinaires sans
  // passer devant les alertes système.
  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  window.on('moved', () => {
    if (!miniWindow || miniWindow.isDestroyed()) return
    const [x, y] = miniWindow.getPosition()
    void store.setSettings({ miniPosition: { x, y } })
  })

  window.on('closed', () => {
    miniWindow = null
  })

  if (devServer) await window.loadURL(`${devServer}/mini.html`)
  else await window.loadFile(path.join(rendererDir, 'mini.html'))

  miniWindow = window
  return window
}

export async function showMini(): Promise<void> {
  const window = miniWindow && !miniWindow.isDestroyed() ? miniWindow : await createMini()
  if (lastSnapshot) window.webContents.send('mini:state', lastSnapshot)
  window.showInactive()
  window.setAlwaysOnTop(true, 'floating')
}

export function hideMini(): void {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.hide()
}

export function destroyMini(): void {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy()
  miniWindow = null
}

/** Relaie l'état du lecteur (publié par la fenêtre principale). */
export function pushSnapshot(snapshot: PlayerSnapshot): void {
  lastSnapshot = snapshot
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('mini:state', snapshot)
}

/** Bascule pastille / bandeau, en gardant le coin bas-droit ancré. */
export function setCollapsed(next: boolean): void {
  collapsed = next
  if (!miniWindow || miniWindow.isDestroyed()) return
  const size = next ? MINI_COLLAPSED : MINI_EXPANDED
  const bounds = miniWindow.getBounds()
  miniWindow.setBounds({
    x: bounds.x + bounds.width - size.width,
    y: bounds.y + bounds.height - size.height,
    ...size
  })
}
