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
  const { library, play } = useAudii()

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
        name,
        tracks: entry.tracks.length,
        albums: entry.albums.size,
        cover: entry.tracks.find((track) => track.cover)?.cover ?? null,
        first: entry.tracks[0]
      }))
      .sort((a, b) => b.tracks - a.tracks || a.name.localeCompare(b.name))
      .slice(0, 14)
  }, [library.tracks])

  return (
    <aside className="right-panel">
      <div className="panel-head">
        <h2>Top Artists</h2>
        <button type="button" className="icon-ghost sm" title="Options">
          <IconDots size={16} />
        </button>
      </div>

      <div className="artist-list">
        {artists.map((artist) => (
          <button
            key={artist.name}
            type="button"
            className="artist-row"
            onDoubleClick={() => play(artist.first, library.tracks.filter((t) => (t.albumArtist || t.artist) === artist.name))}
            title={`Double-clic pour écouter ${artist.name}`}
          >
            <Cover src={artist.cover} name={artist.name} size={34} radius={17} />
            <span className="artist-meta">
              <span className="artist-name">{artist.name}</span>
              <span className="artist-sub">
                {artist.tracks} titre{artist.tracks > 1 ? 's' : ''} • {artist.albums} album
                {artist.albums > 1 ? 's' : ''}
              </span>
            </span>
          </button>
        ))}
        {artists.length === 0 && <p className="panel-empty">Votre bibliothèque est vide.</p>}
      </div>

      <div className="promo">
        <h3>Uninterrupted Music Awaits</h3>
        <p>Enjoy ad-free music with our premium plan.</p>
        <button type="button" className="promo-cta">
          Upgrade now
        </button>
      </div>
    </aside>
  )
}
