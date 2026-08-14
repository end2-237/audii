import '@fontsource-variable/inter'
import './styles/splash.css'

const status = document.getElementById('status')
const fill = document.getElementById('fill')
const splash = document.getElementById('splash')

/** Progression lissée : la barre ne recule jamais et n'avance jamais par à-coups. */
let displayed = 0
let target = 0.04

const tick = (): void => {
  displayed += (target - displayed) * 0.12
  if (fill) fill.style.width = `${Math.min(100, displayed * 100)}%`
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

window.audii?.splash.onStatus(({ message, progress, done }) => {
  if (status && message) status.textContent = message
  target = Math.max(target, Math.min(1, progress))
  if (done) {
    target = 1
    splash?.classList.add('is-leaving')
  }
})

// Fallback : sans IPC (ouverture directe du fichier), la barre progresse seule.
setTimeout(() => {
  if (target < 0.3) target = 0.6
}, 1500)
