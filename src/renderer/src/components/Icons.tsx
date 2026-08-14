/** Jeu d'icônes en SVG inline : aucun asset externe, rendu net à toute densité. */
interface IconProps {
  size?: number
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg'
})

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

export const IconSearch = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="6.5" {...stroke} />
    <path d="m16 16 4 4" {...stroke} />
  </svg>
)

export const IconBell = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" {...stroke} />
    <path d="M13.7 19a2 2 0 0 1-3.4 0" {...stroke} />
  </svg>
)

export const IconDots = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="5" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" />
  </svg>
)

export const IconPlus = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" {...stroke} />
  </svg>
)

export const IconCollapse = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M20 5v14" {...stroke} />
    <path d="M14 12H4m4-4-4 4 4 4" {...stroke} />
  </svg>
)

export const IconSort = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h13M4 12h9M4 17h5" {...stroke} />
  </svg>
)

export const IconPlay = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
  </svg>
)

export const IconPause = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="7" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
  </svg>
)

export const IconPrev = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M17 6v12L8 12l9-6Z" fill="currentColor" />
    <rect x="5" y="6" width="2" height="12" rx="1" fill="currentColor" />
  </svg>
)

export const IconNext = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M7 6v12l9-6-9-6Z" fill="currentColor" />
    <rect x="17" y="6" width="2" height="12" rx="1" fill="currentColor" />
  </svg>
)

export const IconShuffle = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 7h3.5l3 4.5M21 7h-4l-8 10H3" {...stroke} />
    <path d="M21 17h-4" {...stroke} />
    <path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" {...stroke} />
  </svg>
)

export const IconRepeat = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12V9a3 3 0 0 1 3-3h11" {...stroke} />
    <path d="m15.5 3.5 3 2.5-3 2.5" {...stroke} />
    <path d="M20 12v3a3 3 0 0 1-3 3H6" {...stroke} />
    <path d="m8.5 20.5-3-2.5 3-2.5" {...stroke} />
  </svg>
)

export const IconRepeatOne = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12V9a3 3 0 0 1 3-3h11" {...stroke} />
    <path d="m15.5 3.5 3 2.5-3 2.5" {...stroke} />
    <path d="M20 12v3a3 3 0 0 1-3 3H6" {...stroke} />
    <path d="m8.5 20.5-3-2.5 3-2.5" {...stroke} />
    <path d="M11.6 14.5v-4l-1.2.8" {...stroke} strokeWidth={1.5} />
  </svg>
)

export const IconVolume = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 9.5h3l4-3.5v12l-4-3.5H5v-5Z" {...stroke} />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6" {...stroke} />
    <path d="M18 7a7.5 7.5 0 0 1 0 10" {...stroke} />
  </svg>
)

export const IconVolumeMute = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 9.5h3l4-3.5v12l-4-3.5H5v-5Z" {...stroke} />
    <path d="m16 10 4 4m0-4-4 4" {...stroke} />
  </svg>
)

export const IconSpeaker = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 9.5h3l4-3.5v12l-4-3.5H5v-5Z" fill="currentColor" stroke="none" />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6" {...stroke} />
  </svg>
)

export const IconExpand = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" {...stroke} />
  </svg>
)

export const IconHeart = ({ size = 16, className, filled = false }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 3C19.5 15.4 12 20 12 20Z"
      {...stroke}
      fill={filled ? 'currentColor' : 'none'}
    />
  </svg>
)

export const IconPin = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 3h6l-1 5 3 3H7l3-3-1-5Z" {...stroke} />
    <path d="M12 11v9" {...stroke} />
  </svg>
)

export const IconNote = ({ size = 12, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 18V6l10-2v12" {...stroke} />
    <ellipse cx="6.5" cy="18" rx="3.2" ry="2.6" fill="currentColor" stroke="none" />
    <ellipse cx="16.5" cy="16" rx="3.2" ry="2.6" fill="currentColor" stroke="none" />
  </svg>
)

export const IconFolder = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17V7.5Z" {...stroke} />
  </svg>
)

export const IconWave = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 12v0M8 8v8M12 5v14M16 9v6M20 12v0" {...stroke} strokeWidth={2} />
  </svg>
)

export const IconMic = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" {...stroke} />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" {...stroke} />
  </svg>
)

export const IconLock = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4.5" y="10" width="15" height="10" rx="2.5" {...stroke} />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" {...stroke} />
  </svg>
)

export const IconClose = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m6 6 12 12M18 6 6 18" {...stroke} />
  </svg>
)

/** Logo Audii : carré arrondi dégradé + note blanche. */
export const Logo = ({ size = 26, radius = 8 }: { size?: number; radius?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="audii-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF2D8E" />
        <stop offset="1" stopColor="#8A2AF6" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx={radius} fill="url(#audii-logo)" />
    <path
      d="M16.6 8.2v9.9c0 1.7-1.6 3-3.5 3s-3.5-1.3-3.5-3 1.6-3 3.5-3c.6 0 1.1.1 1.6.3V7.4l6.4 2.7c1.5.7 2.4 2 2.4 3.6 0 .9-.3 1.7-.8 2.4l-1.4-1c.3-.4.5-.9.5-1.4 0-.9-.5-1.6-1.3-2l-3.9-1.6Z"
      fill="#fff"
    />
  </svg>
)
