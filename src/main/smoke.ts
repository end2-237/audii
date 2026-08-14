import { app, type BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Test de fumée automatisé, activé par `AUDII_SMOKE=<dossier de sortie>`.
 *
 * Il pilote l'application réelle via le DOM (aucun crochet de debug n'est
 * exposé en production) : lecture d'un morceau, avancée du temps, estimation
 * de BPM, puis captures d'écran. Utilisé en CI pour valider le binaire.
 */

export const smokeDir = process.env.AUDII_SMOKE

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
    artist: text('.player-artist'),
    elapsed: text('.seek .seek-time'),
    duration: document.querySelectorAll('.seek .seek-time')[1]?.textContent?.trim() ?? null,
    rows: document.querySelectorAll('.track-row').length,
    playlists: document.querySelectorAll('.playlist-item').length,
    bpmChips: document.querySelectorAll('.bpm-chip').length
  }
})()`

export async function runSmoke(window: BrowserWindow): Promise<void> {
  const failures: string[] = []
  const log = (message: string): void => console.log(`[smoke] ${message}`)

  try {
    await wait(1200)
    await shoot(window, 'main')

    const initial = (await window.webContents.executeJavaScript(READ_STATE)) as { rows: number; playlists: number }
    log(`playlists=${initial.playlists} rows=${initial.rows}`)
    if (initial.rows === 0) failures.push('aucun morceau affiché')
    if (initial.playlists === 0) failures.push('aucune playlist affichée')

    const started = (await window.webContents.executeJavaScript(
      `(() => {
        const button = document.querySelector('.track-row .row-play')
        if (!button) return null
        button.click()
        return document.querySelector('.track-row .track-name')?.textContent ?? 'ok'
      })()`
    )) as string | null
    log(`lecture demandée : ${started ?? 'échec'}`)
    if (!started) failures.push('bouton de lecture introuvable')

    await wait(4000)
    const playing = (await window.webContents.executeJavaScript(READ_STATE)) as {
      title: string | null
      elapsed: string | null
      duration: string | null
    }
    log(`en lecture : ${playing.title} — ${playing.elapsed} / ${playing.duration}`)
    await shoot(window, 'playing')

    const seconds = Number(playing.elapsed?.split(':').pop() ?? '0')
    if (!playing.elapsed || playing.elapsed === '0:00' || seconds <= 0) {
      failures.push(`la lecture n'avance pas (${playing.elapsed})`)
    }
    if (!playing.duration || playing.duration === '0:00') failures.push('durée inconnue')

    // Panneau moteur : Lock-Vibe déclenche l'analyse locale du tempo.
    await window.webContents.executeJavaScript(
      `document.querySelector('.titlebar-actions .icon-square')?.click()`
    )
    await wait(600)
    await window.webContents.executeJavaScript(
      `(() => { const s = document.querySelector('.vibe-block .switch'); if (s && !s.classList.contains('is-on')) s.click() })()`
    )
    await wait(12000)
    const analyzed = (await window.webContents.executeJavaScript(
      `(() => ({
        bpm: document.querySelector('.vibe-bpm')?.textContent?.trim() ?? null,
        chips: document.querySelectorAll('.bpm-chip').length
      }))()`
    )) as { bpm: string | null; chips: number }
    log(`BPM du morceau : ${analyzed.bpm} — ${analyzed.chips} titre(s) analysé(s)`)
    await shoot(window, 'vibe')
    if (!analyzed.bpm || analyzed.bpm === '—') failures.push('aucun BPM estimé')
    if (analyzed.chips < 2) failures.push(`analyse de file insuffisante (${analyzed.chips} titres)`)

    // Les autres onglets de la maquette doivent aussi se peupler.
    await window.webContents.executeJavaScript(`document.querySelector('.vibe-scrim')?.click()`)
    for (const [index, name] of [[2, 'albums'], [3, 'artists'], [0, 'home']] as const) {
      await window.webContents.executeJavaScript(
        `document.querySelectorAll('.tabs .tab')[${index}]?.click()`
      )
      await wait(500)
      const cards = (await window.webContents.executeJavaScript(
        `document.querySelectorAll('.grid-card').length`
      )) as number
      log(`onglet ${name} : ${cards} carte(s)`)
      await shoot(window, name)
      if (cards === 0) failures.push(`onglet ${name} vide`)
    }
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
