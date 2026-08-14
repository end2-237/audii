/**
 * Construit la landing d'Audii depuis `docs/index.template.html`.
 *
 * La page est volontairement **autonome** : police, captures et logo sont
 * encodés dans le fichier. Aucun asset externe, donc rien à servir à côté,
 * rien qui puisse manquer, et une page qui s'affiche entière au premier
 * octet reçu. Le prix est un fichier d'environ 800 Ko, largement compensé
 * par la compression du serveur.
 *
 * Deux sorties, parce que les deux destinations n'attendent pas la même
 * chose :
 *   - `docs/index.html` : le corps seul, pour l'outil Artifact qui fournit
 *     lui-même l'ossature `<html><head>` ;
 *   - `web/index.html`  : le document complet, pour Vercel et GitHub Pages.
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const docs = path.join(root, 'docs')
const web = path.join(root, 'web')

/**
 * Inter est recopiée dans le dépôt plutôt que lue dans `node_modules` : la
 * landing se déploie ainsi sans installer une seule dépendance. Faire un
 * `npm install` sur Vercel tirerait Electron — deux cents mégaoctets pour
 * lire une police de quarante-huit kilo-octets.
 */
const FONT = path.join(root, 'docs/fonts/inter-latin-wght-normal.woff2')

/** Les écrans du carrousel, dans l'ordre où l'index numéroté les compte. */
const VUES = [
  ['now-playing', 'Page du morceau'],
  ['tempo', 'Playlists par tempo'],
  ['vibe', 'Moteur Audii'],
  ['favorites', 'Coups de cœur'],
  ['light', 'Thème clair'],
  ['main', 'Bibliothèque']
]

const TITRE = 'Audii'
const DESCRIPTION =
  'Audii lit les fichiers audio de votre disque, estime leur tempo sur votre machine, et enchaîne ' +
  'les titres selon leur rythme et leur style. Lecteur Windows, par Buyticle.'

const b64 = (file) => readFileSync(file).toString('base64')

/* ------------------------------------------------------------- monogramme */

// Même tracé que `src/renderer/src/components/Icons.tsx` et `gen-icons.mjs`.
const marque = (id) => `<svg width="30" height="26" viewBox="0 0 915 796" fill="none" xmlns="http://www.w3.org/2000/svg">\
<defs>\
<linearGradient id="${id}-mark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FDB44B"/><stop offset="1" stop-color="#F85C60"/></linearGradient>\
<linearGradient id="${id}-dot" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F0007A"/><stop offset="1" stop-color="#8E00AE"/></linearGradient>\
</defs>\
<g stroke="url(#${id}-mark)" stroke-width="135">\
<path d="M67.5 796V302.5a235 235 0 0 1 470 0V575a153.5 153.5 0 0 0 307 0V463.5"/>\
<path d="M262.5 531h275"/></g>\
<circle cx="844.5" cy="330" r="67.5" fill="url(#${id}-dot)"/></svg>`

const icone = (contenu) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${contenu}</svg>`

const ICONES = {
  __SPARK__: icone('<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z"/>'),
  __MIC__: icone('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  __WAVE__: icone('<path d="M3 12h2m3-5v10m4-14v18m4-13v8m4-5h2"/>'),
  __LOCK__: icone('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/>')
}

/* ------------------------------------------------------------------ corps */

let corps = readFileSync(path.join(docs, 'index.template.html'), 'utf8')

const vues = VUES.map(([nom, label]) => ({
  label,
  src: `data:image/jpeg;base64,${b64(path.join(docs, 'shots', `${nom}.jpg`))}`
}))

corps = corps
  .replace('__FONT__', b64(FONT))
  .replace('__LOGO_32__', marque('lp'))
  .replace('__IMG_now-playing__', b64(path.join(docs, 'shots', 'now-playing.jpg')))
  .replace('__VUES__', JSON.stringify(vues))

for (const [cle, valeur] of Object.entries(ICONES)) corps = corps.replaceAll(cle, valeur)

// Un jeton oublié passerait inaperçu à l'œil dans 800 Ko de base64 : on
// vérifie, en ignorant les données encodées où « __ » peut apparaître.
const reste = corps.replace(/base64,[^"')]+/g, '')
const oublies = reste.match(/__[A-Z_]+__/g)
if (oublies) throw new Error(`jetons non remplacés : ${[...new Set(oublies)].join(', ')}`)

mkdirSync(docs, { recursive: true })
writeFileSync(path.join(docs, 'index.html'), corps)

/* -------------------------------------------------------- document complet */

// Favicon en SVG intégré : pas de fichier à servir, et l'icône reste nette
// à toutes les tailles, contrairement à un .ico.
const favicon = `data:image/svg+xml,${encodeURIComponent(
  marque('fav').replace('width="30" height="26"', 'width="64" height="64"')
)}`

const document = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${TITRE} — le bon tempo, au bon moment</title>
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="theme-color" content="#0b0910" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#f4f2f7" media="(prefers-color-scheme: light)" />
    <link rel="icon" href="${favicon}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${TITRE}" />
    <meta property="og:title" content="${TITRE} — le bon tempo, au bon moment" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:image" content="/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITRE} — le bon tempo, au bon moment" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="/og.jpg" />

    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
    </style>
  </head>
  <body>
${corps}
  </body>
</html>
`

mkdirSync(web, { recursive: true })
writeFileSync(path.join(web, 'index.html'), document)

const og = path.join(docs, 'og.jpg')
if (existsSync(og)) copyFileSync(og, path.join(web, 'og.jpg'))

const ko = (n) => `${Math.round(n / 1024)} Ko`
console.log(`[audii] docs/index.html (corps, Artifact) : ${ko(corps.length)}`)
console.log(`[audii] web/index.html (document, Vercel) : ${ko(document.length)}`)
