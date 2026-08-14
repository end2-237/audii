import { useMemo, useState } from 'react'
import { useAudii } from '@/state/AudiiProvider'
import { Cover } from './Cover'
import { IconCollapse, IconNote, IconPlus, IconSort, IconSpeaker } from './Icons'

export function Sidebar(): React.JSX.Element {
  const { library, selectedPlaylistId, selectPlaylist, search, current, addFolder } = useAudii()
  const [collapsed, setCollapsed] = useState(false)

  const playlists = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return library.playlists
    return library.playlists.filter((playlist) => playlist.name.toLowerCase().includes(needle))
  }, [library.playlists, search])

  const playingPlaylistId = useMemo(() => {
    if (!current) return null
    return library.playlists.find((playlist) => playlist.kind !== 'smart' && playlist.trackIds.includes(current.id))?.id ?? null
  }, [current, library.playlists])

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-head">
        <button type="button" className="sidebar-title" title="Trier">
          <IconSort size={15} />
          {!collapsed && <span>Recent</span>}
        </button>
        <div className="sidebar-head-actions">
          <button type="button" className="icon-ghost sm" title="Ajouter un dossier" onClick={() => void addFolder()}>
            <IconPlus size={16} />
          </button>
          {!collapsed && (
            <button
              type="button"
              className="icon-ghost sm"
              title="Replier le panneau"
              onClick={() => setCollapsed(true)}
            >
              <IconCollapse size={16} />
            </button>
          )}
        </div>
      </div>

      {collapsed && (
        <button type="button" className="icon-ghost sm expand-side" title="Déplier" onClick={() => setCollapsed(false)}>
          <IconCollapse size={16} className="flip" />
        </button>
      )}

      <div className="sidebar-list">
        {playlists.map((playlist) => {
          const active = playlist.id === selectedPlaylistId
          return (
            <button
              key={playlist.id}
              type="button"
              className={`playlist-item${active ? ' is-active' : ''}`}
              onClick={() => selectPlaylist(playlist.id)}
              title={playlist.path ?? playlist.name}
            >
              <span className="playlist-cover">
                <Cover src={playlist.cover} name={playlist.name} size={40} radius={6} />
                <span className="playlist-badge">
                  <IconNote size={9} />
                  {playlist.trackIds.length}
                </span>
              </span>
              {!collapsed && (
                <span className="playlist-meta">
                  <span className="playlist-name">
                    {playlist.name}
                    {playingPlaylistId === playlist.id && <IconSpeaker size={13} className="playing-icon" />}
                  </span>
                  <span className="playlist-kind">Playlist</span>
                </span>
              )}
            </button>
          )
        })}

        {playlists.length === 0 && !collapsed && (
          <p className="sidebar-empty">
            Aucune playlist.
            <br />
            Ajoutez un dossier de musique avec «&nbsp;+&nbsp;».
          </p>
        )}
      </div>
    </aside>
  )
}
