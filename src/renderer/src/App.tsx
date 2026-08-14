import { useMemo } from 'react'
import type { Track } from '@shared/types'
import { useAudii } from '@/state/AudiiProvider'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { RightPanel } from '@/components/RightPanel'
import { PlayerBar } from '@/components/PlayerBar'
import { PlaylistView } from '@/components/PlaylistView'
import { GridView } from '@/components/GridView'
import { EmptyLibrary } from '@/components/EmptyLibrary'
import { VibePanel } from '@/components/VibePanel'
import { ScanToast } from '@/components/ScanToast'

function matches(track: Track, needle: string): boolean {
  return (
    track.title.toLowerCase().includes(needle) ||
    track.artist.toLowerCase().includes(needle) ||
    track.album.toLowerCase().includes(needle)
  )
}

export default function App(): React.JSX.Element {
  const { library, selectedPlaylistId, view, search, loading } = useAudii()

  const trackById = useMemo(() => {
    const map = new Map<string, Track>()
    for (const track of library.tracks) map.set(track.id, track)
    return map
  }, [library.tracks])

  const playlist = useMemo(
    () => library.playlists.find((item) => item.id === selectedPlaylistId) ?? library.playlists[0] ?? null,
    [library.playlists, selectedPlaylistId]
  )

  const needle = search.trim().toLowerCase()

  const playlistTracks = useMemo(() => {
    if (!playlist) return []
    const tracks = playlist.trackIds.map((id) => trackById.get(id)).filter((t): t is Track => Boolean(t))
    return needle ? tracks.filter((track) => matches(track, needle)) : tracks
  }, [playlist, trackById, needle])

  const allTracks = useMemo(
    () => (needle ? library.tracks.filter((track) => matches(track, needle)) : library.tracks),
    [library.tracks, needle]
  )

  const main = (): React.JSX.Element => {
    if (library.tracks.length === 0) return <EmptyLibrary />
    switch (view) {
      case 'albums':
        return <GridView mode="album" tracks={allTracks} />
      case 'artists':
        return <GridView mode="artist" tracks={allTracks} />
      case 'home':
        return <GridView mode="recent" tracks={allTracks} />
      default:
        return playlist ? <PlaylistView playlist={playlist} tracks={playlistTracks} /> : <EmptyLibrary />
    }
  }

  return (
    <div className={`app${loading ? ' is-loading' : ''}`}>
      <TitleBar />
      <div className="body">
        <Sidebar />
        <main className="content">{main()}</main>
        <RightPanel />
      </div>
      <PlayerBar />
      <VibePanel />
      <ScanToast />
    </div>
  )
}
