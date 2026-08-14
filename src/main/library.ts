import { app } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import * as mm from 'music-metadata'
import { translate, type Lang } from '../shared/i18n'
import { AUDIO_EXTENSIONS, type Library, type Playlist, type ScanProgress, type Track } from '../shared/types'
import { mediaUrl } from './protocol'
import { store } from './store'

const SKIP_DIRS = new Set([
  'node_modules',
  '$RECYCLE.BIN',
  'System Volume Information',
  'AppData',
  '.git'
])

/** Dossier de cache des pochettes extraites des tags. */
export function coversDir(): string {
  return path.join(app.getPath('userData'), 'covers')
}

const hash = (value: string): string => createHash('sha1').update(value).digest('hex').slice(0, 16)

function isAudio(file: string): boolean {
  return AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase())
}

/** Parcours récursif tolérant aux erreurs (permissions Windows, liens cassés…). */
async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 12) return
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      await walk(full, out, depth + 1)
    } else if (entry.isFile() && isAudio(entry.name)) {
      out.push(full)
    }
  }
}

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
}

/**
 * Écrit la pochette sur disque (dédupliquée par album) et renvoie son URL
 * `audii://`. Garder les images hors du JSON évite un fichier de plusieurs
 * dizaines de Mo pour une grosse bibliothèque.
 */
async function extractCover(
  meta: mm.IAudioMetadata,
  albumKey: string,
  memo: Map<string, string | null>
): Promise<string | null> {
  if (memo.has(albumKey)) return memo.get(albumKey) ?? null
  const picture = meta.common.picture?.[0]
  if (!picture) {
    memo.set(albumKey, null)
    return null
  }
  const ext = IMAGE_EXT[picture.format?.toLowerCase() ?? ''] ?? '.jpg'
  const file = path.join(coversDir(), `${hash(albumKey)}${ext}`)
  try {
    await fs.mkdir(coversDir(), { recursive: true })
    // Réutilise le fichier s'il existe déjà (bibliothèque re-scannée).
    try {
      await fs.access(file)
    } catch {
      await fs.writeFile(file, Buffer.from(picture.data))
    }
    const url = mediaUrl(file)
    memo.set(albumKey, url)
    return url
  } catch {
    memo.set(albumKey, null)
    return null
  }
}

function cleanTitle(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/^\d{1,3}\s*[-._)]\s*/, '')
    .replace(/_/g, ' ')
    .trim()
}

function parseBpm(raw: unknown): number | null {
  const value = typeof raw === 'string' ? Number.parseFloat(raw) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(value) || value < 40 || value > 260) return null
  return Math.round(value)
}

async function toTrack(
  file: string,
  rootFolder: string,
  coverMemo: Map<string, string | null>
): Promise<Track | null> {
  let stat: import('node:fs').Stats
  try {
    stat = await fs.stat(file)
  } catch {
    return null
  }

  let meta: mm.IAudioMetadata | null = null
  try {
    meta = await mm.parseFile(file, { duration: true, skipPostHeaders: true })
  } catch {
    meta = null
  }

  const common = meta?.common
  // Vide plutôt qu'un libellé figé : l'interface traduit à l'affichage.
  const artist = common?.artist?.trim() || common?.albumartist?.trim() || ''
  const album = common?.album?.trim() || path.basename(path.dirname(file))
  const albumArtist = common?.albumartist?.trim() || artist
  const albumKey = `${albumArtist.toLowerCase()}::${album.toLowerCase()}`
  const cover = meta ? await extractCover(meta, albumKey, coverMemo) : null

  return {
    id: hash(file),
    path: file,
    url: mediaUrl(file),
    title: common?.title?.trim() || cleanTitle(file),
    artist,
    album,
    albumArtist,
    genre: common?.genre?.[0]?.trim() || '',
    duration: Math.max(0, Math.round(meta?.format.duration ?? 0)),
    trackNo: common?.track?.no ?? null,
    year: common?.year ?? null,
    bpmTag: parseBpm(common?.bpm),
    bpmAnalyzed: null,
    energy: null,
    cover,
    folder: rootFolder,
    addedAt: stat.mtimeMs,
    size: stat.size
  }
}

/** Exécute `worker` sur chaque élément avec une concurrence bornée. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function buildPlaylists(tracks: Track[]): Playlist[] {
  const byDir = new Map<string, Track[]>()
  for (const track of tracks) {
    const dir = path.dirname(track.path)
    const bucket = byDir.get(dir)
    if (bucket) bucket.push(track)
    else byDir.set(dir, [track])
  }

  const playlists: Playlist[] = []

  if (tracks.length > 0) {
    const sorted = [...tracks].sort((a, b) => b.addedAt - a.addedAt)
    playlists.push({
      id: 'all',
      name: 'all',
      kind: 'smart',
      trackIds: sorted.map((t) => t.id),
      cover: sorted.find((t) => t.cover)?.cover ?? null,
      duration: sorted.reduce((sum, t) => sum + t.duration, 0)
    })
  }

  for (const [dir, items] of byDir) {
    items.sort((a, b) => (a.trackNo ?? 0) - (b.trackNo ?? 0) || a.title.localeCompare(b.title))
    playlists.push({
      id: `dir:${hash(dir)}`,
      name: path.basename(dir) || dir,
      path: dir,
      kind: 'folder',
      trackIds: items.map((t) => t.id),
      cover: items.find((t) => t.cover)?.cover ?? null,
      duration: items.reduce((sum, t) => sum + t.duration, 0)
    })
  }

  // « Recent » : les dossiers les plus fraîchement alimentés d'abord.
  const recency = new Map<string, number>()
  for (const track of tracks) {
    const dir = `dir:${hash(path.dirname(track.path))}`
    recency.set(dir, Math.max(recency.get(dir) ?? 0, track.addedAt))
  }
  const [all, ...folders] = playlists
  folders.sort((a, b) => (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0))
  return all ? [all, ...folders] : folders
}

export type ProgressReporter = (progress: ScanProgress) => void

let scanning = false

export async function scanLibrary(folders: string[], report: ProgressReporter, lang: Lang = 'fr'): Promise<Library> {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
    translate(lang, key, params)
  if (scanning) throw new Error(t('error.scanRunning'))
  scanning = true
  try {
    report({ phase: 'discovering', current: 0, total: 0, file: '', message: t('scanner.exploring') })

    const discovered: { file: string; root: string }[] = []
    for (const folder of folders) {
      const files: string[] = []
      await walk(folder, files)
      for (const file of files) discovered.push({ file, root: folder })
      report({
        phase: 'discovering',
        current: discovered.length,
        total: discovered.length,
        file: folder,
        message: t('scanner.found', { count: discovered.length })
      })
    }

    // Dédoublonne si l'utilisateur a ajouté un dossier et son parent.
    const seen = new Set<string>()
    const unique = discovered.filter(({ file }) => {
      const key = file.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const coverMemo = new Map<string, string | null>()
    const analysis = await store.getAnalysis()
    let done = 0

    const parsed = await mapLimit(unique, 4, async ({ file, root }) => {
      const track = await toTrack(file, root, coverMemo)
      done += 1
      if (done % 5 === 0 || done === unique.length) {
        report({
          phase: 'reading',
          current: done,
          total: unique.length,
          file: path.basename(file),
          message: t('scanner.reading')
        })
      }
      return track
    })

    const tracks = parsed.filter((t): t is Track => t !== null)
    // Ré-applique le cache d'analyse (BPM / énergie) calculé lors des lectures.
    for (const track of tracks) {
      const cached = analysis[track.id]
      if (cached && cached.mtime === track.addedAt) {
        track.bpmAnalyzed = cached.bpm
        track.energy = cached.energy
      }
    }

    tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || (a.trackNo ?? 0) - (b.trackNo ?? 0))

    const library: Library = {
      tracks,
      playlists: buildPlaylists(tracks),
      folders,
      scannedAt: Date.now()
    }
    await store.setLibrary(library)
    report({
      phase: 'done',
      current: tracks.length,
      total: tracks.length,
      file: '',
      message: t('scanner.done', { count: tracks.length })
    })
    return library
  } finally {
    scanning = false
  }
}
