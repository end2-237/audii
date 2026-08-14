/**
 * Types partagés entre le process principal (Node) et le renderer (React).
 * Ne jamais importer de module Node ici : ce fichier est bundlé des deux côtés.
 */

export interface Track {
  /** Identifiant stable dérivé du chemin absolu. */
  id: string
  /** Chemin absolu sur le disque. */
  path: string
  /** URL lisible par <audio> (protocole custom `audii://`). */
  url: string
  title: string
  artist: string
  album: string
  albumArtist: string
  genre: string
  /** Durée en secondes. */
  duration: number
  /** Numéro de piste dans l'album. */
  trackNo: number | null
  year: number | null
  /** BPM lu dans les tags ID3 (TBPM) si présent. */
  bpmTag: number | null
  /** BPM estimé par l'analyseur local (mis en cache). */
  bpmAnalyzed: number | null
  /** Énergie 0..1 estimée par l'analyseur local. */
  energy: number | null
  /** Data-URL de la pochette embarquée (miniature). */
  cover: string | null
  /** Dossier racine (playlist) auquel appartient le morceau. */
  folder: string
  /** Date d'ajout (mtime du fichier), timestamp ms. */
  addedAt: number
  size: number
}

export interface Playlist {
  id: string
  name: string
  /** Dossier source pour les playlists « dossier ». */
  path?: string
  kind: 'folder' | 'smart' | 'user'
  trackIds: string[]
  cover: string | null
  /** Durée cumulée en secondes. */
  duration: number
}

export interface Library {
  tracks: Track[]
  playlists: Playlist[]
  folders: string[]
  scannedAt: number
}

export interface ScanProgress {
  phase: 'discovering' | 'reading' | 'done' | 'idle' | 'error'
  current: number
  total: number
  /** Nom du fichier en cours de lecture. */
  file: string
  message: string
}

export interface Settings {
  folders: string[]
  volume: number
  lockVibe: boolean
  energy: number
  noiseSense: boolean
  noiseSensitivity: number
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  lastPlaylistId: string | null
  favorites: string[]
}

export interface AnalysisResult {
  bpm: number | null
  energy: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  folders: [],
  volume: 0.8,
  lockVibe: false,
  energy: 0.5,
  noiseSense: false,
  noiseSensitivity: 0.5,
  shuffle: false,
  repeat: 'off',
  lastPlaylistId: null,
  favorites: []
}

export const AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.wma',
  '.aiff',
  '.aif',
  '.mp4',
  '.webm'
]
