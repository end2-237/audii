/**
 * Moteur de lecture : <audio> + graphe Web Audio.
 *
 *   <audio> --> MediaElementSource --> masterGain --> destination
 *
 * `masterGain` porte à la fois le volume utilisateur et l'atténuation
 * « Smart Dim » du moteur Noise Sense, ce qui permet des fondus propres.
 */

export interface EngineState {
  playing: boolean
  currentTime: number
  duration: number
  buffering: boolean
  /** Atténuation Noise Sense en cours (0..1, 1 = volume nominal). */
  dim: number
  /** Niveau sonore ambiant mesuré (0..1). */
  ambient: number
  error: string | null
}

type Listener = (state: EngineState) => void

export class AudioEngine {
  readonly element: HTMLAudioElement
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private source: MediaElementAudioSourceNode | null = null

  private micStream: MediaStream | null = null
  private micAnalyser: AnalyserNode | null = null
  private micBuffer: Float32Array<ArrayBuffer> | null = null
  private noiseRaf = 0
  private baseline = 0.02
  private dimUntil = 0

  private listeners = new Set<Listener>()
  private onEnded: (() => void) | null = null

  private volume = 0.8
  private sensitivity = 0.5

  state: EngineState = {
    playing: false,
    currentTime: 0,
    duration: 0,
    buffering: false,
    dim: 1,
    ambient: 0,
    error: null
  }

  constructor() {
    this.element = new Audio()
    this.element.preload = 'auto'
    this.element.crossOrigin = 'anonymous'
    this.element.volume = this.volume

    const sync = (patch: Partial<EngineState>) => this.patch(patch)

    this.element.addEventListener('play', () => sync({ playing: true, error: null }))
    this.element.addEventListener('pause', () => sync({ playing: false }))
    this.element.addEventListener('waiting', () => sync({ buffering: true }))
    this.element.addEventListener('playing', () => sync({ buffering: false, playing: true }))
    this.element.addEventListener('timeupdate', () => sync({ currentTime: this.element.currentTime }))
    this.element.addEventListener('durationchange', () =>
      sync({ duration: Number.isFinite(this.element.duration) ? this.element.duration : 0 })
    )
    this.element.addEventListener('ended', () => {
      sync({ playing: false })
      this.onEnded?.()
    })
    this.element.addEventListener('error', () => {
      const code = this.element.error?.code
      sync({
        playing: false,
        buffering: false,
        error: code === 4 ? 'Format non supporté par le lecteur' : 'Lecture impossible'
      })
    })
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  onTrackEnded(handler: () => void): void {
    this.onEnded = handler
  }

  private patch(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }

  /** Le graphe Web Audio n'est créé qu'au premier geste utilisateur. */
  private ensureGraph(): void {
    if (this.context) return
    try {
      const context = new AudioContext()
      const gain = context.createGain()
      gain.gain.value = this.volume
      const source = context.createMediaElementSource(this.element)
      source.connect(gain)
      gain.connect(context.destination)
      this.context = context
      this.masterGain = gain
      this.source = source
      // Le gain prend le relais du volume natif de l'élément.
      this.element.volume = 1
    } catch {
      // Repli : volume géré directement par l'élément <audio>.
      this.context = null
      this.masterGain = null
      this.source = null
    }
  }

  async load(url: string, autoplay: boolean): Promise<void> {
    this.element.src = url
    this.patch({ currentTime: 0, duration: 0, error: null, buffering: true })
    if (autoplay) await this.play()
  }

  async play(): Promise<void> {
    this.ensureGraph()
    if (this.context?.state === 'suspended') await this.context.resume()
    try {
      await this.element.play()
    } catch {
      this.patch({ playing: false })
    }
  }

  pause(): void {
    this.element.pause()
  }

  async toggle(): Promise<void> {
    if (this.element.paused) await this.play()
    else this.pause()
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return
    this.element.currentTime = Math.max(0, seconds)
    this.patch({ currentTime: this.element.currentTime })
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value))
    this.applyGain()
  }

  private applyGain(): void {
    const target = this.volume * this.state.dim
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(target, this.context.currentTime, 0.05)
    } else {
      this.element.volume = target
    }
  }

  /* ------------------------------------------------------------ Noise Sense */

  setSensitivity(value: number): void {
    this.sensitivity = Math.min(1, Math.max(0, value))
  }

  async enableNoiseSense(): Promise<boolean> {
    if (this.micStream) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // L'annulation d'écho évite que la musique déclenche elle-même le Smart Dim.
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      this.ensureGraph()
      const context = this.context ?? new AudioContext()
      this.context = context
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.4
      source.connect(analyser)
      // Volontairement non connecté à la destination : pas de larsen.
      this.micStream = stream
      this.micAnalyser = analyser
      this.micBuffer = new Float32Array(analyser.fftSize)
      this.baseline = 0.02
      this.loopNoise()
      return true
    } catch {
      this.patch({ error: 'Micro indisponible : Noise Sense désactivé' })
      return false
    }
  }

  disableNoiseSense(): void {
    cancelAnimationFrame(this.noiseRaf)
    this.noiseRaf = 0
    this.micStream?.getTracks().forEach((track) => track.stop())
    this.micStream = null
    this.micAnalyser = null
    this.micBuffer = null
    this.patch({ dim: 1, ambient: 0 })
    this.applyGain()
  }

  private loopNoise = (): void => {
    if (!this.micAnalyser || !this.micBuffer) return
    this.micAnalyser.getFloatTimeDomainData(this.micBuffer)

    let sum = 0
    for (let i = 0; i < this.micBuffer.length; i++) sum += this.micBuffer[i] * this.micBuffer[i]
    const rms = Math.sqrt(sum / this.micBuffer.length)
    const ambient = Math.min(1, rms * 6)

    // Ligne de base = niveau calme de la pièce : descend vite, remonte lentement.
    this.baseline = rms < this.baseline ? this.baseline * 0.92 + rms * 0.08 : this.baseline * 0.999 + rms * 0.001
    const floor = 0.012 + (1 - this.sensitivity) * 0.05
    const trigger = Math.max(this.baseline * (2.6 - this.sensitivity * 1.3), floor)

    const now = performance.now()
    if (rms > trigger) this.dimUntil = now + 1800 // maintien après le bruit

    const shouldDim = now < this.dimUntil
    const targetDim = shouldDim ? 0.2 : 1
    // Attaque rapide, retour progressif (fade-in) comme spécifié.
    const speed = targetDim < this.state.dim ? 0.35 : 0.02
    const dim = this.state.dim + (targetDim - this.state.dim) * speed

    if (Math.abs(dim - this.state.dim) > 0.001 || Math.abs(ambient - this.state.ambient) > 0.01) {
      this.patch({ dim, ambient })
      this.applyGain()
    }

    this.noiseRaf = requestAnimationFrame(this.loopNoise)
  }

  destroy(): void {
    this.disableNoiseSense()
    this.element.pause()
    this.element.src = ''
    this.source?.disconnect()
    this.masterGain?.disconnect()
    void this.context?.close()
    this.listeners.clear()
  }
}
