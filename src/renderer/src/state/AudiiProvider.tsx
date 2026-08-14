import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import { DEFAULT_SETTINGS, type Library, type ScanProgress, type Settings, type Track } from '@shared/types'
import { AudioEngine, type EngineState } from '@/audio/engine'
import { AnalysisQueue } from '@/audio/analyze'
import { pickNextTrack, tapsToBpm } from '@/audio/vibe'

export type View = 'home' | 'playlists' | 'albums' | 'artists'

const EMPTY_LIBRARY: Library = { tracks: [], playlists: [], folders: [], scannedAt: 0 }

interface AudiiContextValue {
  library: Library
  settings: Settings
  loading: boolean
  scan: ScanProgress | null
  view: View
  search: string
  selectedPlaylistId: string | null
  current: Track | null
  queueIds: string[]
  tapBpm: number | null
  vibeOpen: boolean

  setView: (view: View) => void
  setSearch: (value: string) => void
  selectPlaylist: (id: string) => void
  setVibeOpen: (open: boolean) => void

  play: (track: Track, queue: Track[]) => void
  toggle: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void

  update: (patch: Partial<Settings>) => void
  toggleFavorite: (id: string) => void
  tap: () => void
  resetTap: () => void

  addFolder: () => Promise<void>
  removeFolder: (folder: string) => Promise<void>
  rescan: () => Promise<void>
  reveal: (track: Track) => void
}

const AudiiContext = createContext<AudiiContextValue | null>(null)

export function useAudii(): AudiiContextValue {
  const value = useContext(AudiiContext)
  if (!value) throw new Error('useAudii doit être utilisé dans <AudiiProvider>')
  return value
}

const engine = new AudioEngine()

/** Abonnement fin à l'état du moteur : seuls les composants concernés se re-rendent. */
export function useEngine(): EngineState {
  return useSyncExternalStore(
    (onChange) => engine.subscribe(() => onChange()),
    () => engine.state
  )
}

export function useAudioEngine(): AudioEngine {
  return engine
}

export function AudiiProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [view, setView] = useState<View>('playlists')
  const [search, setSearch] = useState('')
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [lastPlayed, setLastPlayed] = useState<Track | null>(null)
  const [queueIds, setQueueIds] = useState<string[]>([])
  const [tapBpm, setTapBpm] = useState<number | null>(null)
  const [vibeOpen, setVibeOpen] = useState(false)

  const taps = useRef<number[]>([])
  const history = useRef<string[]>([])
  const libraryRef = useRef(library)
  const settingsRef = useRef(settings)
  const queueRef = useRef<string[]>([])
  const currentRef = useRef<Track | null>(null)

  const trackById = useMemo(() => {
    const map = new Map<string, Track>()
    for (const track of library.tracks) map.set(track.id, track)
    return map
  }, [library])

  // Toujours relire le morceau courant depuis la bibliothèque : c'est ainsi
  // que le BPM calculé en tâche de fond apparaît dans le lecteur.
  const current = useMemo(
    () => (currentId ? (trackById.get(currentId) ?? lastPlayed) : null),
    [currentId, trackById, lastPlayed]
  )

  libraryRef.current = library
  settingsRef.current = settings
  queueRef.current = queueIds
  currentRef.current = current

  /* ------------------------------------------------------------ chargement */

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [loadedSettings, loadedLibrary] = await Promise.all([
        window.audii.settings.get(),
        window.audii.library.get()
      ])
      if (cancelled) return
      setSettings(loadedSettings)
      setLibrary(loadedLibrary)
      engine.setVolume(loadedSettings.volume)
      engine.setSensitivity(loadedSettings.noiseSensitivity)
      const fallback = loadedLibrary.playlists[0]?.id ?? null
      setSelectedPlaylistId(
        loadedSettings.lastPlaylistId && loadedLibrary.playlists.some((p) => p.id === loadedSettings.lastPlaylistId)
          ? loadedSettings.lastPlaylistId
          : fallback
      )
      setLoading(false)
      window.audii.rendererReady()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const offProgress = window.audii.library.onProgress((progress) => {
      setScan(progress)
      if (progress.phase === 'done') setTimeout(() => setScan(null), 2500)
    })
    const offUpdated = window.audii.library.onUpdated((updated) => {
      setLibrary(updated)
      setSelectedPlaylistId((previous) =>
        previous && updated.playlists.some((p) => p.id === previous) ? previous : updated.playlists[0]?.id ?? null
      )
    })
    return () => {
      offProgress()
      offUpdated()
    }
  }, [])

  /* ------------------------------------------------ analyse BPM en tâche de fond */

  const analysis = useRef<AnalysisQueue | null>(null)
  if (!analysis.current) {
    analysis.current = new AnalysisQueue((track, result) => {
      setLibrary((previous) => ({
        ...previous,
        tracks: previous.tracks.map((item) =>
          item.id === track.id ? { ...item, bpmAnalyzed: result.bpm, energy: result.energy } : item
        )
      }))
      void window.audii.analysis.save({
        id: track.id,
        bpm: result.bpm,
        energy: result.energy,
        mtime: track.addedAt
      })
    })
  }

  // Lock-Vibe a besoin des tempos : on analyse la file d'attente en fond.
  useEffect(() => {
    if (!settings.lockVibe) return
    const queue = queueIds.map((id) => trackById.get(id)).filter((t): t is Track => Boolean(t))
    analysis.current?.push(queue.slice(0, 60))
  }, [settings.lockVibe, queueIds, trackById])

  /* --------------------------------------------------------------- lecture */

  const persist = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }))
    void window.audii.settings.set(patch)
  }, [])

  const play = useCallback((track: Track, queue: Track[]) => {
    setCurrentId(track.id)
    setLastPlayed(track)
    setQueueIds(queue.map((item) => item.id))
    history.current = [...history.current, track.id].slice(-40)
    analysis.current?.prioritize(track)
    void engine.load(track.url, true)
  }, [])

  const advance = useCallback(
    (direction: 1 | -1) => {
      const queue = queueRef.current.map((id) => libraryRef.current.tracks.find((t) => t.id === id)).filter(
        (t): t is Track => Boolean(t)
      )
      if (queue.length === 0) return
      const active = currentRef.current
      const settingsNow = settingsRef.current

      if (direction === -1) {
        // Retour : on revient au début du morceau si on est déjà lancé.
        if (engine.state.currentTime > 3) {
          engine.seek(0)
          return
        }
        const index = active ? queue.findIndex((t) => t.id === active.id) : 0
        const previous = queue[(index - 1 + queue.length) % queue.length]
        if (previous) play(previous, queue)
        return
      }

      if (settingsNow.repeat === 'one' && active) {
        engine.seek(0)
        void engine.play()
        return
      }

      const nextTrack = pickNextTrack(queue, active, {
        lockVibe: settingsNow.lockVibe,
        energy: settingsNow.energy,
        tapBpm,
        shuffle: settingsNow.shuffle,
        history: history.current
      })
      if (!nextTrack) return

      const isLast = active ? queue[queue.length - 1]?.id === active.id : false
      if (isLast && settingsNow.repeat === 'off' && !settingsNow.shuffle && !settingsNow.lockVibe) {
        engine.pause()
        return
      }
      play(nextTrack, queue)
    },
    [play, tapBpm]
  )

  useEffect(() => {
    engine.onTrackEnded(() => advance(1))
  }, [advance])

  /* ----------------------------------------------------------- Noise Sense */

  useEffect(() => {
    if (settings.noiseSense) {
      void engine.enableNoiseSense().then((ok) => {
        if (!ok) persist({ noiseSense: false })
      })
    } else {
      engine.disableNoiseSense()
    }
  }, [settings.noiseSense, persist])

  useEffect(() => {
    engine.setSensitivity(settings.noiseSensitivity)
  }, [settings.noiseSensitivity])

  useEffect(() => {
    engine.setVolume(settings.volume)
  }, [settings.volume])

  /* ------------------------------------------------------------- raccourcis */

  const tap = useCallback(() => {
    const now = performance.now()
    if (taps.current.length > 0 && now - taps.current[taps.current.length - 1] > 2500) taps.current = []
    taps.current = [...taps.current, now].slice(-6)
    const bpm = tapsToBpm(taps.current)
    if (bpm) setTapBpm(bpm)
  }, [])

  const resetTap = useCallback(() => {
    taps.current = []
    setTapBpm(null)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      switch (event.code) {
        case 'Space':
          event.preventDefault()
          void engine.toggle()
          break
        case 'ArrowRight':
          if (event.ctrlKey) advance(1)
          else engine.seek(engine.state.currentTime + 5)
          break
        case 'ArrowLeft':
          if (event.ctrlKey) advance(-1)
          else engine.seek(engine.state.currentTime - 5)
          break
        case 'KeyT':
          tap()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [advance, tap])

  /* ---------------------------------------------------------------- actions */

  const selectPlaylist = useCallback(
    (id: string) => {
      setSelectedPlaylistId(id)
      persist({ lastPlaylistId: id })
    },
    [persist]
  )

  const toggleFavorite = useCallback(
    (id: string) => {
      const favorites = settingsRef.current.favorites.includes(id)
        ? settingsRef.current.favorites.filter((item) => item !== id)
        : [...settingsRef.current.favorites, id]
      persist({ favorites })
    },
    [persist]
  )

  const addFolder = useCallback(async () => {
    const updated = await window.audii.library.addFolder()
    if (updated) {
      setLibrary(updated)
      const settingsNow = await window.audii.settings.get()
      setSettings(settingsNow)
      if (!selectedPlaylistId) setSelectedPlaylistId(updated.playlists[0]?.id ?? null)
    }
  }, [selectedPlaylistId])

  const removeFolder = useCallback(async (folder: string) => {
    const updated = await window.audii.library.removeFolder(folder)
    setLibrary(updated)
    setSettings(await window.audii.settings.get())
  }, [])

  const rescan = useCallback(async () => {
    setLibrary(await window.audii.library.scan())
  }, [])

  const value = useMemo<AudiiContextValue>(
    () => ({
      library,
      settings,
      loading,
      scan,
      view,
      search,
      selectedPlaylistId,
      current,
      queueIds,
      tapBpm,
      vibeOpen,
      setView,
      setSearch,
      selectPlaylist,
      setVibeOpen,
      play,
      toggle: () => void engine.toggle(),
      next: () => advance(1),
      previous: () => advance(-1),
      seek: (seconds: number) => engine.seek(seconds),
      update: persist,
      toggleFavorite,
      tap,
      resetTap,
      addFolder,
      removeFolder,
      rescan,
      reveal: (track: Track) => void window.audii.library.reveal(track.path)
    }),
    [
      library,
      settings,
      loading,
      scan,
      view,
      search,
      selectedPlaylistId,
      current,
      queueIds,
      tapBpm,
      vibeOpen,
      selectPlaylist,
      play,
      advance,
      persist,
      toggleFavorite,
      tap,
      resetTap,
      addFolder,
      removeFolder,
      rescan
    ]
  )

  return <AudiiContext.Provider value={value}>{children}</AudiiContext.Provider>
}
