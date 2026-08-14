import { useMemo } from 'react'
import type { Playlist, Track } from '@shared/types'
import { useAudii, useEngine } from '@/state/AudiiProvider'
import { formatDuration, plural } from '@/lib/format'
import { IconDots, IconPause, IconPin, IconPlay } from './Icons'
import { TrackTable } from './TrackTable'

interface PlaylistViewProps {
  playlist: Playlist
  tracks: Track[]
}

/** Dégradé de secours, stable pour un nom de playlist donné. */
function heroGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `linear-gradient(115deg, hsl(${hue} 62% 34%) 0%, hsl(${(hue + 48) % 360} 58% 22%) 55%, #14111a 100%)`
}

export function PlaylistView({ playlist, tracks }: PlaylistViewProps): React.JSX.Element {
  const { play, current, toggle } = useAudii()
  const { playing } = useEngine()

  const isCurrentPlaylist = useMemo(
    () => Boolean(current && tracks.some((track) => track.id === current.id)),
    [current, tracks]
  )
  const heroPlaying = isCurrentPlaylist && playing
  const duration = useMemo(() => tracks.reduce((sum, track) => sum + track.duration, 0), [tracks])

  const onHeroPlay = (): void => {
    if (isCurrentPlaylist) toggle()
    else if (tracks.length > 0) play(tracks[0], tracks)
  }

  return (
    <section className="playlist-view">
      <div className="hero">
        <div
          className={`hero-bg${playlist.cover ? '' : ' is-generated'}`}
          style={
            playlist.cover
              ? { backgroundImage: `url("${playlist.cover}")` }
              : // Sans pochette, on peint un dégradé stable dérivé du nom.
                { filter: 'none', background: heroGradient(playlist.name) }
          }
          aria-hidden="true"
        />
        <div className="hero-veil" aria-hidden="true" />
        <div className="hero-content">
          <h1 className="hero-title">{playlist.name}</h1>
          <p className="hero-sub">
            Playlist • {plural(tracks.length, 'song', 'songs')} • {formatDuration(duration)}
          </p>
        </div>
        <button
          type="button"
          className="hero-play"
          onClick={onHeroPlay}
          title={heroPlaying ? 'Pause' : 'Lire la playlist'}
          disabled={tracks.length === 0}
        >
          {heroPlaying ? <IconPause size={24} /> : <IconPlay size={24} />}
        </button>
      </div>

      <div className="playlist-toolbar">
        <button type="button" className="icon-ghost" title="Options de la playlist">
          <IconDots size={18} />
        </button>
        <button type="button" className="icon-ghost" title="Épingler">
          <IconPin size={16} />
        </button>
      </div>

      <TrackTable tracks={tracks} />
    </section>
  )
}
