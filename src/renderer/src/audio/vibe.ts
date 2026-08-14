import type { Track } from '@shared/types'

/** BPM connu d'un morceau : tag ID3 d'abord, analyse locale ensuite. */
export const trackBpm = (track: Track): number | null => track.bpmTag ?? track.bpmAnalyzed ?? null

/**
 * Le curseur d'énergie déforme le tempo de référence :
 * 0 = Rest (-20 %), 0.5 = neutre, 1 = Hype (+20 %).
 */
export const energyToFactor = (energy: number): number => 0.8 + energy * 0.4

export const ENERGY_LABELS = ['Rest', 'Chill', 'Flow', 'Focus', 'Hype'] as const

export function energyLabel(energy: number): string {
  const index = Math.min(ENERGY_LABELS.length - 1, Math.floor(energy * ENERGY_LABELS.length))
  return ENERGY_LABELS[index]
}

export interface VibeOptions {
  lockVibe: boolean
  energy: number
  /** BPM imposé par le Tap-Tempo (prioritaire sur le morceau courant). */
  tapBpm: number | null
  shuffle: boolean
  /** Morceaux récemment joués, à éviter. */
  history: string[]
}

/**
 * Choisit le morceau suivant.
 *
 * - Lock-Vibe désactivé : ordre de la playlist (ou aléatoire si shuffle).
 * - Lock-Vibe activé : continuité rythmique — on cherche le morceau dont le
 *   tempo est le plus proche de la cible, avec un bonus si l'artiste ou le
 *   genre reste cohérent, et une pénalité pour ce qui vient d'être joué.
 */
export function pickNextTrack(
  queue: Track[],
  current: Track | null,
  options: VibeOptions
): Track | null {
  if (queue.length === 0) return null
  const index = current ? queue.findIndex((track) => track.id === current.id) : -1

  if (!options.lockVibe) {
    if (options.shuffle) {
      const pool = queue.filter((track) => track.id !== current?.id)
      if (pool.length === 0) return queue[0]
      return pool[Math.floor(Math.random() * pool.length)]
    }
    return queue[(index + 1) % queue.length]
  }

  const reference = options.tapBpm ?? (current ? trackBpm(current) : null)
  if (!reference) {
    // Pas de tempo de référence : on garde l'ordre naturel.
    return queue[(index + 1) % queue.length]
  }

  const target = reference * energyToFactor(options.energy)
  const recent = new Set(options.history.slice(-8))

  let best: Track | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const track of queue) {
    if (track.id === current?.id) continue
    const bpm = trackBpm(track)
    // Sans tempo connu on reste candidat, mais avec un score prudent.
    let score = bpm === null ? -0.35 : 1 - Math.min(1, Math.abs(bpm - target) / 40)

    if (current) {
      if (track.artist === current.artist) score += 0.12
      if (track.genre && track.genre === current.genre) score += 0.1
      if (track.album === current.album) score += 0.06
    }
    if (track.energy !== null) score += (1 - Math.abs(track.energy - options.energy)) * 0.15
    if (recent.has(track.id)) score -= 0.8
    // Bruit léger : évite de toujours enchaîner le même morceau.
    score += Math.random() * 0.05

    if (score > bestScore) {
      bestScore = score
      best = track
    }
  }

  return best ?? queue[(index + 1) % queue.length]
}

/** Moyenne des intervalles entre les taps, convertie en BPM. */
export function tapsToBpm(taps: number[]): number | null {
  if (taps.length < 2) return null
  const recent = taps.slice(-5)
  const intervals: number[] = []
  for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1])
  const valid = intervals.filter((interval) => interval > 250 && interval < 2000)
  if (valid.length === 0) return null
  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length
  return Math.round(60000 / average)
}
