import { useAudii } from '@/state/AudiiProvider'
import { energyToFactor, trackBpm } from '@/audio/vibe'
import { STYLE_LABELS } from '@/audio/style'
import { formatTime } from '@/lib/format'
import { artistName } from '@/lib/labels'
import { Cover } from './Cover'
import { IconPlay, IconSparkle, IconWave } from './Icons'

/**
 * « Continuer sur ce rythme » : ce qui peut suivre le morceau en cours, classé
 * par cohérence rythmique **et** stylistique. C'est la lecture visible du
 * moteur Lock-Vibe — l'utilisateur voit pourquoi un titre est proposé (écart
 * de tempo, style) et peut en choisir un autre d'un clic.
 */
export function ContinueRhythm(): React.JSX.Element | null {
  const { current, followUps, settings, update, play, queue, library, pendingAnalysis, analyzeAll, t } = useAudii()

  if (!current) return null

  const reference = trackBpm(current)
  const target = reference ? Math.round(reference * energyToFactor(settings.energy)) : null
  const pool = queue.length > 1 ? queue : library.tracks

  return (
    <section className="continue">
      <header className="continue-head">
        <div>
          <h2>
            <IconSparkle size={16} /> {t('continue.title')}
          </h2>
          <p>
            {target
              ? t('continue.target', {
                  bpm: target,
                  source: t(queue.length > 1 ? 'continue.fromQueue' : 'continue.fromLibrary')
                })
              : t('continue.estimating')}
          </p>
        </div>
        <button
          type="button"
          className={`chip-toggle${settings.lockVibe ? ' is-on' : ''}`}
          onClick={() => update({ lockVibe: !settings.lockVibe })}
          title={t('continue.lockTitle')}
        >
          <IconWave size={14} />
          {t(settings.lockVibe ? 'continue.lockOn' : 'continue.lockOff')}
        </button>
      </header>

      {followUps.length === 0 ? (
        <p className="continue-empty">{t('continue.empty')}</p>
      ) : (
        <ol className="continue-list">
          {followUps.map((item, index) => {
            const delta = item.delta === null ? null : Math.round(item.delta)
            return (
              <li key={item.track.id}>
                <button type="button" className="continue-row" onClick={() => play(item.track, pool)}>
                  <span className="continue-rank">{index + 1}</span>
                  <span className="continue-cover">
                    <Cover src={item.track.cover} name={item.track.album || item.track.title} size={38} radius={5} />
                    <span className="continue-play">
                      <IconPlay size={13} />
                    </span>
                  </span>
                  <span className="continue-text">
                    <span className="continue-title">{item.track.title}</span>
                    <span className="continue-artist">{artistName(item.track, t)}</span>
                  </span>
                  {/* La pastille de style rend visible le garde-fou : on voit
                      qu'on reste dans le même univers, pas juste au même BPM. */}
                  <span className="continue-style" title={t('style.label')}>
                    {item.style ? STYLE_LABELS[item.style] : t('style.unknown')}
                  </span>
                  <span className="continue-bpm">
                    {item.bpm ? (
                      <>
                        <strong>{item.bpm}</strong>
                        <em className={delta === null || delta === 0 ? '' : delta > 0 ? 'up' : 'down'}>
                          {delta === null || delta === 0
                            ? t('continue.same')
                            : `${delta > 0 ? '+' : ''}${delta} BPM`}
                        </em>
                      </>
                    ) : (
                      <em className="pending">{t('continue.unknown')}</em>
                    )}
                  </span>
                  <span className="continue-time">{formatTime(item.track.duration)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {pendingAnalysis > 0 && (
        <footer className="continue-foot">
          <span>{t('continue.pending', { count: pendingAnalysis })}</span>
          <button type="button" className="btn ghost sm" onClick={analyzeAll}>
            {t('continue.analyzeAll')}
          </button>
        </footer>
      )}
    </section>
  )
}
