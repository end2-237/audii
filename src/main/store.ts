import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, type Library, type Settings } from '../shared/types'

/**
 * Petit store JSON sur disque (userData). Pas de dépendance externe :
 * écriture atomique via fichier temporaire + rename.
 */
class JsonFile<T> {
  private readonly file: string
  private cache: T | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(name: string, private readonly fallback: T) {
    this.file = path.join(app.getPath('userData'), name)
  }

  async read(): Promise<T> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      this.cache = { ...this.fallback, ...(JSON.parse(raw) as T) }
    } catch {
      this.cache = { ...this.fallback }
    }
    return this.cache as T
  }

  async write(value: T): Promise<void> {
    this.cache = value
    const tmp = `${this.file}.tmp`
    const payload = JSON.stringify(value)
    // Sérialise les écritures pour éviter deux rename() concurrents.
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await fs.writeFile(tmp, payload, 'utf8')
      await fs.rename(tmp, this.file)
    })
    return this.writing
  }
}

const settingsFile = new JsonFile<Settings>('settings.json', DEFAULT_SETTINGS)

const emptyLibrary: Library = { tracks: [], playlists: [], folders: [], scannedAt: 0 }
const libraryFile = new JsonFile<Library>('library.json', emptyLibrary)

export interface AnalysisCacheEntry {
  bpm: number | null
  energy: number | null
  /** mtime du fichier au moment de l'analyse, pour invalider si modifié. */
  mtime: number
}

const analysisFile = new JsonFile<Record<string, AnalysisCacheEntry>>('analysis.json', {})

export const store = {
  getSettings: () => settingsFile.read(),
  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = await settingsFile.read()
    const next = { ...current, ...patch }
    await settingsFile.write(next)
    return next
  },
  getLibrary: () => libraryFile.read(),
  setLibrary: (lib: Library) => libraryFile.write(lib),
  getAnalysis: () => analysisFile.read(),
  async setAnalysis(id: string, entry: AnalysisCacheEntry): Promise<void> {
    const all = await analysisFile.read()
    all[id] = entry
    await analysisFile.write(all)
  }
}
