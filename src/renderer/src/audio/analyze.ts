import type { AnalysisResult, Track } from '@shared/types'

/**
 * Estimation locale du tempo et de l'énergie.
 *
 * Pipeline : décodage -> enveloppe RMS (fenêtres de ~11 ms) -> fonction
 * d'attaque (flux positif) -> autocorrélation sur les décalages correspondant
 * à 60-200 BPM -> désambiguïsation demi/double tempo.
 *
 * Tout est fait en local, sans réseau ni dépendance externe.
 */

const MAX_BYTES = 60 * 1024 * 1024
const WINDOW_SECONDS = 60
const MIN_BPM = 60
const MAX_BPM = 200
/**
 * Un signal périodique corrèle aussi bien à T qu'à 2T : l'autocorrélation seule
 * ne peut pas trancher l'octave. On applique donc la pondération log-normale
 * usuelle, centrée sur le tempo le plus fréquent en musique (~120 BPM).
 */
const TEMPO_CENTER = 120
const TEMPO_SPREAD = 0.6

const octaveWeight = (bpm: number): number =>
  Math.exp(-0.5 * (Math.log(bpm / TEMPO_CENTER) / TEMPO_SPREAD) ** 2)

let context: AudioContext | null = null
const decodeContext = (): AudioContext => {
  if (!context) context = new AudioContext()
  return context
}

function toMono(buffer: AudioBuffer, startSample: number, length: number): Float32Array {
  const mono = new Float32Array(length)
  const channels = Math.min(buffer.numberOfChannels, 2)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) mono[i] += data[startSample + i] / channels
  }
  return mono
}

interface Envelope {
  onsets: Float32Array
  framesPerSecond: number
  rms: number
  peak: number
}

function buildEnvelope(samples: Float32Array, sampleRate: number): Envelope {
  const hop = Math.max(64, Math.round(sampleRate / 86)) // ~11.6 ms
  const frames = Math.floor(samples.length / hop)
  const energy = new Float32Array(frames)

  let total = 0
  let peak = 0
  for (let f = 0; f < frames; f++) {
    let sum = 0
    const start = f * hop
    for (let i = 0; i < hop; i++) {
      const value = samples[start + i]
      sum += value * value
      const abs = value < 0 ? -value : value
      if (abs > peak) peak = abs
    }
    const rms = Math.sqrt(sum / hop)
    energy[f] = rms
    total += rms
  }

  // Fonction d'attaque : seules les hausses d'énergie comptent.
  const onsets = new Float32Array(frames)
  for (let f = 1; f < frames; f++) {
    const diff = energy[f] - energy[f - 1]
    onsets[f] = diff > 0 ? diff : 0
  }

  // Centrage : supprime la composante continue qui fausse l'autocorrélation.
  let mean = 0
  for (let f = 0; f < frames; f++) mean += onsets[f]
  mean /= Math.max(1, frames)
  for (let f = 0; f < frames; f++) onsets[f] = Math.max(0, onsets[f] - mean)

  return { onsets, framesPerSecond: sampleRate / hop, rms: total / Math.max(1, frames), peak }
}

function detectTempo(envelope: Envelope): number | null {
  const { onsets, framesPerSecond } = envelope
  const minLag = Math.floor((60 / MAX_BPM) * framesPerSecond)
  const maxLag = Math.ceil((60 / MIN_BPM) * framesPerSecond)
  if (onsets.length < maxLag * 3) return null

  const scores = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    const limit = onsets.length - lag
    for (let i = 0; i < limit; i++) sum += onsets[i] * onsets[i + lag]
    // Normalisation par le nombre de termes : sinon les petits lags gagnent toujours.
    scores[lag] = sum / limit
  }

  // Renforce les lags dont les multiples résonnent aussi (vraie pulsation).
  let bestLag = -1
  let bestScore = -1
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = scores[lag]
    for (const multiple of [2, 3, 4]) {
      const target = lag * multiple
      if (target <= maxLag) score += scores[target] * (0.5 / multiple)
    }
    score *= octaveWeight((60 * framesPerSecond) / lag)
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestScore <= 0) return null

  let bpm = (60 * framesPerSecond) / bestLag
  while (bpm < MIN_BPM && bpm * 2 <= MAX_BPM) bpm *= 2
  while (bpm > MAX_BPM && bpm / 2 >= MIN_BPM) bpm /= 2
  return Math.round(bpm)
}

/** Analyse un morceau ; renvoie `null` si le fichier n'est pas exploitable. */
export async function analyzeTrack(track: Track): Promise<AnalysisResult | null> {
  if (track.size > MAX_BYTES) return null
  try {
    const response = await fetch(track.url)
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()
    const audio = await decodeContext().decodeAudioData(bytes)

    // On analyse une fenêtre au cœur du morceau (évite intro et fondu final).
    const total = audio.length
    const windowLength = Math.min(total, Math.floor(WINDOW_SECONDS * audio.sampleRate))
    const start = Math.max(0, Math.floor((total - windowLength) / 2))
    const mono = toMono(audio, start, windowLength)

    const envelope = buildEnvelope(mono, audio.sampleRate)
    const bpm = detectTempo(envelope)

    // Énergie : combinaison loudness + densité d'attaques, bornée à 0..1.
    let onsetSum = 0
    for (let i = 0; i < envelope.onsets.length; i++) onsetSum += envelope.onsets[i]
    const density = onsetSum / Math.max(1, envelope.onsets.length)
    const loudness = Math.min(1, envelope.rms * 5)
    const energy = Math.min(1, Math.max(0, loudness * 0.7 + Math.min(1, density * 90) * 0.3))

    return { bpm, energy: Number(energy.toFixed(3)) }
  } catch {
    return null
  }
}

/**
 * File d'analyse en arrière-plan : un morceau à la fois, en tâche de fond,
 * pour ne jamais bloquer l'interface pendant la lecture.
 */
export class AnalysisQueue {
  private queue: Track[] = []
  private running = false
  private done = new Set<string>()

  constructor(private readonly onResult: (track: Track, result: AnalysisResult) => void) {}

  push(tracks: Track[]): void {
    for (const track of tracks) {
      if (this.done.has(track.id)) continue
      if (track.bpmTag || track.bpmAnalyzed) {
        this.done.add(track.id)
        continue
      }
      if (this.queue.some((item) => item.id === track.id)) continue
      this.queue.push(track)
    }
    void this.run()
  }

  /** Fait passer un morceau en tête de file (celui qu'on écoute). */
  prioritize(track: Track): void {
    if (this.done.has(track.id) || track.bpmTag || track.bpmAnalyzed) return
    this.queue = [track, ...this.queue.filter((item) => item.id !== track.id)]
    void this.run()
  }

  clear(): void {
    this.queue = []
  }

  private async run(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        const track = this.queue.shift() as Track
        if (this.done.has(track.id)) continue
        this.done.add(track.id)
        const result = await analyzeTrack(track)
        if (result) this.onResult(track, result)
        // Respiration : laisse le thread au rendu et à la lecture.
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
    } finally {
      this.running = false
    }
  }
}
