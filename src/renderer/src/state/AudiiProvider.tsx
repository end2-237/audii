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
import { pickNextTrack, rankFollowUps, tapsToBpm, type FollowUp } from '@/audio/vibe'
import { buildTempoPlaylists, countUnanalyzed, type TempoPlaylist } from '@/audio/tempo'
import { trackBpm } from '@/audio/vibe'
import type { Playlist } from '@shared/types'
import { translate, type MessageKey, type Params } from '@shared/i18n'

export type View = 'home' | 'playlists' | 'albums' | 'artists' | 'tempo' | 'now'

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
  queue: Track[]
  queueIds: string[]
  tapBpm: number | null
  vibeOpen: boolean
  /** Playlists tempo générées à la volée depuis les BPM connus. */
  tempoPlaylists: TempoPlaylist[]
  /** Morceaux qui peuvent suivre celui en cours, du plus cohérent au moins. */
  followUps: FollowUp[]
  /** Nombre de titres dont le tempo reste à estimer. */
  pendingAnalysis: number
  /** Playlist des titres aimés (null si aucun). */
  favorites: Playlist | null
  platform: string
  /** Traduction : `t('nav.home')`, `t('tempo.tracks', { count })`. */
  t: (key: MessageKey, params?: Params) => string

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
  /** Lance l'analyse de tempo sur toute la bibliothèque. */
  analyzeAll: () => void

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
  const [platform, setPlatform] = useState('win32')

  const taps = useRef<number[]>([])
  const history = useRef<string[]>([])
  const libraryRef = useRef(library)
  const settingsRef = useRef(settings)
  const queueRef = useRef<string[]>([])
  const currentRef = useRef<Track | null>(null)
  const selectedRef = useRef<string | null>(null)

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

  const queue = useMemo(
    () => queueIds.map((id) => trackById.get(id)).filter((track): track is Track => Boolean(track)),
    [queueIds, trackById]
  )

  const tempoPlaylists = useMemo(
    () => buildTempoPlaylists(library.tracks, settings.tempoSort),
    [library.tracks, settings.tempoSort]
  )

  const pendingAnalysis = useMemo(() => countUnanalyzed(library.tracks), [library.tracks])

  /** Playlist « Favoris », reconstruite depuis les titres aimés. */
  const favorites = useMemo<Playlist | null>(() => {
    const liked = settings.favorites
      .map((id) => trackById.get(id))
      .filter((track): track is Track => Boolean(track))
    if (liked.length === 0) return null
    return {
      id: 'favorites',
      name: 'favorites',
      kind: 'smart',
      trackIds: liked.map((track) => track.id),
      cover: liked.find((track) => track.cover)?.cover ?? null,
      duration: liked.reduce((total, track) => total + track.duration, 0)
    }
  }, [settings.favorites, trackById])

  /**
   * Suite possible : on classe d'abord dans la file en cours, et on complète
   * avec le reste de la bibliothèque si la file est trop courte.
   */
  const followUps = useMemo(() => {
    if (!current) return []
    const pool = queue.length > 1 ? queue : library.tracks
    return rankFollowUps(pool, current, {
      energy: settings.energy,
      tapBpm,
      history: history.current,
      styleLock: settings.styleLock
    }).slice(0, 8)
  }, [current, queue, library.tracks, settings.energy, settings.styleLock, tapBpm])

  const t = useCallback(
    (key: MessageKey, params?: Params) => translate(settings.language, key, params),
    [settings.language]
  )

  libraryRef.current = library
  settingsRef.current = settings
  queueRef.current = queueIds
  currentRef.current = current
  selectedRef.current = selectedPlaylistId

  /* ------------------------------------------------------------ chargement */

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [loadedSettings, loadedLibrary, info] = await Promise.all([
        window.audii.settings.get(),
        window.audii.library.get(),
        window.audii.info()
      ])
      if (cancelled) return
      setSettings(loadedSettings)
      setLibrary(loadedLibrary)
      setPlatform(info.platform)
      engine.setVolume(loadedSettings.volume)
      engine.setSensitivity(loadedSettings.noiseSensitivity)
      const fallback = loadedLibrary.playlists[0]?.id ?? null
      setSelectedPlaylistId(
        loadedSettings.lastPlaylistId && loadedLibrary.playlists.some((p) => p.id === loadedSettings.lastPlaylistId)
          ? loadedSettings.lastPlaylistId
          : fallback
      )

      // Reprise : on remet le morceau et sa position, en pause. L'utilisateur
      // retrouve exactement où il en était sans que le son démarre tout seul.
      const resume = loadedSettings.resume
      const track = resume ? loadedLibrary.tracks.find((item) => item.id === resume.trackId) : undefined
      if (resume && track) {
        setCurrentId(track.id)
        setLastPlayed(track)
        setQueueIds(resume.queueIds.length > 0 ? resume.queueIds : [track.id])
        if (resume.playlistId && loadedLibrary.playlists.some((p) => p.id === resume.playlistId)) {
          setSelectedPlaylistId(resume.playlistId)
        }
        void engine.load(track.url, false, resume.position)
      }

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

  // Lock-Vibe et les playlists tempo ont besoin des BPM : on analyse en fond.
  useEffect(() => {
    if (!settings.lockVibe) return
    const pending = queueIds.map((id) => trackById.get(id)).filter((t): t is Track => Boolean(t))
    analysis.current?.push(pending.slice(0, 60))
  }, [settings.lockVibe, queueIds, trackById])

  const analyzeAll = useCallback(() => {
    analysis.current?.push(libraryRef.current.tracks)
  }, [])

  /* ---------------------------------------------------- thème & reprise */

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = (): void => {
      const light = settings.theme === 'light' || (settings.theme === 'system' && media.matches)
      root.dataset.theme = light ? 'light' : 'dark'
    }
    apply()
    if (settings.theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

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

  /**
   * Sauvegarde périodique de l'écoute en cours. On écrit directement sur
   * disque sans passer par l'état React : ce champ n'est relu qu'au démarrage,
   * inutile de re-rendre l'interface toutes les cinq secondes.
   */
  const saveResume = useCallback(() => {
    const track = currentRef.current
    if (!track) return
    void window.audii.settings.set({
      resume: {
        trackId: track.id,
        position: engine.state.currentTime,
        queueIds: queueRef.current,
        playlistId: selectedRef.current,
        savedAt: Date.now()
      }
    })
  }, [])

  /**
   * Le mini-lecteur vit dans une autre fenêtre : on lui pousse l'état de
   * lecture, et on exécute les commandes qu'il renvoie.
   */
  useEffect(() => {
    const publish = (): void => {
      const track = currentRef.current
      window.audii.mini.publish({
        title: track?.title ?? 'Audii',
        artist: track?.artist ?? '',
        cover: track?.cover ?? null,
        playing: engine.state.playing,
        position: engine.state.currentTime,
        duration: engine.state.duration,
        theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
        bpm: track ? trackBpm(track) : null
      })
    }
    const off = engine.subscribe(publish)
    const timer = setInterval(publish, 1000)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(saveResume, 5000)
    window.addEventListener('beforeunload', saveResume)
    return () => {
      clearInterval(timer)
      window.removeEventListener('beforeunload', saveResume)
      saveResume()
    }
  }, [saveResume])

  const advance = useCallback(
    (direction: 1 | -1) => {
      // Passe par un index : une file de plusieurs milliers de titres ne doit
      // pas coûter une recherche linéaire par élément.
      const byId = new Map(libraryRef.current.tracks.map((track) => [track.id, track]))
      const queue = queueRef.current
        .map((id) => byId.get(id))
        .filter((track): track is Track => Boolean(track))
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
        history: history.current,
        styleLock: settingsNow.styleLock
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

  // Commandes venues du mini-lecteur flottant.
  useEffect(
    () =>
      window.audii.mini.onCommand((command) => {
        if (command === 'toggle') void engine.toggle()
        else if (command === 'next') advance(1)
        else advance(-1)
      }),
    [advance]
  )

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
      queue,
      queueIds,
      tapBpm,
      vibeOpen,
      tempoPlaylists,
      followUps,
      pendingAnalysis,
      favorites,
      platform,
      t,
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
      analyzeAll,
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
      queue,
      queueIds,
      tapBpm,
      vibeOpen,
      tempoPlaylists,
      followUps,
      pendingAnalysis,
      favorites,
      platform,
      t,
      selectPlaylist,
      play,
      advance,
      persist,
      toggleFavorite,
      tap,
      resetTap,
      analyzeAll,
      addFolder,
      removeFolder,
      rescan
    ]
  )

  return <AudiiContext.Provider value={value}>{children}</AudiiContext.Provider>
}
