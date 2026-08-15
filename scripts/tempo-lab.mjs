/**
 * Banc d'essai du tempo — hors application.
 *
 *   npm run tempo-lab -- <dossier|fichiers…> [--out rapport.json]
 *
 * Décode de vrais fichiers audio et leur applique **l'estimateur du produit**,
 * importé depuis `src/renderer/src/audio/analyze.ts`. Rien n'est réimplémenté
 * ici : un banc qui referait le calcul validerait sa propre copie.
 *
 * Le décodage passe par Electron, seul environnement disponible qui embarque
 * les codecs propriétaires (MP3, AAC) — et accessoirement celui de
 * l'application, donc le même décodeur exactement.
 *
 * Le rapport JSON contient, par morceau : les métadonnées lues, le BPM du tag
 * s'il existe, le BPM estimé, l'énergie, la famille de style détectée et le
 * temps de calcul. Le BPM du tag, quand il est présent, sert de vérité de
 * référence et l'écart est calculé.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const labDir = path.join(root, 'dist/lab')

const EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus', '.wma', '.aiff', '.aif']

/* --------------------------------------------------------------- arguments */

const args = process.argv.slice(2)
const verifier = args.includes('--verifier')
const outIndex = args.indexOf('--out')
const outFile = outIndex >= 0 ? args[outIndex + 1] : path.join(root, 'tempo-lab.json')
const entrees = (outIndex >= 0 ? [...args.slice(0, outIndex), ...args.slice(outIndex + 2)] : args)
  .filter((a) => Boolean(a) && a !== '--verifier')

if (entrees.length === 0) {
  console.error('usage : npm run tempo-lab -- <dossier|fichiers…> [--out rapport.json] [--verifier]')
  process.exit(1)
}

/** Développe les dossiers en liste de fichiers audio. */
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

/* ------------------------------------------------- compilation de l'estimateur */

mkdirSync(labDir, { recursive: true })

await build({
  entryPoints: [path.join(root, 'src/renderer/src/audio/analyze.ts')],
  outfile: path.join(labDir, 'analyze.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  logLevel: 'warning'
})

await build({
  entryPoints: [path.join(root, 'src/renderer/src/audio/style.ts')],
  outfile: path.join(labDir, 'style.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  logLevel: 'warning'
})

writeFileSync(
  path.join(labDir, 'input.json'),
  JSON.stringify({ fichiers, sortie: path.resolve(outFile), verifier })
)

writeFileSync(
  path.join(labDir, 'lab.html'),
  `<!doctype html><meta charset="utf-8"><title>Banc d'essai tempo</title>
<body style="font:13px system-ui;background:#0b0910;color:#eee;padding:20px">
<pre id="journal"></pre>
<script type="module" src="./lab.js"></script>
</body>`
)

writeFileSync(
  path.join(labDir, 'lab.js'),
  `import { analyzeBuffer, rankTempi, envelopeOf } from './analyze.js'
import { styleOf } from './style.js'

const fs = require('node:fs')
const path = require('node:path')
const mm = require(${JSON.stringify(path.join(root, 'node_modules/music-metadata'))})

const journal = document.getElementById('journal')
const dire = (t) => { journal.textContent += t + '\\n'; console.log(t) }

const { fichiers, sortie, verifier } = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(labDir, 'input.json'))}, 'utf8'))
const contexte = new AudioContext()
const resultats = []

for (const [i, fichier] of fichiers.entries()) {
  const nom = path.basename(fichier)
  const ligne = { fichier: nom, chemin: fichier }
  try {
    const octets = fs.readFileSync(fichier)
    ligne.octets = octets.length

    let tags = {}
    try {
      const meta = await mm.parseBuffer(octets, { path: fichier }, { duration: true })
      tags = meta.common ?? {}
      ligne.duree = Math.round(meta.format?.duration ?? 0)
      ligne.codec = meta.format?.codec ?? null
      ligne.debit = meta.format?.bitrate ? Math.round(meta.format.bitrate / 1000) : null
    } catch (e) { ligne.erreurTags = String(e).slice(0, 120) }

    ligne.titre = tags.title ?? nom
    ligne.artiste = tags.artist ?? ''
    ligne.album = tags.album ?? ''
    ligne.genre = Array.isArray(tags.genre) ? tags.genre.join(', ') : (tags.genre ?? '')
    ligne.bpmTag = tags.bpm ? Math.round(Number(tags.bpm)) : null

    const debut = performance.now()
    const audio = await contexte.decodeAudioData(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.length))
    ligne.decodeMs = Math.round(performance.now() - debut)
    ligne.canaux = audio.numberOfChannels
    ligne.echantillonnage = audio.sampleRate

    const t0 = performance.now()
    const r = analyzeBuffer(audio)
    ligne.analyseMs = Math.round(performance.now() - t0)
    ligne.bpmEstime = r.bpm
    ligne.energie = r.energy

    // Les cinq meilleurs candidats : sans eux, une erreur d'octave se corrige
    // à l'aveugle. On veut savoir si le bon tempo était deuxième ou absent.
    const env = envelopeOf(audio)
    ligne.rms = Number(env.rms.toExponential(3))
    ligne.crete = Number(env.peak.toFixed(3))
    const classement = rankTempi(env)
    ligne.candidats = classement.slice(0, 5).map((c) => ({
      bpm: c.bpm, brut: Number(c.brut.toExponential(3)),
      poids: Number(c.poids.toFixed(3)), note: Number(c.note.toExponential(3))
    }))
    if (ligne.bpmTag) {
      // Rang du tempo du tag (à 3 % près) dans le classement complet.
      const i = classement.findIndex((c) => Math.abs(c.bpm - ligne.bpmTag) / ligne.bpmTag < 0.03)
      ligne.rangDuTag = i < 0 ? null : i + 1
      if (i >= 0) ligne.noteDuTag = Number(classement[i].note.toExponential(3))
    }

    ligne.style = styleOf({
      genre: ligne.genre, artist: ligne.artiste, album: ligne.album, folder: path.dirname(fichier)
    })

    if (ligne.bpmTag && ligne.bpmEstime) {
      ligne.ecart = ligne.bpmEstime - ligne.bpmTag
      const rapport = ligne.bpmEstime / ligne.bpmTag
      ligne.octaveProbable = rapport > 1.8 ? 'double' : rapport < 0.6 ? 'moitié' : 'même'
    }
    dire(\`[\${i + 1}/\${fichiers.length}] \${nom} -> \${ligne.bpmEstime ?? '—'} BPM\` +
      (ligne.bpmTag ? \` (tag \${ligne.bpmTag}, écart \${ligne.ecart})\` : '') +
      \` · \${ligne.style} · \${ligne.analyseMs} ms\`)
  } catch (e) {
    ligne.erreur = String(e).slice(0, 200)
    dire(\`[\${i + 1}/\${fichiers.length}] \${nom} -> ÉCHEC : \${ligne.erreur}\`)
  }
  resultats.push(ligne)
}

const avecTag = resultats.filter((r) => r.bpmTag && r.bpmEstime)
const rapport = {
  genere: new Date().toISOString(),
  version: 'analyze.ts tel quel',
  morceaux: resultats.length,
  analyses: resultats.filter((r) => r.bpmEstime).length,
  echecs: resultats.filter((r) => r.erreur).length,
  reference: avecTag.length
    ? {
        morceauxAvecTagBpm: avecTag.length,
        ecartMoyenAbsolu: Number((avecTag.reduce((s, r) => s + Math.abs(r.ecart), 0) / avecTag.length).toFixed(2)),
        justeA2Bpm: avecTag.filter((r) => Math.abs(r.ecart) <= 2).length,
        erreursDOctave: avecTag.filter((r) => r.octaveProbable !== 'même').length
      }
    : null,
  resultats
}
fs.writeFileSync(sortie, JSON.stringify(rapport, null, 2))
dire('\\n--- rapport écrit : ' + sortie + ' ---')
/**
 * Mode garde-fou : les fixtures synthétiques portent leur tempo dans leurs
 * métadonnées, ce qui donne une vérité de référence exacte. Toute dérive de
 * l'estimateur fait échouer la commande — c'est ce qui manquait quand une
 * régression pouvait passer inaperçue.
 */
let sortieCode = 0
if (verifier) {
  const ATTENDUS = { 'Slow Motion': 72, 'Night Drive': 92, 'Golden Hour': 104, 'Deep Work': 110,
    'Flow State': 118, 'Push Harder': 128, 'Sprint': 150, 'Cooldown': 88 }
  const fautes = []
  let verifies = 0
  for (const r of resultats) {
    const cle = Object.keys(ATTENDUS).find((k) => (r.titre || r.fichier).includes(k))
    if (!cle) continue
    verifies++
    const attendu = ATTENDUS[cle]
    if (!r.bpmEstime) { fautes.push(cle + ' : aucun tempo estimé'); continue }
    const ecart = Math.abs(r.bpmEstime - attendu)
    const octave = Math.abs(r.bpmEstime - 2 * attendu) <= 4 || Math.abs(2 * r.bpmEstime - attendu) <= 4
    if (octave) fautes.push(cle + ' : erreur d octave, ' + attendu + ' -> ' + r.bpmEstime)
    else if (ecart > 2) fautes.push(cle + ' : ' + attendu + ' attendu, ' + r.bpmEstime + ' obtenu')
  }
  dire('\\n--- vérification : ' + (verifies - fautes.length) + '/' + verifies + ' morceaux justes ---')
  for (const f of fautes) dire('  ÉCHEC ' + f)
  if (verifies === 0) { dire('  ÉCHEC aucune fixture reconnue'); sortieCode = 1 }
  if (fautes.length > 0) sortieCode = 1
}
require('electron').ipcRenderer.send('lab:fini', sortieCode)
`
)

/* ----------------------------------------------------------- lanceur Electron */

writeFileSync(
  path.join(labDir, 'main.cjs'),
  `const { app, BrowserWindow, ipcMain } = require('electron')
app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const w = new BrowserWindow({
    show: process.env.LAB_VISIBLE === '1',
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  })
  w.loadFile(${JSON.stringify(path.join(labDir, 'lab.html'))})
  w.webContents.on('console-message', (_e, _l, m) => console.log(m))
  ipcMain.on('lab:fini', (_e, code) => app.exit(code ?? 0))
})
`
)

console.log(`[audii] ${fichiers.length} fichier(s) à analyser…\n`)

const electron = existsSync(path.join(root, 'node_modules/.bin/electron'))
  ? path.join(root, 'node_modules/.bin/electron')
  : 'electron'

const enfant = spawn(electron, [path.join(labDir, 'main.cjs'), '--no-sandbox'], {
  stdio: 'inherit',
  env: { ...process.env }
})
enfant.on('exit', (code) => process.exit(code ?? 1))
