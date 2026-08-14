import { useCallback, useRef, useState } from 'react'
import { useAudii, useEngine } from '@/state/AudiiProvider'
import { formatTime } from '@/lib/format'
import { artistName } from '@/lib/labels'
import { Cover } from './Cover'
import {
  IconExpand,
  IconHeart,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconVolume,
  IconVolumeMute
} from './Icons'

/** Barre de progression scrubbable (clic + glisser). */
function Seekbar(): React.JSX.Element {
  const { seek } = useAudii()
  const { currentTime, duration } = useEngine()
  const rail = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const ratioFromEvent = useCallback((clientX: number): number => {
    const box = rail.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width))
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (duration <= 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(ratioFromEvent(event.clientX))
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragging === null) return
    setDragging(ratioFromEvent(event.clientX))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragging === null) return
    seek(ratioFromEvent(event.clientX) * duration)
    setDragging(null)
  }

  const ratio = dragging ?? (duration > 0 ? currentTime / duration : 0)

  return (
    <div className="seek">
      <span className="seek-time">{formatTime(dragging !== null ? dragging * duration : currentTime)}</span>
      <div
        className="seek-rail"
        ref={rail}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="slider"
        aria-label="Progression"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        tabIndex={0}
      >
        <div className="seek-fill" style={{ width: `${ratio * 100}%` }}>
          <span className="seek-knob" />
        </div>
      </div>
      <span className="seek-time">{formatTime(duration)}</span>
    </div>
  )
}

export function PlayerBar(): React.JSX.Element {
  const { current, settings, update, toggle, next, previous, toggleFavorite, setView, view, t } = useAudii()
  const { playing, dim, error } = useEngine()
  const liked = current ? settings.favorites.includes(current.id) : false
  const muted = settings.volume === 0

  const cycleRepeat = (): void => {
    const order = ['off', 'all', 'one'] as const
    update({ repeat: order[(order.indexOf(settings.repeat) + 1) % order.length] })
  }

  return (
    <footer className="player">
      <div className="player-now">
        {current ? (
          <>
            <button
              type="button"
              className="player-open"
              title={t('player.openTrack')}
              onClick={() => setView('now')}
            >
              <Cover src={current.cover} name={current.album || current.title} size={44} radius={6} />
              <span className="player-text">
                <span className="player-title" title={current.title}>
                  {current.title}
                </span>
                <span className="player-artist" title={artistName(current, t)}>
                  {error ? t(error) : artistName(current, t)}
                </span>
              </span>
            </button>
          </>
        ) : (
          <>
            <Cover name="Audii" size={44} radius={6} />
            <div className="player-text">
              <span className="player-title">{t('player.nothing')}</span>
              <span className="player-artist">{t('player.choose')}</span>
            </div>
          </>
        )}
        <button
          type="button"
          className={`icon-ghost heart${liked ? ' is-liked' : ''}`}
          title={t('player.favorite')}
          disabled={!current}
          onClick={() => current && toggleFavorite(current.id)}
        >
          <IconHeart size={18} filled={liked} />
        </button>
      </div>

      <div className="player-center">
        <div className="transport">
          <button type="button" className="icon-ghost" title={t('player.prev')} onClick={previous}>
            <IconPrev size={19} />
          </button>
          <button type="button" className="play-button" title={t(playing ? 'player.pause' : 'player.play')} onClick={toggle}>
            {playing ? <IconPause size={17} /> : <IconPlay size={17} />}
          </button>
          <button type="button" className="icon-ghost" title={t('player.next')} onClick={next}>
            <IconNext size={19} />
          </button>
        </div>
        <Seekbar />
      </div>

      <div className="player-right">
        <button
          type="button"
          className={`icon-ghost${settings.shuffle ? ' is-on' : ''}`}
          title={t('player.shuffle')}
          onClick={() => update({ shuffle: !settings.shuffle })}
        >
          <IconShuffle size={18} />
        </button>
        <button
          type="button"
          className={`icon-ghost${settings.repeat !== 'off' ? ' is-on' : ''}`}
          title={t('player.repeat', { mode: t(`repeat.${settings.repeat}`) })}
          onClick={cycleRepeat}
        >
          {settings.repeat === 'one' ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
        </button>

        <div className={`volume${dim < 0.95 ? ' is-dimmed' : ''}`}>
          <button
            type="button"
            className="icon-ghost"
            title={t(dim < 0.95 ? 'player.smartDim' : 'player.volume')}
            onClick={() => update({ volume: muted ? 0.8 : 0 })}
          >
            {muted ? <IconVolumeMute size={18} /> : <IconVolume size={18} />}
          </button>
          <input
            className="volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            onChange={(event) => update({ volume: Number(event.target.value) })}
            aria-label={t('player.volume')}
          />
        </div>

        <button
          type="button"
          className={`icon-ghost${view === 'now' ? ' is-on' : ''}`}
          title={t('player.trackPage')}
          onClick={() => setView(view === 'now' ? 'playlists' : 'now')}
        >
          <IconExpand size={18} />
        </button>
      </div>
    </footer>
  )
}
