import { useEffect, useRef } from 'react'
import { useAudii, type View } from '@/state/AudiiProvider'
import { IconBell, IconDots, IconSearch, Logo } from './Icons'

const TABS: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' }
]

export function TitleBar(): React.JSX.Element {
  const { view, setView, search, setSearch, vibeOpen, setVibeOpen } = useAudii()
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

  return (
    <header className="titlebar">
      <div className="traffic">
        <button
          type="button"
          className="traffic-dot close"
          title="Fermer"
          onClick={() => window.audii.window.close()}
        />
        <button
          type="button"
          className="traffic-dot minimize"
          title="Réduire"
          onClick={() => window.audii.window.minimize()}
        />
        <button
          type="button"
          className="traffic-dot zoom"
          title="Agrandir"
          onClick={() => window.audii.window.maximize()}
        />
      </div>

      <div className="titlebar-logo">
        <Logo size={26} radius={8} />
      </div>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab${view === tab.id ? ' is-active' : ''}`}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="search">
        <IconSearch size={15} className="search-icon" />
        <input
          ref={input}
          type="text"
          value={search}
          placeholder="What do you want to listen?"
          onChange={(event) => setSearch(event.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="titlebar-actions">
        <button
          type="button"
          className={`icon-square${vibeOpen ? ' is-active' : ''}`}
          title="Moteur Audii"
          onClick={() => setVibeOpen(!vibeOpen)}
        >
          <IconDots size={16} />
        </button>
        <button type="button" className="icon-ghost" title="Notifications">
          <IconBell size={17} />
        </button>
        <button type="button" className="avatar" title="Profil">
          <span>A</span>
        </button>
      </div>
    </header>
  )
}
