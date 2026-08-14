import { useMemo, useState } from 'react'

/** Palette déterministe pour les pochettes manquantes. */
const GRADIENTS = [
  ['#ff2d8e', '#8a2af6'],
  ['#7c3aed', '#2563eb'],
  ['#f97316', '#db2777'],
  ['#06b6d4', '#4f46e5'],
  ['#22c55e', '#0ea5e9'],
  ['#eab308', '#ef4444'],
  ['#a855f7', '#ec4899']
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

interface CoverProps {
  src?: string | null
  name: string
  size: number
  radius?: number
  className?: string
}

export function Cover({ src, name, size, radius = 6, className }: CoverProps): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const [from, to] = useMemo(() => GRADIENTS[hashString(name) % GRADIENTS.length], [name])

  if (src && !failed) {
    return (
      <img
        className={`cover${className ? ` ${className}` : ''}`}
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: radius }}
        onError={() => setFailed(true)}
        draggable={false}
      />
    )
  }

  return (
    <span
      className={`cover cover-fallback${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        fontSize: Math.max(9, Math.round(size * 0.38))
      }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '♪'}
    </span>
  )
}
