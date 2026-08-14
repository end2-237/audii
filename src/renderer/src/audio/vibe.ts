import type { Track } from '@shared/types'
import { SAME_UNIVERSE, styleAffinity, styleOf, type StyleFamily } from './style'

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
  /** Rester dans l'univers musical du morceau en cours. */
  styleLock: boolean
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

  const ranked = rankFollowUps(queue, current, options)
  // Un peu d'aléatoire parmi les tout meilleurs, pour ne pas boucler.
  const head = ranked.slice(0, 3)
  const pick = head[Math.floor(Math.random() * head.length)]
  return pick?.track ?? queue[(index + 1) % queue.length]
}

export interface FollowUp {
  track: Track
  score: number
  bpm: number | null
  /** Écart au tempo cible, en BPM (null si tempo inconnu). */
  delta: number | null
  /** Proximité de style avec le morceau en cours (0 à 1). */
  affinity: number
  style: StyleFamily | null
}

/**
 * Classe les morceaux susceptibles de suivre celui en cours.
 *
 * Le score combine **tempo** et **style** : naviguer au BPM seul ferait
 * passer d'un gospel à un morceau de drill parce qu'ils tournent tous deux à
 * 140. Le style pèse donc un peu plus que le tempo, et `styleLock` restreint
 * carrément les candidats au même univers dès qu'il y en a assez.
 */
export function rankFollowUps(
  pool: Track[],
  current: Track | null,
  options: Pick<VibeOptions, 'energy' | 'tapBpm' | 'history' | 'styleLock'>
): FollowUp[] {
  const reference = options.tapBpm ?? (current ? trackBpm(current) : null)
  const target = reference ? reference * energyToFactor(options.energy) : null
  const recent = new Set(options.history.slice(-8))

  const scored: FollowUp[] = []
  for (const track of pool) {
    if (track.id === current?.id) continue
    const bpm = trackBpm(track)
    const delta = bpm !== null && target !== null ? bpm - target : null

    // Tempo : 1 sur la cible, 0 à 40 BPM d'écart. Sans tempo connu, on reste
    // candidat mais en retrait.
    const tempoScore = delta === null ? 0.25 : 1 - Math.min(1, Math.abs(delta) / 40)
    const affinity = current ? styleAffinity(current, track) : 0.5

    let score = tempoScore * 0.45 + affinity * 0.55
    if (track.energy !== null) score += (1 - Math.abs(track.energy - options.energy)) * 0.08
    if (recent.has(track.id)) score -= 0.8

    scored.push({ track, score, bpm, delta, affinity, style: styleOf(track) })
  }

  scored.sort((a, b) => b.score - a.score)

  if (options.styleLock && current) {
    // On ne bascule vers un autre univers que s'il n'y a pas de quoi tenir
    // dans celui du morceau en cours.
    const sameUniverse = scored.filter((item) => item.affinity >= SAME_UNIVERSE)
    if (sameUniverse.length >= 3) return sameUniverse
  }

  return scored
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
