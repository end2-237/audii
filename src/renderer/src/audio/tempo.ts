import type { Playlist, SortDirection, Track } from '@shared/types'
import { trackBpm } from './vibe'

/**
 * Playlists tempo générées automatiquement.
 *
 * Les morceaux sont regroupés par tranches de 10 BPM (« à peu près le même
 * tempo »), puis triés à l'intérieur de chaque tranche. Le sens du tri — du
 * plus rapide au plus lent ou l'inverse — est piloté par l'utilisateur.
 */

export const BAND_WIDTH = 10

/** Étiquette d'ambiance associée à une tranche de tempo. */
export function tempoZone(bpm: number): string {
  if (bpm < 80) return 'Rest'
  if (bpm < 95) return 'Chill'
  if (bpm < 110) return 'Groove'
  if (bpm < 125) return 'Flow'
  if (bpm < 140) return 'Drive'
  if (bpm < 160) return 'Hype'
  return 'Rush'
}

export const bandFloor = (bpm: number): number => Math.floor(bpm / BAND_WIDTH) * BAND_WIDTH

const compare = (direction: SortDirection) => (a: number, b: number) =>
  direction === 'desc' ? b - a : a - b

/** Trie une liste de morceaux par tempo, les tempos inconnus à la fin. */
export function sortByBpm(tracks: Track[], direction: SortDirection): Track[] {
  const order = compare(direction)
  return [...tracks].sort((a, b) => {
    const left = trackBpm(a)
    const right = trackBpm(b)
    if (left === null && right === null) return a.title.localeCompare(b.title)
    if (left === null) return 1
    if (right === null) return -1
    return order(left, right) || a.title.localeCompare(b.title)
  })
}

export interface TempoPlaylist extends Playlist {
  /** Borne basse de la tranche, en BPM. */
  bpmFloor: number
  zone: string
  averageBpm: number
}

/**
 * Construit une playlist par tranche de tempo présente dans la bibliothèque.
 * Les morceaux dont le BPM est encore inconnu sont ignorés : ils
 * réapparaîtront dès que l'analyse locale les aura traités.
 */
export function buildTempoPlaylists(tracks: Track[], direction: SortDirection): TempoPlaylist[] {
  const bands = new Map<number, Track[]>()

  for (const track of tracks) {
    const bpm = trackBpm(track)
    if (bpm === null) continue
    const floor = bandFloor(bpm)
    const bucket = bands.get(floor)
    if (bucket) bucket.push(track)
    else bands.set(floor, [track])
  }

  const order = compare(direction)

  return [...bands.entries()]
    .sort(([a], [b]) => order(a, b))
    .map(([floor, items]) => {
      const sorted = sortByBpm(items, direction)
      const sum = sorted.reduce((total, track) => total + (trackBpm(track) ?? 0), 0)
      return {
        id: `bpm:${floor}`,
        name: `${floor}–${floor + BAND_WIDTH - 1} BPM`,
        kind: 'smart' as const,
        trackIds: sorted.map((track) => track.id),
        cover: sorted.find((track) => track.cover)?.cover ?? null,
        duration: sorted.reduce((total, track) => total + track.duration, 0),
        bpmFloor: floor,
        zone: tempoZone(floor),
        averageBpm: Math.round(sum / sorted.length)
      }
    })
}

/** Combien de morceaux attendent encore une estimation de tempo. */
export const countUnanalyzed = (tracks: Track[]): number =>
  tracks.reduce((total, track) => total + (trackBpm(track) === null ? 1 : 0), 0)
