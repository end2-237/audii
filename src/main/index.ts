import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { scanLibrary } from './library'
import { registerHandler, registerScheme } from './protocol'
import { captureSplash, runSmoke, smokeDir } from './smoke'
import { store } from './store'
import type { Library, ScanProgress, Settings } from '../shared/types'

const isDev = !app.isPackaged
const devServer = process.env.AUDII_DEV_SERVER
const rendererDir = path.join(__dirname, '../renderer')

/** Durée minimale d'affichage du splash : le logo doit avoir le temps de vivre. */
const SPLASH_MIN_MS = 2600

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let splashShownAt = 0
let rendererReady = false
let bootDone = false

registerScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of [mainWindow, splashWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 560,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    title: 'Audii',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  splashWindow.once('ready-to-show', () => {
    splashShownAt = Date.now()
    splashWindow?.show()
  })

  // Le boot commence avant que le splash n'ait chargé : on rejoue le dernier statut.
  splashWindow.webContents.on('did-finish-load', () => {
    splashWindow?.webContents.send('splash:status', lastStatus)
  })

  if (devServer) void splashWindow.loadURL(`${devServer}/splash.html`)
  else void splashWindow.loadFile(path.join(rendererDir, 'splash.html'))
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1020,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0b0910',
    title: 'Audii',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Le preload n'utilise que contextBridge/ipcRenderer : compatible bac à sable.
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:state', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:state', false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Noise Sense a besoin du micro ; tout le reste est refusé.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  if (devServer) void mainWindow.loadURL(devServer)
  else void mainWindow.loadFile(path.join(rendererDir, 'index.html'))

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
}

/** Bascule splash -> fenêtre principale quand tout est prêt. */
function revealMainWindow(): void {
  if (!rendererReady || !bootDone || !mainWindow) return
  const elapsed = Date.now() - splashShownAt
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed)
  setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (smokeDir && splashWindow) await captureSplash(splashWindow)
    splashStatus('Prêt', 1, true)
    // Laisse jouer l'animation de sortie du splash.
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close()
        splashWindow = null
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
        if (smokeDir) void runSmoke(mainWindow)
      }
    }, 420)
  }, wait)
}

/** Dernier statut émis : rejoué si le splash finit de charger après coup. */
let lastStatus = { message: 'Initialisation…', progress: 0.04, done: false }

function splashStatus(message: string, progress: number, done = false): void {
  lastStatus = { message, progress, done }
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.webContents.send('splash:status', lastStatus)
}

/**
 * Premier lancement : on pointe automatiquement le dossier Musique de
 * l'utilisateur pour qu'il ait de vrais morceaux dès l'ouverture.
 */
async function ensureDefaultFolder(settings: Settings): Promise<Settings> {
  if (settings.folders.length > 0) return settings
  const candidates = [app.getPath('music'), path.join(app.getPath('home'), 'Music')]
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) return store.setSettings({ folders: [candidate] })
    } catch {
      /* dossier absent : on laisse l'utilisateur choisir */
    }
  }
  return settings
}

async function boot(): Promise<void> {
  try {
    splashStatus('Chargement des préférences…', 0.1)
    const settings = await ensureDefaultFolder(await store.getSettings())

    splashStatus('Ouverture de la bibliothèque…', 0.25)
    const cached = await store.getLibrary()

    if (cached.tracks.length > 0) {
      // Démarrage instantané sur le cache, re-scan en tâche de fond.
      splashStatus(`${cached.tracks.length} morceaux en cache`, 0.9)
      bootDone = true
      revealMainWindow()
      void rescan(settings.folders)
      return
    }

    if (settings.folders.length === 0) {
      splashStatus('Aucun dossier musical configuré', 0.9)
      bootDone = true
      revealMainWindow()
      return
    }

    splashStatus('Analyse de vos fichiers audio…', 0.4)
    await scanLibrary(settings.folders, (progress) => {
      broadcast('library:progress', progress)
      const ratio = progress.total > 0 ? progress.current / progress.total : 0
      splashStatus(
        progress.phase === 'discovering'
          ? `Exploration… ${progress.current} fichier(s)`
          : `Lecture des métadonnées ${progress.current}/${progress.total}`,
        0.4 + ratio * 0.55
      )
    })
  } catch (error) {
    splashStatus('Démarrage en mode dégradé', 0.9)
    console.error('[audii] boot failed', error)
  } finally {
    bootDone = true
    revealMainWindow()
  }
}

let rescanning = false

/** Re-scan de la bibliothèque : au démarrage (en fond) ou à la demande. */
async function rescan(folders: string[]): Promise<Library> {
  if (rescanning) return store.getLibrary()
  rescanning = true
  try {
    const library = await scanLibrary(folders, (progress) => broadcast('library:progress', progress))
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:updated', library)
    return library
  } catch (error) {
    console.error('[audii] scan failed', error)
    broadcast('library:progress', {
      phase: 'error',
      current: 0,
      total: 0,
      file: '',
      message: error instanceof Error ? error.message : 'Scan impossible'
    } satisfies ScanProgress)
    return store.getLibrary()
  } finally {
    rescanning = false
  }
}

function registerIpc(): void {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    userData: app.getPath('userData')
  }))

  ipcMain.on('app:renderer-ready', () => {
    rendererReady = true
    revealMainWindow()
  })

  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => store.setSettings(patch))

  ipcMain.handle('library:get', () => store.getLibrary())

  ipcMain.handle('library:scan', async () => {
    const settings = await store.getSettings()
    return rescan(settings.folders)
  })

  ipcMain.handle('library:addFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Ajouter un dossier musical',
      properties: ['openDirectory', 'multiSelections', 'dontAddToRecent']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const settings = await store.getSettings()
    const folders = Array.from(new Set([...settings.folders, ...result.filePaths]))
    await store.setSettings({ folders })
    return rescan(folders)
  })

  ipcMain.handle('library:removeFolder', async (_event, folder: string) => {
    const settings = await store.getSettings()
    const folders = settings.folders.filter((item) => item !== folder)
    await store.setSettings({ folders })
    return rescan(folders)
  })

  ipcMain.handle('library:reveal', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('analysis:save', async (_event, payload: { id: string; bpm: number | null; energy: number | null; mtime: number }) => {
    await store.setAnalysis(payload.id, { bpm: payload.bpm, energy: payload.energy, mtime: payload.mtime })
    // Met à jour la bibliothèque en cache pour ne pas re-analyser au prochain lancement.
    const library = await store.getLibrary()
    const track = library.tracks.find((item) => item.id === payload.id)
    if (track) {
      track.bpmAnalyzed = payload.bpm
      track.energy = payload.energy
      store.saveLibrarySoon(library)
    }
  })

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  registerHandler()
  registerIpc()
  createSplash()
  createMainWindow()
  void boot()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
