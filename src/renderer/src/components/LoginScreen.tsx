import { useMemo, useState } from 'react'
import type { Profile } from '@shared/types'
import { LANGUAGES, LANGUAGE_LABELS } from '@shared/i18n'
import { useAudii } from '@/state/AudiiProvider'
import { WindowControls } from './WindowControls'
import { IconCheck, IconUser, Logo } from './Icons'

/**
 * Écran d'accueil / connexion.
 *
 * Audii n'a pas encore de serveur : le profil est **local**, stocké sur la
 * machine. L'écran sert à personnaliser l'application et prépare le terrain
 * pour le compte Buyticle (abonnement Mobile Money) de la prochaine
 * itération — aucune donnée n'est envoyée nulle part.
 */
export function LoginScreen(): React.JSX.Element {
  const { update, settings, t } = useAudii()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // Teinte de marque par défaut ; l'utilisateur peut en choisir une autre.
  const [hue, setHue] = useState(340)
  const [touched, setTouched] = useState(false)

  const trimmed = name.trim()
  const valid = trimmed.length >= 2
  const emailValid = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const initials = useMemo(
    () =>
      trimmed
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || '?',
    [trimmed]
  )

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    setTouched(true)
    if (!valid || !emailValid) return
    const profile: Profile = { name: trimmed, email: email.trim(), hue, createdAt: Date.now() }
    update({ profile })
  }

  const skip = (): void => {
    update({ profile: { name: t('login.guestName'), email: '', hue, createdAt: Date.now() } })
  }

  return (
    <div className="login">
      <header className="login-bar">
        <WindowControls />
      </header>

      <div className="login-aside" style={{ '--hue': hue } as React.CSSProperties}>
        <div className="login-aside-inner">
          <Logo size={54} radius={16} />
          <h1>Audii</h1>
          <p className="login-claim">{t('login.claim')}</p>
          <ul className="login-points">
            <li>{t('login.point1')}</li>
            <li>{t('login.point2')}</li>
            <li>{t('login.point3')}</li>
          </ul>
          <span className="login-credit">{t('login.credit')}</span>
        </div>
      </div>

      <form className="login-form" onSubmit={submit}>
        <div className="login-avatar" style={{ '--hue': hue } as React.CSSProperties}>
          {initials === '?' ? <IconUser size={26} /> : initials}
        </div>

        <h2>{t('login.welcome')}</h2>
        <p className="login-sub">{t('login.sub')}</p>

        <div className="segmented login-lang" role="group" aria-label={t('login.language')}>
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              data-lang={code}
              className={settings.language === code ? 'is-active' : ''}
              onClick={() => update({ language: code })}
            >
              {LANGUAGE_LABELS[code]}
            </button>
          ))}
        </div>

        <label className="field">
          <span>{t('login.name')}</span>
          <input
            type="text"
            value={name}
            autoFocus
            maxLength={40}
            placeholder={t('login.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
            spellCheck={false}
          />
          {touched && !valid && <em className="field-error">{t('login.nameError')}</em>}
        </label>

        <label className="field">
          <span>
            {t('login.email')} <small>{t('login.optional')}</small>
          </span>
          <input
            type="email"
            value={email}
            placeholder={t('login.emailPlaceholder')}
            onChange={(event) => setEmail(event.target.value)}
            spellCheck={false}
          />
          {touched && !emailValid && <em className="field-error">{t('login.emailError')}</em>}
        </label>

        <div className="field">
          <span>{t('login.color')}</span>
          <div className="hue-row">
            {[340, 275, 210, 160, 40].map((value) => (
              <button
                key={value}
                type="button"
                className={`hue-dot${hue === value ? ' is-active' : ''}`}
                style={{ '--hue': value } as React.CSSProperties}
                onClick={() => setHue(value)}
                aria-label={t('login.hue', { value })}
              >
                {hue === value && <IconCheck size={13} />}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn primary login-submit">
          {t('login.submit')}
        </button>
        <button type="button" className="login-skip" onClick={skip}>
          {t('login.guest')}
        </button>
      </form>
    </div>
  )
}
