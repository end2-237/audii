/**
 * Vérification du tempo à l'oreille, sans rien taper.
 *
 *   npm run tempo-clic -- <dossier|fichiers…> [--sortie dossier]
 *
 * Pour chaque morceau, produit **un** fichier audio contenant deux extraits :
 * le même passage, d'abord avec un clic au tempo retenu par Audii, puis avec
 * un clic au tempo rival (le tag du fichier, ou le second candidat). Deux
 * bips séparent les deux moitiés.
 *
 * L'auditeur n'a qu'à dire « le premier » ou « le deuxième ».
 *
 * Pourquoi ce détour plutôt qu'un tap-tempo : taper au rythme demande de
 * *produire* une valeur, ce qu'un humain fait à ±3 BPM avec de la dérive,
 * pendant trente secondes par titre. Juger si un clic tombe sur le temps est
 * une question binaire, instantanée, et sans erreur de saisie. On demande
 * donc de valider, pas de mesurer.
 *
 * La phase compte autant que la période : un clic au bon tempo mais décalé
 * sonne faux. Elle est estimée en cherchant le décalage qui maximise l'énergie
 * d'attaque tombant sur les temps.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const labDir = path.join(root, 'dist/lab')

const EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus']

const args = process.argv.slice(2)
const sortieIndex = args.indexOf('--sortie')
const sortieDir = sortieIndex >= 0 ? path.resolve(args[sortieIndex + 1]) : path.join(root, 'clics')
const entrees = (sortieIndex >= 0 ? [...args.slice(0, sortieIndex), ...args.slice(sortieIndex + 2)] : args).filter(Boolean)

if (entrees.length === 0) {
  console.error('usage : npm run tempo-clic -- <dossier|fichiers…> [--sortie dossier]')
  process.exit(1)
}

function collecter(cible, acc = []) {
  const info = statSync(cible)
  if (info.isDirectory()) {
    for (const nom of readdirSync(cible).sort()) collecter(path.join(cible, nom), acc)
  } else if (EXTENSIONS.includes(path.extname(cible).toLowerCase())) {
    acc.push(path.resolve(cible))
  }
  return acc
}

const fichiers = entrees.flatMap((e) => collecter(e))
if (fichiers.length === 0) {
  console.error('aucun fichier audio trouvé')
  process.exit(1)
}

mkdirSync(labDir, { recursive: true })
mkdirSync(sortieDir, { recursive: true })

for (const module of ['analyze', 'style']) {
  await build({
    entryPoints: [path.join(root, `src/renderer/src/audio/${module}.ts`)],
    outfile: path.join(labDir, `${module}.js`),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome120',
    logLevel: 'warning'
  })
}

writeFileSync(path.join(labDir, 'clic-input.json'), JSON.stringify({ fichiers, sortieDir }))

writeFileSync(
  path.join(labDir, 'clic.html'),
  `<!doctype html><meta charset="utf-8"><title>Clics de vérification</title>
<body style="font:13px system-ui;background:#0b0910;color:#eee;padding:20px">
<pre id="journal"></pre><script type="module" src="./clic.js"></script></body>`
)

writeFileSync(
  path.join(labDir, 'clic.js'),
  `import { analyzeBuffer, rankTempi, envelopeOf } from './analyze.js'

const fs = require('node:fs')
const path = require('node:path')
const mm = require(${JSON.stringify(path.join(root, 'node_modules/music-metadata'))})

const journal = document.getElementById('journal')
const dire = (t) => { journal.textContent += t + '\\n'; console.log(t) }

const { fichiers, sortieDir } = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(labDir, 'clic-input.json'))}, 'utf8'))

const EXTRAIT = 12      // secondes par moitié
const SORTIE_HZ = 22050 // mono : un clic ne demande pas la haute fidélité
const contexte = new AudioContext()

/**
 * Décalage, en secondes, qui aligne le mieux une grille de temps sur les
 * attaques du morceau. Sans cette phase, un clic au bon tempo tombe à côté
 * et l'auditeur rejetterait une bonne réponse.
 */
function phase(env, bpm) {
  const periode = (60 / bpm) * env.framesPerSecond
  let meilleur = 0
  let note = -1
  for (let d = 0; d < Math.ceil(periode); d++) {
    let s = 0
    for (let t = d; t < env.onsets.length; t += periode) s += env.onsets[Math.round(t)] || 0
    if (s > note) { note = s; meilleur = d }
  }
  return meilleur / env.framesPerSecond
}

/** Encode du PCM mono en WAV 16 bits. */
function wav(echantillons, taux) {
  const octets = Buffer.alloc(44 + echantillons.length * 2)
  octets.write('RIFF', 0); octets.writeUInt32LE(36 + echantillons.length * 2, 4)
  octets.write('WAVE', 8); octets.write('fmt ', 12); octets.writeUInt32LE(16, 16)
  octets.writeUInt16LE(1, 20); octets.writeUInt16LE(1, 22)
  octets.writeUInt32LE(taux, 24); octets.writeUInt32LE(taux * 2, 28)
  octets.writeUInt16LE(2, 32); octets.writeUInt16LE(16, 34)
  octets.write('data', 36); octets.writeUInt32LE(echantillons.length * 2, 40)
  for (let i = 0; i < echantillons.length; i++) {
    const v = Math.max(-1, Math.min(1, echantillons[i]))
    octets.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return octets
}

/**
 * Un clic sec : sinus court à 1,4 kHz avec enveloppe exponentielle.
 *
 * Le niveau compte autant que la position. À force égale avec la musique, le
 * clic se noie dans les percussions d'un master moderne — un contrôle
 * automatique s'y est trompé avant qu'une oreille ne s'y trompe. La musique
 * est donc reculée et le clic mis nettement devant : on ne cherche pas un
 * mixage agréable, on cherche une réponse fiable.
 */
function clic(dans, position, taux, force) {
  const duree = Math.round(0.028 * taux)
  for (let i = 0; i < duree && position + i < dans.length; i++) {
    const t = i / taux
    dans[position + i] += Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t * 130) * force
  }
}

const resume = []

for (const [n, fichier] of fichiers.entries()) {
  const nom = path.basename(fichier).replace(/\\.[^.]+$/, '')
  try {
    const octets = fs.readFileSync(fichier)
    let tags = {}
    try { tags = (await mm.parseBuffer(octets, { path: fichier })).common ?? {} } catch {}
    const bpmTag = tags.bpm ? Math.round(Number(tags.bpm)) : null

    const audio = await contexte.decodeAudioData(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.length))
    const env = envelopeOf(audio)
    const classement = rankTempi(env)
    const retenu = analyzeBuffer(audio).bpm
    if (!retenu) { dire(nom + ' : aucun tempo, ignoré'); continue }

    /**
     * Le rival : le tag quand il existe et diffère, sinon le meilleur candidat
     * qui n'est pas une variante à 3 % du retenu. C'est la seule vraie
     * question — les deux sont plausibles, il faut une oreille pour trancher.
     */
    let rival = null
    if (bpmTag && Math.abs(bpmTag - retenu) / retenu > 0.05) rival = bpmTag
    else {
      const autre = classement.find((c) => Math.abs(c.bpm - retenu) / retenu > 0.15)
      rival = autre ? Math.round(autre.bpm) : null
    }
    if (!rival) { dire(nom + ' : pas de rival crédible, rien à départager'); continue }

    // Extrait pris à 40 % du morceau : on y est en général dans le refrain.
    const debutSec = Math.max(0, audio.duration * 0.4)
    const longueur = Math.min(EXTRAIT, audio.duration - debutSec)
    const rapport = SORTIE_HZ / audio.sampleRate
    const nEch = Math.floor(longueur * SORTIE_HZ)

    const source = audio.getChannelData(0)
    const source2 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null
    const decalage = Math.floor(debutSec * audio.sampleRate)

    const faire = (bpm) => {
      const buf = new Float32Array(nEch)
      for (let i = 0; i < nEch; i++) {
        const j = decalage + Math.round(i / rapport)
        const g = source[j] || 0
        buf[i] = (source2 ? (g + (source2[j] || 0)) / 2 : g) * 0.40
      }
      const ph = phase(env, bpm)
      const periode = 60 / bpm
      // La phase est mesurée depuis le début de la fenêtre d'analyse, qui est
      // centrée : on la reporte sur l'extrait modulo la période.
      let t = ((ph - (debutSec % periode)) % periode + periode) % periode
      let poses = 0
      while (t < longueur) {
        clic(buf, Math.round(t * SORTIE_HZ), SORTIE_HZ, poses % 4 === 0 ? 1 : 0.72)
        t += periode
        poses++
      }
      return buf
    }

    const a = faire(retenu)
    const b = faire(rival)
    const silence = new Float32Array(Math.round(0.9 * SORTIE_HZ))
    // Deux bips graves annoncent la seconde moitié.
    for (const p of [0.1, 0.35]) {
      const d = Math.round(0.09 * SORTIE_HZ)
      for (let i = 0; i < d; i++) {
        const t = i / SORTIE_HZ
        silence[Math.round(p * SORTIE_HZ) + i] = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 12) * 0.5
      }
    }

    const total = new Float32Array(a.length + silence.length + b.length)
    total.set(a, 0); total.set(silence, a.length); total.set(b, a.length + silence.length)

    const cible = path.join(sortieDir, nom.slice(0, 40).replace(/[^\\w-]/g, '_') + '__A' + retenu + '_B' + rival + '.wav')
    fs.writeFileSync(cible, wav(total, SORTIE_HZ))
    resume.push({ fichier: nom, A: retenu, B: rival, tag: bpmTag, sortie: path.basename(cible) })
    dire('[' + (n + 1) + '/' + fichiers.length + '] ' + nom.slice(0, 34) + '  A=' + retenu + '  B=' + rival + (bpmTag ? '  (tag ' + bpmTag + ')' : ''))
  } catch (e) {
    dire(nom + ' : ÉCHEC ' + String(e).slice(0, 120))
  }
}

fs.writeFileSync(path.join(sortieDir, 'candidats.json'), JSON.stringify(resume, null, 2))
dire('\\n--- ' + resume.length + ' fichier(s) écrits dans ' + sortieDir + ' ---')
require('electron').ipcRenderer.send('lab:fini', 0)
`
)

writeFileSync(
  path.join(labDir, 'clic-main.cjs'),
  `const { app, BrowserWindow, ipcMain } = require('electron')
app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const w = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false } })
  w.loadFile(${JSON.stringify(path.join(labDir, 'clic.html'))})
  w.webContents.on('console-message', (_e, _l, m) => console.log(m))
  ipcMain.on('lab:fini', (_e, code) => app.exit(code ?? 0))
})
`
)

console.log(`[audii] ${fichiers.length} morceau(x) -> clics de vérification\n`)

const electron = existsSync(path.join(root, 'node_modules/.bin/electron'))
  ? path.join(root, 'node_modules/.bin/electron')
  : 'electron'
spawn(electron, [path.join(labDir, 'clic-main.cjs'), '--no-sandbox'], { stdio: 'inherit' }).on('exit', (c) =>
  process.exit(c ?? 1)
)
