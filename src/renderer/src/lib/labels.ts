import type { Playlist, Track } from '@shared/types'
import type { MessageKey, Params } from '@shared/i18n'

type Translate = (key: MessageKey, params?: Params) => string

/** Les tags vides deviennent un libellé traduit, jamais une chaîne figée. */
export const artistName = (track: Track, t: Translate): string =>
  track.artist || t('track.unknownArtist')

/** Les playlists générées portent une clé comme nom ; les autres, leur vrai nom. */
export function playlistName(playlist: Playlist, t: Translate): string {
  if (playlist.id === 'all') return t('playlist.all')
  if (playlist.id === 'favorites') return t('favorites.title')
  return playlist.name
}
