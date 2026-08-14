import { useMemo, useState } from 'react'
import { useAudii } from '@/state/AudiiProvider'
import { playlistName } from '@/lib/labels'
import { Cover } from './Cover'
import { IconCollapse, IconHeart, IconNote, IconPlus, IconSort, IconSpeaker, IconWave } from './Icons'

interface PlaylistRowProps {
  id: string
  name: string
  cover: string | null
  count: number
  /** Ligne secondaire : « Playlist » ou la description de la tranche tempo. */
  kind: string
  title: string
  active: boolean
  playing: boolean
  collapsed: boolean
  onSelect: (id: string) => void
}

function PlaylistRow({
  id,
  name,
  cover,
  count,
  kind,
  title,
  active,
  playing,
  collapsed,
  onSelect
}: PlaylistRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`playlist-item${active ? ' is-active' : ''}`}
      onClick={() => onSelect(id)}
      title={title}
    >
      <span className="playlist-cover">
        <Cover src={cover} name={name} size={40} radius={6} />
        <span className="playlist-badge">
          <IconNote size={9} />
          {count}
        </span>
      </span>
      {!collapsed && (
        <span className="playlist-meta">
          <span className="playlist-name">
            {name}
            {playing && <IconSpeaker size={13} className="playing-icon" />}
          </span>
          <span className="playlist-kind">{kind}</span>
        </span>
      )}
    </button>
  )
}

export function Sidebar(): React.JSX.Element {
  const { library, selectedPlaylistId, selectPlaylist, search, current, addFolder, tempoPlaylists, favorites, t } =
    useAudii()
  const [collapsed, setCollapsed] = useState(false)

  const needle = search.trim().toLowerCase()
  const filter = <T extends { name: string }>(items: T[]): T[] =>
    needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items

  const playlists = useMemo(() => filter(library.playlists), [library.playlists, needle])
  const tempo = useMemo(() => filter(tempoPlaylists), [tempoPlaylists, needle])

  // Un morceau appartient à un seul dossier, mais aussi à une tranche tempo :
  // les deux lignes portent l'icône « en cours de lecture ».
  const playingIds = useMemo(() => {
    if (!current) return new Set<string>()
    const folder = library.playlists.find(
      (playlist) => playlist.kind !== 'smart' && playlist.trackIds.includes(current.id)
    )
    const band = tempoPlaylists.find((playlist) => playlist.trackIds.includes(current.id))
    const liked = favorites?.trackIds.includes(current.id) ? 'favorites' : undefined
    return new Set([folder?.id, band?.id, liked].filter((id): id is string => Boolean(id)))
  }, [current, library.playlists, tempoPlaylists, favorites])

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-head">
        <button type="button" className="sidebar-title" title={t('sidebar.sort')}>
          <IconSort size={15} />
          {!collapsed && <span>{t('sidebar.recent')}</span>}
        </button>
        <div className="sidebar-head-actions">
          <button type="button" className="icon-ghost sm" title={t('sidebar.addFolder')} onClick={() => void addFolder()}>
            <IconPlus size={16} />
          </button>
          {!collapsed && (
            <button
              type="button"
              className="icon-ghost sm"
              title={t('sidebar.collapse')}
              onClick={() => setCollapsed(true)}
            >
              <IconCollapse size={16} />
            </button>
          )}
        </div>
      </div>

      {collapsed && (
        <button
          type="button"
          className="icon-ghost sm expand-side"
          title={t('sidebar.expand')}
          onClick={() => setCollapsed(false)}
        >
          <IconCollapse size={16} className="flip" />
        </button>
      )}

      <div className="sidebar-list">
        {favorites && (
          <button
            type="button"
            className={`playlist-item is-favorites${selectedPlaylistId === 'favorites' ? ' is-active' : ''}`}
            onClick={() => selectPlaylist('favorites')}
            title={t('favorites.title')}
          >
            <span className="playlist-cover">
              <span className="favorites-cover">
                <IconHeart size={20} filled />
              </span>
              <span className="playlist-badge">
                <IconNote size={9} />
                {favorites.trackIds.length}
              </span>
            </span>
            {!collapsed && (
              <span className="playlist-meta">
                <span className="playlist-name">
                  {t('favorites.title')}
                  {playingIds.has('favorites') && <IconSpeaker size={13} className="playing-icon" />}
                </span>
                <span className="playlist-kind">{t('favorites.subtitle')}</span>
              </span>
            )}
          </button>
        )}

        {playlists.map((playlist) => (
          <PlaylistRow
            key={playlist.id}
            id={playlist.id}
            name={playlistName(playlist, t)}
            cover={playlist.cover}
            count={playlist.trackIds.length}
            kind={t('sidebar.playlist')}
            title={playlist.path ?? playlist.name}
            active={playlist.id === selectedPlaylistId}
            playing={playingIds.has(playlist.id)}
            collapsed={collapsed}
            onSelect={selectPlaylist}
          />
        ))}

        {tempo.length > 0 && (
          <>
            <div className="sidebar-section">
              {collapsed ? <IconWave size={14} /> : <span>{t('sidebar.tempoSection')}</span>}
            </div>
            {tempo.map((playlist) => (
              <PlaylistRow
                key={playlist.id}
                id={playlist.id}
                name={playlist.name}
                cover={playlist.cover}
                count={playlist.trackIds.length}
                kind={`${playlist.zone} · ~${playlist.averageBpm} BPM`}
                title={t('sidebar.autoGenerated', { name: playlist.name })}
                active={playlist.id === selectedPlaylistId}
                playing={playingIds.has(playlist.id)}
                collapsed={collapsed}
                onSelect={selectPlaylist}
              />
            ))}
          </>
        )}

        {playlists.length === 0 && tempo.length === 0 && !collapsed && (
          <p className="sidebar-empty">{t('sidebar.empty')}</p>
        )}
      </div>
    </aside>
  )
}
