import { protocol } from 'electron'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { coversDir } from './library'
import { store } from './store'

export const SCHEME = 'audii'

/** URL consommable par <audio>/<img> pour un fichier local arbitraire. */
export function mediaUrl(filePath: string): string {
  return `${SCHEME}://media/?p=${encodeURIComponent(filePath)}`
}

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** Doit être appelé avant app.whenReady(). */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
        corsEnabled: true
      }
    }
  ])
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * Autorise uniquement les fichiers situés sous un dossier de bibliothèque
 * déclaré par l'utilisateur (ou le cache de pochettes) : le renderer ne peut
 * pas se servir de ce protocole pour lire n'importe quoi sur le disque.
 */
async function isAllowed(target: string): Promise<boolean> {
  if (isInside(target, coversDir())) return true
  const settings = await store.getSettings()
  return settings.folders.some((folder) => isInside(target, folder) || path.resolve(folder) === target)
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  let start: number
  let end: number
  if (rawStart === '') {
    // Suffixe : les N derniers octets.
    const suffix = Number.parseInt(rawEnd, 10)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number.parseInt(rawStart, 10)
    end = rawEnd === '' ? size - 1 : Number.parseInt(rawEnd, 10)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

export function registerHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    let target: string
    try {
      const raw = new URL(request.url).searchParams.get('p')
      if (!raw) return new Response('Missing path', { status: 400 })
      target = path.resolve(raw)
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    if (!(await isAllowed(target))) return new Response('Forbidden', { status: 403 })

    let size: number
    try {
      const stat = await fs.stat(target)
      if (!stat.isFile()) return new Response('Not found', { status: 404 })
      size = stat.size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
    const range = parseRange(request.headers.get('Range'), size)

    // Les requêtes Range sont indispensables : sans 206, impossible de se
    // déplacer dans un morceau avec <audio>.
    const { start, end } = range ?? { start: 0, end: size - 1 }
    const stream = createReadStream(target, { start, end })
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>

    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  })
}
