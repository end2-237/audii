import { useMemo } from 'react'
import type { Track } from '@shared/types'
import { useAudii } from '@/state/AudiiProvider'
import { formatDate, plural } from '@/lib/format'
import { Cover } from './Cover'
import { IconPlay } from './Icons'

interface Group {
  key: string
  title: string
  subtitle: string
  cover: string | null
  tracks: Track[]
}

function groupBy(tracks: Track[], mode: 'album' | 'artist'): Group[] {
  const map = new Map<string, Track[]>()
  for (const track of tracks) {
    const key = mode === 'album' ? `${track.albumArtist}::${track.album}` : track.albumArtist || track.artist
    const bucket = map.get(key)
    if (bucket) bucket.push(track)
    else map.set(key, [track])
  }
  return [...map.entries()]
    .map(([key, items]) => ({
      key,
      title: mode === 'album' ? items[0].album : items[0].albumArtist || items[0].artist,
      subtitle:
        mode === 'album'
          ? items[0].albumArtist || items[0].artist
          : plural(new Set(items.map((t) => t.album)).size, 'album', 'albums'),
      cover: items.find((track) => track.cover)?.cover ?? null,
      tracks: items
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

interface GridViewProps {
  mode: 'album' | 'artist' | 'recent'
  tracks: Track[]
}

export function GridView({ mode, tracks }: GridViewProps): React.JSX.Element {
  const { play } = useAudii()

  const groups = useMemo<Group[]>(() => {
    if (mode === 'recent') {
      return [...tracks]
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, 36)
        .map((track) => ({
          key: track.id,
          title: track.title,
          subtitle: `${track.artist} • ${formatDate(track.addedAt)}`,
          cover: track.cover,
          tracks: [track]
        }))
    }
    return groupBy(tracks, mode)
  }, [mode, tracks])

  const title = mode === 'album' ? 'Albums' : mode === 'artist' ? 'Artists' : 'Ajoutés récemment'

  return (
    <section className="grid-view">
      <header className="grid-head">
        <h1>{title}</h1>
        <span>{plural(groups.length, 'élément', 'éléments')}</span>
      </header>
      <div className={`grid${mode === 'artist' ? ' is-round' : ''}`}>
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            className="grid-card"
            onClick={() => play(group.tracks[0], mode === 'recent' ? tracks : group.tracks)}
          >
            <span className="grid-cover">
              <Cover
                src={group.cover}
                name={group.title}
                size={150}
                radius={mode === 'artist' ? 75 : 8}
                className="grid-image"
              />
              <span className="grid-play">
                <IconPlay size={18} />
              </span>
            </span>
            <span className="grid-title">{group.title}</span>
            <span className="grid-sub">{group.subtitle}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
