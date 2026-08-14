import { useMemo } from 'react'
import type { Track } from '@shared/types'
import { useAudii } from '@/state/AudiiProvider'
import { Cover } from './Cover'
import { IconDots } from './Icons'

interface ArtistSummary {
  name: string
  tracks: number
  albums: number
  cover: string | null
  first: Track
}

export function RightPanel(): React.JSX.Element {
  const { library, play, t } = useAudii()

  const artists = useMemo<ArtistSummary[]>(() => {
    const map = new Map<string, { tracks: Track[]; albums: Set<string> }>()
    for (const track of library.tracks) {
      const key = track.albumArtist || track.artist
      const entry = map.get(key)
      if (entry) {
        entry.tracks.push(track)
        entry.albums.add(track.album)
      } else {
        map.set(key, { tracks: [track], albums: new Set([track.album]) })
      }
    }
    return [...map.entries()]
      .map(([name, entry]) => ({
        name: name || t('track.unknownArtist'),
        tracks: entry.tracks.length,
        albums: entry.albums.size,
        cover: entry.tracks.find((track) => track.cover)?.cover ?? null,
        first: entry.tracks[0]
      }))
      .sort((a, b) => b.tracks - a.tracks || a.name.localeCompare(b.name))
      .slice(0, 14)
  }, [library.tracks, t])

  return (
    <aside className="right-panel">
      <div className="panel-head">
        <h2>{t('panel.topArtists')}</h2>
        <button type="button" className="icon-ghost sm" title={t('panel.options')}>
          <IconDots size={16} />
        </button>
      </div>

      <div className="artist-list">
        {artists.map((artist) => (
          <button
            key={artist.name}
            type="button"
            className="artist-row"
            onDoubleClick={() =>
              play(
                artist.first,
                library.tracks.filter((track) => (track.albumArtist || track.artist) === artist.name)
              )
            }
            title={t('artist.listen', { name: artist.name })}
          >
            <Cover src={artist.cover} name={artist.name} size={34} radius={17} />
            <span className="artist-meta">
              <span className="artist-name">{artist.name}</span>
              <span className="artist-sub">
                {t('artist.meta', {
                  tracks: t('artist.tracks', { count: artist.tracks }),
                  albums: t('artist.albums', { count: artist.albums })
                })}
              </span>
            </span>
          </button>
        ))}
        {artists.length === 0 && <p className="panel-empty">{t('panel.empty')}</p>}
      </div>

      <div className="promo">
        <h3>{t('promo.title')}</h3>
        <p>{t('promo.text')}</p>
        <button type="button" className="promo-cta">
          {t('promo.cta')}
        </button>
      </div>
    </aside>
  )
}
