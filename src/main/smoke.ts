import { app, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getMiniWindow, showMini } from './mini'

/**
 * Test de fumée automatisé, activé par `AUDII_SMOKE=<dossier de sortie>`.
 *
 * Il pilote l'application réelle via le DOM (aucun crochet de debug n'est
 * exposé en production) : profil, lecture d'un morceau, avancée du temps,
 * estimation de BPM, page du morceau, playlists tempo, thème clair, puis
 * captures d'écran. Utilisé en CI pour valider le binaire.
 *
 * `AUDII_SMOKE_RESUME=1` vérifie en plus qu'un second lancement retrouve
 * l'écoute précédente.
 */

export const smokeDir = process.env.AUDII_SMOKE
const expectResume = process.env.AUDII_SMOKE_RESUME === '1'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function shoot(window: BrowserWindow, name: string): Promise<void> {
  if (!smokeDir || window.isDestroyed()) return
  const image = await window.webContents.capturePage()
  await fs.mkdir(smokeDir, { recursive: true })
  await fs.writeFile(path.join(smokeDir, `${name}.png`), image.toPNG())
}

/** Capture le splash avant sa fermeture (utilisé par le process principal). */
export const captureSplash = (window: BrowserWindow): Promise<void> => shoot(window, 'splash')

const READ_STATE = `(() => {
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null
  return {
    title: text('.player-title'),
    elapsed: text('.seek .seek-time'),
    duration: document.querySelectorAll('.seek .seek-time')[1]?.textContent?.trim() ?? null,
    rows: document.querySelectorAll('.track-row').length,
    playlists: document.querySelectorAll('.playlist-item').length,
    theme: document.documentElement.dataset.theme ?? null,
    login: Boolean(document.querySelector('.login'))
  }
})()`

type State = {
  title: string | null
  elapsed: string | null
  duration: string | null
  rows: number
  playlists: number
  theme: string | null
  login: boolean
}

const seconds = (clock: string | null): number => {
  if (!clock) return 0
  const parts = clock.split(':').map(Number)
  return parts.reduce((total, value) => total * 60 + value, 0)
}

export async function runSmoke(window: BrowserWindow): Promise<void> {
  const failures: string[] = []
  const log = (message: string): void => console.log(`[smoke] ${message}`)
  const run = <T>(script: string): Promise<T> => window.webContents.executeJavaScript(script) as Promise<T>

  try {
    await wait(1000)

    /* ------------------------------------------------------------- profil */

    const start = await run<State>(READ_STATE)
    if (start.login) {
      await shoot(window, 'login')
      log('écran de connexion affiché')
      await run(`(() => {
        const input = document.querySelector('.login-form input[type="text"]')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'Testeur Audii')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('.login-form button[type="submit"]').click()
      })()`)
      await wait(900)
      const after = await run<State>(READ_STATE)
      if (after.login) failures.push('le profil n’a pas été créé')
      else log('profil créé')
    } else if (!expectResume) {
      failures.push('écran de connexion absent au premier lancement')
    }

    await wait(600)
    await shoot(window, 'main')

    const initial = await run<State>(READ_STATE)
    log(`playlists=${initial.playlists} rows=${initial.rows} thème=${initial.theme}`)
    if (initial.rows === 0) failures.push('aucun morceau affiché')
    if (initial.playlists === 0) failures.push('aucune playlist affichée')

    /* --------------------------------------------------- reprise d'écoute */

    if (expectResume) {
      const resumed = await run<State>(READ_STATE)
      log(`reprise : ${resumed.title} à ${resumed.elapsed}`)
      if (!resumed.title || resumed.title === 'Rien en lecture') failures.push('aucun morceau restauré')
      if (seconds(resumed.elapsed) <= 0) failures.push(`position non restaurée (${resumed.elapsed})`)
      await shoot(window, 'resume')
    }

    /* -------------------------------------------------------------- lecture */

    const started = await run<string | null>(
      `(() => {
        const button = document.querySelector('.track-row .row-play')
        if (!button) return null
        button.click()
        return document.querySelector('.track-row .track-name')?.textContent ?? 'ok'
      })()`
    )
    log(`lecture demandée : ${started ?? 'échec'}`)
    if (!started) failures.push('bouton de lecture introuvable')

    await wait(4000)
    const playing = await run<State>(READ_STATE)
    log(`en lecture : ${playing.title} — ${playing.elapsed} / ${playing.duration}`)
    await shoot(window, 'playing')
    if (seconds(playing.elapsed) <= 0) failures.push(`la lecture n'avance pas (${playing.elapsed})`)
    if (!playing.duration || playing.duration === '0:00') failures.push('durée inconnue')

    /* ----------------------------------------------------- moteur & tempo */

    await run(`document.querySelector('.titlebar-actions .icon-square')?.click()`)
    await wait(500)
    await run(
      `(() => { const s = document.querySelector('.vibe-block .switch'); if (s && !s.classList.contains('is-on')) s.click() })()`
    )
    await wait(12000)
    const analyzed = await run<{ bpm: string | null; chips: number }>(
      `(() => ({
        bpm: document.querySelector('.vibe-bpm')?.textContent?.trim() ?? null,
        chips: document.querySelectorAll('.bpm-chip').length
      }))()`
    )
    log(`BPM du morceau : ${analyzed.bpm} — ${analyzed.chips} titre(s) analysé(s)`)
    await shoot(window, 'vibe')
    if (!analyzed.bpm || analyzed.bpm === '—') failures.push('aucun BPM estimé')
    if (analyzed.chips < 2) failures.push(`analyse de file insuffisante (${analyzed.chips} titres)`)

    await run(`document.querySelector('.vibe-scrim')?.click()`)
    await wait(400)

    /* ----------------------------------------------- page du morceau */

    await run(`document.querySelector('.player-open')?.click()`)
    await wait(700)
    const followUps = await run<number>(`document.querySelectorAll('.continue-row').length`)
    log(`page du morceau : ${followUps} suite(s) proposée(s)`)
    await shoot(window, 'now-playing')
    if (followUps === 0) failures.push('« Continuer sur ce rythme » ne propose rien')

    /* --------------------------------------------------- playlists tempo */

    await run(`document.querySelector('.tabs .tab[data-tab="tempo"]')?.click()`)
    await wait(800)
    const tempo = await run<{ cards: number; sidebar: number }>(
      `(() => ({
        cards: document.querySelectorAll('.tempo-card').length,
        sidebar: document.querySelectorAll('.sidebar-section').length
      }))()`
    )
    log(`playlists tempo : ${tempo.cards} tranche(s), section sidebar=${tempo.sidebar}`)
    await shoot(window, 'tempo')
    if (tempo.cards === 0) failures.push('aucune playlist tempo générée')
    if (tempo.sidebar === 0) failures.push('section tempo absente de la barre latérale')

    // Inversion du tri : la première tranche doit changer.
    const before = await run<string | null>(`document.querySelector('.tempo-card h3')?.textContent ?? null`)
    await run(`document.querySelectorAll('.segmented button')[1]?.click()`)
    await wait(600)
    const after = await run<string | null>(`document.querySelector('.tempo-card h3')?.textContent ?? null`)
    log(`tri tempo : ${before} -> ${after}`)
    if (before && after && before === after) failures.push('le sens de tri ne change rien')

    /* ------------------------------------------------------- thème clair */

    await run(`[...document.querySelectorAll('.titlebar-actions .icon-ghost')][0]?.click()`)
    await wait(600)
    const light = await run<State>(READ_STATE)
    log(`thème : ${light.theme}`)
    await shoot(window, 'light')
    if (light.theme !== 'light') failures.push(`le thème clair ne s'applique pas (${light.theme})`)

    // Onglets restants, en thème clair.
    for (const [tab, name] of [
      ['albums', 'albums'],
      ['artists', 'artists'],
      ['playlists', 'playlists-light']
    ] as const) {
      await run(`document.querySelector('.tabs .tab[data-tab="${tab}"]')?.click()`)
      await wait(400)
      await shoot(window, name)
    }

    // Retour au thème sombre pour que la reprise reparte d'un état connu.
    await run(`[...document.querySelectorAll('.titlebar-actions .icon-ghost')][0]?.click()`)
    await wait(500)

    /* ------------------------------------------------------------- langue */

    const frLabel = await run<string | null>(
      `document.querySelector('.tabs .tab[data-tab="home"]')?.textContent ?? null`
    )
    await run(`document.querySelector('.titlebar-actions .icon-square')?.click()`)
    await wait(400)
    await run(`document.querySelector('.vibe-panel [data-lang="en"]')?.click()`)
    await wait(500)
    const enLabel = await run<string | null>(
      `document.querySelector('.tabs .tab[data-tab="home"]')?.textContent ?? null`
    )
    log(`langue : ${frLabel} -> ${enLabel}`)
    await shoot(window, 'english')
    if (enLabel !== 'Home') failures.push(`bascule en anglais ratée (${enLabel})`)

    // Vérifie qu'il ne reste pas de français visible en mode anglais.
    const leftovers = await run<string[]>(
      `(() => {
        const words = ['Ajouter', 'Analyser', 'Aucun', 'Rien en lecture', 'Coups de cœur', 'Réduire', 'Artiste inconnu', 'Récents', 'Accueil']
        const text = document.body.innerText
        return words.filter((w) => text.includes(w))
      })()`
    )
    if (leftovers.length > 0) failures.push(`français résiduel en mode anglais : ${leftovers.join(', ')}`)

    await run(`document.querySelector('.vibe-panel [data-lang="fr"]')?.click()`)
    await wait(400)
    await run(`document.querySelector('.vibe-scrim')?.click()`)
    await wait(300)

    /* ----------------------------------------------------------- favoris */

    await run(`document.querySelector('.track-row .col-actions .icon-ghost')?.click()`)
    await wait(500)
    const favorites = await run<number>(`document.querySelectorAll('.playlist-item.is-favorites').length`)
    log(`playlist favoris : ${favorites}`)
    if (favorites === 0) failures.push('la playlist des favoris n’apparaît pas après un like')
    await run(`document.querySelector('.playlist-item.is-favorites')?.click()`)
    await wait(500)
    await shoot(window, 'favorites')

    /* ------------------------------------------------------ mini-lecteur */

    await run(`document.querySelector('.win-controls .win-button')?.click()`)
    await wait(1500)
    let mini = getMiniWindow()
    if (!mini) {
      // Xvfb sans gestionnaire de fenêtres n'émet pas 'minimize' : on ouvre le
      // mini-lecteur par le même chemin que le gestionnaire d'événement.
      log('minimize sans effet (pas de WM) — ouverture directe du mini-lecteur')
      await showMini()
      await wait(800)
      mini = getMiniWindow()
    }
    if (!mini) failures.push('le mini-lecteur ne s’ouvre pas')
    else {
      await shoot(mini, 'mini')
      const title = (await mini.webContents.executeJavaScript(
        `document.querySelector('.mini-title')?.textContent ?? null`
      )) as string | null
      log(`mini-lecteur : ${title}`)
      if (!title) failures.push('le mini-lecteur n’affiche pas le morceau')

      await mini.webContents.executeJavaScript(`document.querySelector('.mini-collapse')?.click()`)
      await wait(600)
      await shoot(mini, 'mini-bubble')
      const bubble = (await mini.webContents.executeJavaScript(
        `Boolean(document.querySelector('.bubble'))`
      )) as boolean
      if (!bubble) failures.push('le mini-lecteur ne se replie pas en pastille')

      await mini.webContents.executeJavaScript(`document.querySelector('.bubble')?.click()`)
      await wait(400)
    }
    window.restore()
    window.show()
    await wait(800)

    // Laisse la sauvegarde périodique de la reprise s'exécuter.
    await wait(5500)
  } catch (error) {
    failures.push(`exception : ${error instanceof Error ? error.message : String(error)}`)
  }

  if (failures.length > 0) {
    console.error(`[smoke] ÉCHEC :\n - ${failures.join('\n - ')}`)
    app.exit(1)
    return
  }
  console.log('[smoke] OK')
  app.exit(0)
}
