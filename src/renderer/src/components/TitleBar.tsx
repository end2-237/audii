import { useEffect, useRef } from 'react'
import type { MessageKey } from '@shared/i18n'
import { useAudii, type View } from '@/state/AudiiProvider'
import { WindowControls } from './WindowControls'
import { IconBell, IconDots, IconMoon, IconSearch, IconSun, Logo } from './Icons'

const TABS: { id: View; key: MessageKey }[] = [
  { id: 'home', key: 'nav.home' },
  { id: 'playlists', key: 'nav.playlists' },
  { id: 'albums', key: 'nav.albums' },
  { id: 'artists', key: 'nav.artists' },
  { id: 'tempo', key: 'nav.tempo' }
]

export function TitleBar(): React.JSX.Element {
  const { view, setView, search, setSearch, vibeOpen, setVibeOpen, settings, update, platform, t } = useAudii()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const light = document.documentElement.dataset.theme === 'light'
  const profile = settings.profile
  const initials =
    profile?.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'A'

  return (
    <header className={`titlebar${platform === 'darwin' ? ' is-mac' : ''}`}>
      {platform === 'darwin' && <WindowControls />}

      <div className="titlebar-logo">
        <Logo size={26} radius={8} />
      </div>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab${view === tab.id ? ' is-active' : ''}`}
            data-tab={tab.id}
            onClick={() => setView(tab.id)}
          >
            {t(tab.key)}
          </button>
        ))}
      </nav>

      <div className="search">
        <IconSearch size={15} className="search-icon" />
        <input
          ref={input}
          type="text"
          value={search}
          placeholder={t('search.placeholder')}
          onChange={(event) => setSearch(event.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="titlebar-actions">
        <button
          type="button"
          className="icon-ghost"
          title={t(light ? 'action.themeToDark' : 'action.themeToLight')}
          onClick={() => update({ theme: light ? 'dark' : 'light' })}
        >
          {light ? <IconMoon size={17} /> : <IconSun size={17} />}
        </button>
        <button
          type="button"
          className={`icon-square${vibeOpen ? ' is-active' : ''}`}
          title={t('action.engine')}
          onClick={() => setVibeOpen(!vibeOpen)}
        >
          <IconDots size={16} />
        </button>
        <button type="button" className="icon-ghost" title={t('action.notifications')}>
          <IconBell size={17} />
        </button>
        <button
          type="button"
          className="avatar"
          title={profile ? `${profile.name}${profile.email ? ` — ${profile.email}` : ''}` : t('action.profile')}
          style={profile ? ({ '--hue': profile.hue } as React.CSSProperties) : undefined}
          onClick={() => setVibeOpen(true)}
        >
          <span>{initials}</span>
        </button>
      </div>

      {platform !== 'darwin' && <WindowControls />}
    </header>
  )
}
