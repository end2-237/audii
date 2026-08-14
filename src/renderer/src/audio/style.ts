import type { Track } from '@shared/types'

/**
 * Affinité de style.
 *
 * Le tempo seul ne suffit pas : 128 BPM peut être de l'amapiano comme du
 * metal. On range donc chaque morceau dans une famille musicale déduite de
 * son tag de genre (texte libre, souvent approximatif), et on mesure la
 * proximité entre deux morceaux avant de raisonner en BPM.
 *
 * Quand le genre est absent — cas fréquent des fichiers récupérés sur
 * WhatsApp ou téléchargés — on se rabat sur l'artiste, l'album et le dossier,
 * qui reflètent en pratique l'organisation par style de l'utilisateur.
 */

export type StyleFamily =
  | 'afro'
  | 'urban'
  | 'rnb'
  | 'electronic'
  | 'pop'
  | 'rock'
  | 'jazz'
  | 'classical'
  | 'reggae'
  | 'latin'
  | 'gospel'
  | 'folk'

/** Mots-clés cherchés dans le tag de genre, du plus spécifique au plus large. */
const KEYWORDS: [StyleFamily, string[]][] = [
  [
    'afro',
    ['afrobeat', 'afrobeats', 'afro', 'coupe decale', 'coupé-décalé', 'coupe-decale', 'ndombolo', 'makossa',
     'bikutsi', 'amapiano', 'soukous', 'zouk', 'kizomba', 'mbalax', 'highlife']
  ],
  ['urban', ['hip hop', 'hip-hop', 'hiphop', 'rap', 'trap', 'drill', 'grime', 'boom bap']],
  ['gospel', ['gospel', 'worship', 'louange', 'christian', 'praise']],
  ['rnb', ['r&b', 'rnb', 'r and b', 'soul', 'funk', 'motown', 'neo-soul']],
  [
    'electronic',
    ['electro', 'house', 'techno', 'trance', 'edm', 'dance', 'dubstep', 'drum and bass', 'drum & bass', 'dnb',
     'garage', 'ambient', 'synth', 'club']
  ],
  ['reggae', ['reggae', 'dancehall', 'ragga', 'ska', 'roots', 'dub']],
  ['latin', ['latin', 'salsa', 'bachata', 'reggaeton', 'samba', 'cumbia', 'merengue', 'kompa', 'kizomba']],
  ['rock', ['rock', 'metal', 'punk', 'grunge', 'indie', 'alternative', 'hardcore']],
  ['jazz', ['jazz', 'blues', 'swing', 'bossa', 'bebop']],
  ['classical', ['classic', 'classique', 'orchestr', 'opera', 'opéra', 'baroque', 'symphon']],
  ['folk', ['folk', 'country', 'acoustic', 'world', 'traditional', 'traditionnel', 'bluegrass']],
  ['pop', ['pop', 'variété', 'variete', 'chanson', 'schlager']]
]

/** Familles voisines : on peut enchaîner de l'une à l'autre sans rupture. */
const NEIGHBOURS: [StyleFamily, StyleFamily][] = [
  ['urban', 'rnb'],
  ['urban', 'afro'],
  ['urban', 'reggae'],
  ['rnb', 'gospel'],
  ['rnb', 'pop'],
  ['rnb', 'jazz'],
  ['afro', 'electronic'],
  ['afro', 'latin'],
  ['afro', 'reggae'],
  ['electronic', 'pop'],
  ['rock', 'pop'],
  ['rock', 'folk'],
  ['jazz', 'classical'],
  ['latin', 'reggae'],
  ['folk', 'pop'],
  ['gospel', 'classical']
]

const NEIGHBOUR_SET = new Set(NEIGHBOURS.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]))

/** Famille musicale d'un morceau, ou `null` si le genre n'est pas exploitable. */
export function styleOf(track: Track): StyleFamily | null {
  const raw = track.genre.trim().toLowerCase()
  if (!raw) return null
  for (const [family, keywords] of KEYWORDS) {
    if (keywords.some((keyword) => raw.includes(keyword))) return family
  }
  return null
}

/** Libellé court affiché dans l'interface. */
export const STYLE_LABELS: Record<StyleFamily, string> = {
  afro: 'Afro',
  urban: 'Hip-Hop',
  rnb: 'R&B / Soul',
  electronic: 'Électro',
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  classical: 'Classique',
  reggae: 'Reggae',
  latin: 'Latino',
  gospel: 'Gospel',
  folk: 'Folk'
}

const dirname = (filePath: string): string => filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')))

/**
 * Proximité de style entre deux morceaux, de 0 (rien à voir) à 1 (même
 * univers). Sert de garde-fou au moteur rythmique.
 */
export function styleAffinity(a: Track, b: Track): number {
  // Signaux forts : même artiste ou même album, le style est acquis.
  if (a.albumArtist && a.albumArtist === b.albumArtist) return 1
  if (a.artist === b.artist) return 1
  if (a.album && a.album === b.album) return 0.95

  const left = styleOf(a)
  const right = styleOf(b)

  let score: number
  if (left && right) {
    if (left === right) score = 0.9
    else if (NEIGHBOUR_SET.has(`${left}|${right}`)) score = 0.6
    else score = 0.1
  } else {
    // Genre inconnu : on s'appuie sur le rangement des fichiers.
    score = dirname(a.path) === dirname(b.path) ? 0.75 : 0.4
  }

  // L'énergie mesurée départage deux morceaux du même genre déclaré.
  if (a.energy !== null && b.energy !== null) {
    score += (1 - Math.abs(a.energy - b.energy)) * 0.1 - 0.05
  }
  // Même époque = mêmes codes de production.
  if (a.year && b.year && Math.abs(a.year - b.year) <= 3) score += 0.05

  return Math.min(1, Math.max(0, score))
}

/** Seuil au-delà duquel deux morceaux sont considérés du même univers. */
export const SAME_UNIVERSE = 0.55
