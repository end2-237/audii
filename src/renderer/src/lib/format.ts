/** mm:ss (ou h:mm:ss au-delà d'une heure). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** « 2h 31 min » pour la durée cumulée d'une playlist. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  if (h > 0) return `${h}h ${m} min`
  if (m > 0) return `${m} min`
  return `${total} s`
}

/** Format « 22.6.2024 » comme dans la maquette. */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return String(value)
}

export const plural = (count: number, one: string, many: string): string =>
  `${count} ${count > 1 ? many : one}`
