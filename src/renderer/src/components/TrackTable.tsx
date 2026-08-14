import { useState } from 'react'
import type { Track } from '@shared/types'
import { useAudii, useEngine } from '@/state/AudiiProvider'
import { formatDate, formatTime } from '@/lib/format'
import { trackBpm } from '@/audio/vibe'
import { Cover } from './Cover'
import { IconDots, IconHeart, IconPause, IconPlay } from './Icons'

interface TrackTableProps {
  tracks: Track[]
}

export function TrackTable({ tracks }: TrackTableProps): React.JSX.Element {
  const { current, play, settings, toggleFavorite, reveal, toggle } = useAudii()
  const { playing } = useEngine()
  const [menuFor, setMenuFor] = useState<string | null>(null)

  return (
    <div className="tracks">
      <div className="tracks-head">
        <span className="col-index">#</span>
        <span className="col-title">Title</span>
        <span className="col-album">Album</span>
        <span className="col-date">Added date</span>
        <span className="col-time">Time</span>
        <span className="col-actions" />
      </div>

      <div className="tracks-body">
        {tracks.map((track, index) => {
          const isCurrent = current?.id === track.id
          const isPlaying = isCurrent && playing
          const bpm = trackBpm(track)
          return (
            <div
              key={track.id}
              className={`track-row${isCurrent ? ' is-current' : ''}`}
              onDoubleClick={() => play(track, tracks)}
            >
              <span className="col-index">
                <span className="row-number">{index + 1}</span>
                <button
                  type="button"
                  className="row-play"
                  title={isPlaying ? 'Pause' : 'Lire'}
                  onClick={() => (isCurrent ? toggle() : play(track, tracks))}
                >
                  {isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
                </button>
              </span>

              <span className="col-title">
                <Cover src={track.cover} name={track.album || track.title} size={34} radius={4} />
                <span className="track-text">
                  <span className="track-name">{track.title}</span>
                  <span className="track-sub">
                    <span className="track-artist">{track.artist}</span>
                    {/* Le tempo n'apparaît que lorsque le moteur rythmique est armé. */}
                    {settings.lockVibe && bpm && <em className="bpm-chip">{bpm} BPM</em>}
                  </span>
                </span>
              </span>

              <span className="col-album" title={track.album}>
                {track.album}
              </span>
              <span className="col-date">{formatDate(track.addedAt)}</span>
              <span className="col-time">{formatTime(track.duration)}</span>

              <span className="col-actions">
                <button
                  type="button"
                  className={`icon-ghost xs${settings.favorites.includes(track.id) ? ' is-liked' : ''}`}
                  title="Favori"
                  onClick={() => toggleFavorite(track.id)}
                >
                  <IconHeart size={15} filled={settings.favorites.includes(track.id)} />
                </button>
                <button
                  type="button"
                  className="icon-ghost xs"
                  title="Plus d'options"
                  onClick={() => setMenuFor(menuFor === track.id ? null : track.id)}
                >
                  <IconDots size={16} />
                </button>
                {menuFor === track.id && (
                  <span className="row-menu" onMouseLeave={() => setMenuFor(null)}>
                    <button type="button" onClick={() => { play(track, tracks); setMenuFor(null) }}>
                      Lire maintenant
                    </button>
                    <button type="button" onClick={() => { reveal(track); setMenuFor(null) }}>
                      Afficher dans l'explorateur
                    </button>
                    <span className="row-menu-path">{track.path}</span>
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
