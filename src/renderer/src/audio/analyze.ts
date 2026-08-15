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
 *
 * La largeur a été mesurée, pas choisie : sur les onze morceaux de référence,
 * tout réglage entre 0,45 et 0,55 donne le même résultat parfait, et 0,40
 * commence à tirer les morceaux lents vers 120. On retient le milieu de ce
 * plateau plutôt que son bord, pour rester robuste sur des morceaux inconnus.
 */
const TEMPO_CENTER = 120
const TEMPO_SPREAD = 0.5

const octaveWeight = (bpm: number): number =>
  Math.exp(-0.5 * (Math.log(bpm / TEMPO_CENTER) / TEMPO_SPREAD) ** 2)

/**
 * Sonie perçue, ramenée entre 0 et 1.
 *
 * Une mise à l'échelle linéaire du RMS ne convient pas : mesurée sur des
 * morceaux réels, l'amplitude va de 0,13 à 0,36 — soit de −17,7 à −9,0 dBFS.
 * Un facteur linéaire saturait au-dessus de 0,2, si bien que huit morceaux
 * sur onze ressortaient à 1,000 : l'indicateur décrivait le mastering, pas la
 * musique. L'oreille entend en décibels, on mesure donc en décibels, sur une
 * plage de −24 à −6 dBFS qui encadre largement ce qui a été observé.
 */
const LOUDNESS_FLOOR_DB = -24
const LOUDNESS_RANGE_DB = 18

const loudnessOf = (rms: number): number => {
  if (rms <= 0) return 0
  const db = 20 * Math.log10(rms)
  return Math.min(1, Math.max(0, (db - LOUDNESS_FLOOR_DB) / LOUDNESS_RANGE_DB))
}

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

export interface Envelope {
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

/** Un tempo candidat et le détail de sa note, pour pouvoir expliquer un choix. */
export interface TempoCandidate {
  bpm: number
  /** Autocorrélation brute à ce décalage. */
  brut: number
  /** Pondération d'octave appliquée. */
  poids: number
  /** Note finale ayant servi au classement. */
  note: number
}

/**
 * Classe les tempi candidats, du plus probable au moins.
 *
 * Exporté pour que le banc d'essai puisse montrer *pourquoi* un tempo a été
 * retenu : une erreur d'octave ne se corrige pas à l'aveugle, il faut voir si
 * le bon tempo était deuxième d'un cheveu ou absent du classement.
 */
export function rankTempi(envelope: Envelope): TempoCandidate[] {
  const { onsets, framesPerSecond } = envelope
  const minLag = Math.floor((60 / MAX_BPM) * framesPerSecond)
  const maxLag = Math.ceil((60 / MIN_BPM) * framesPerSecond)
  if (onsets.length < maxLag * 3) return []

  const scores = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    const limit = onsets.length - lag
    for (let i = 0; i < limit; i++) sum += onsets[i] * onsets[i + lag]
    // Normalisation par le nombre de termes : sinon les petits lags gagnent toujours.
    scores[lag] = sum / limit
  }

  /**
   * Un renfort par les multiples du décalage a été essayé, puis retiré.
   *
   * L'idée — récompenser un candidat dont les multiples résonnent aussi, la
   * pulsation se retrouvant à la mesure — semblait solide, mais elle ne
   * départage rien : un candidat au double du vrai tempo est renforcé par le
   * vrai tempo lui-même, et réciproquement. Mesuré sur les morceaux de
   * référence, le renfort faisait tomber le score de 9 bonnes réponses à 7,
   * en se trompant tantôt vers le double, tantôt vers la moitié.
   * L'autocorrélation brute pondérée par la vraisemblance du tempo fait
   * mieux, et plus vite.
   */
  const candidats: TempoCandidate[] = []
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * framesPerSecond) / lag
    const poids = octaveWeight(bpm)
    candidats.push({
      bpm: Math.round(bpm * 10) / 10,
      brut: scores[lag],
      poids,
      note: scores[lag] * poids
    })
  }
  return candidats.sort((a, b) => b.note - a.note)
}

function detectTempo(envelope: Envelope): number | null {
  const meilleur = rankTempi(envelope)[0]
  if (!meilleur || meilleur.note <= 0) return null

  let bpm = meilleur.bpm
  while (bpm < MIN_BPM && bpm * 2 <= MAX_BPM) bpm *= 2
  while (bpm > MAX_BPM && bpm / 2 >= MIN_BPM) bpm /= 2
  return Math.round(bpm)
}

/** Construit l'enveloppe d'un tampon décodé (fenêtre centrale, comme l'analyse). */
export function envelopeOf(audio: AudioBuffer): Envelope {
  const total = audio.length
  const windowLength = Math.min(total, Math.floor(WINDOW_SECONDS * audio.sampleRate))
  const start = Math.max(0, Math.floor((total - windowLength) / 2))
  return buildEnvelope(toMono(audio, start, windowLength), audio.sampleRate)
}

/**
 * Analyse un tampon audio déjà décodé.
 *
 * Séparé de `analyzeTrack` pour une raison précise : c'est ici qu'est toute
 * l'intelligence, et c'est donc ici qu'il faut pouvoir mesurer la justesse.
 * Un banc d'essai qui réimplémenterait l'estimateur validerait sa copie, pas
 * le produit ; en passant par cette fonction, il éprouve le code qui tourne
 * réellement chez l'utilisateur.
 */
export function analyzeBuffer(audio: AudioBuffer): AnalysisResult {
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
  const energy = Math.min(1, Math.max(0, loudnessOf(envelope.rms) * 0.55 + Math.min(1, density * 90) * 0.45))

  return { bpm, energy: Number(energy.toFixed(3)) }
}

/** Analyse un morceau ; renvoie `null` si le fichier n'est pas exploitable. */
export async function analyzeTrack(track: Track): Promise<AnalysisResult | null> {
  if (track.size > MAX_BYTES) return null
  try {
    const response = await fetch(track.url)
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()
    return analyzeBuffer(await decodeContext().decodeAudioData(bytes))
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
