/**
 * Génère l'icône de l'application (build/icon.ico + build/icon.png).
 *
 * Le dessin est rasterisé ici (aucune dépendance native), mais l'encodage
 * ICO est délégué à png2icons : un .ico même légèrement mal formé corrompt
 * la section de ressources de l'exécutable Windows, qui perd alors son
 * icône et refuse de démarrer. Ce format ne se bricole pas à la main.
 *
 * Le tracé est celui du monogramme « Au » de la marque, relevé sur le
 * fichier source fourni. Il est repris à l'identique dans `Icons.tsx` et
 * dans le splash : mêmes coordonnées, mêmes dégradés.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import png2icons from 'png2icons'

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const outDir = path.join(root, 'build')

/* ------------------------------------------------------------------ CRC32 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/* ------------------------------------------------------- Géométrie du logo

   Repère du monogramme : 915 × 796, épaisseur de trait constante 135.
   Le « A » est une arche (demi-anneau + deux jambages), sa barre
   transversale rejoint le « u » dont la panse est un second demi-anneau ;
   le point du « i » ferme le mot. Toutes les valeurs ci-dessous sont
   mesurées sur le logo d'origine, pas approximées.
   ------------------------------------------------------------------------ */

const MARK_W = 915
const MARK_H = 796
const STROKE = 135
const HALF = STROKE / 2 // 67.5

// Arche du « A » : rayon d'axe 235, centre à mi-hauteur des jambages.
const ARCH = { cx: 302.5, cy: 302.5, r: 235 }
// Panse du « u » : rayon d'axe 153.5.
const BOWL = { cx: 691, cy: 575, r: 153.5 }
// Barre transversale du « A », de son extrémité gauche au jambage droit.
const BAR = { x0: 195, x1: 605, y0: 463.5, y1: 598.5 }
// Point du « i », aligné sur l'axe du jambage droit du « u ».
const DOT = { cx: 844.5, cy: 330, r: HALF }

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t

/** Distance signée à un rectangle aligné sur les axes. */
function boxDistance(px, py, x0, y0, x1, y1) {
  const dx = Math.max(x0 - px, px - x1)
  const dy = Math.max(y0 - py, py - y1)
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
}

/**
 * Distance signée à un demi-anneau : l'arc n'existe que d'un côté de son
 * centre, l'autre moitié étant prise en charge par les jambages droits.
 *
 * Au-delà du demi-plan on mesure la distance à l'extrémité de l'arc plutôt
 * que de renvoyer l'infini : sans ce débord arrondi, l'arc et le jambage se
 * touchent sans se recouvrir et l'anticrénelage laisse une couture claire.
 */
function arcDistance(px, py, arc, upper) {
  if (upper ? py <= arc.cy : py >= arc.cy) {
    return Math.abs(Math.hypot(px - arc.cx, py - arc.cy) - arc.r) - HALF
  }
  const endX = px < arc.cx ? arc.cx - arc.r : arc.cx + arc.r
  return Math.hypot(px - endX, py - arc.cy) - HALF
}

/** Distance signée au monogramme (hors point du « i »). */
function markDistance(px, py) {
  return Math.min(
    // Jambage gauche du « A », descendant jusqu'au pied.
    boxDistance(px, py, 0, ARCH.cy, STROKE, MARK_H),
    arcDistance(px, py, ARCH, true),
    // Jambage droit du « A », qui devient le flanc gauche du « u ».
    boxDistance(px, py, ARCH.cx + ARCH.r - HALF, ARCH.cy, ARCH.cx + ARCH.r + HALF, BOWL.cy),
    arcDistance(px, py, BOWL, false),
    // Flanc droit du « u », coupé net en haut.
    boxDistance(px, py, DOT.cx - HALF, BAR.y0, DOT.cx + HALF, BOWL.cy),
    boxDistance(px, py, BAR.x0, BAR.y0, BAR.x1, BAR.y1)
  )
}

/** Distance signée au point du « i ». */
function dotDistance(px, py) {
  return Math.hypot(px - DOT.cx, py - DOT.cy) - DOT.r
}

/* -------------------------------------------------------------- Rendering */

// Dégradés relevés sur le logo source : orange -> corail pour la lettre,
// magenta -> violet pour le point.
const MARK_FROM = [253, 180, 75]
const MARK_TO = [248, 92, 96]
const DOT_FROM = [240, 0, 122]
const DOT_TO = [142, 0, 174]

/**
 * Rend l'icône en RGBA (Uint8Array) pour une taille donnée.
 *
 * Le monogramme occupe 80 % de la largeur : assez grand pour rester lisible
 * à 16 px, assez marginé pour que Windows n'ait pas à rogner les bords.
 */
function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4)

  const scale = (size * 0.8) / MARK_W
  const offsetX = (size - MARK_W * scale) / 2
  const offsetY = (size - MARK_H * scale) / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Repasse en coordonnées du monogramme pour évaluer les distances.
      const mx = (x + 0.5 - offsetX) / scale
      const my = (y + 0.5 - offsetY) / scale

      const dMark = markDistance(mx, my)
      const dDot = dotDistance(mx, my)
      const nearest = Math.min(dMark, dDot)
      // La distance est mesurée dans le repère du logo : on la ramène en
      // pixels pour que l'anticrénelage fasse exactement un pixel de large.
      const alpha = clamp01(0.5 - nearest * scale)
      if (alpha <= 0) continue

      const isDot = dDot < dMark
      const from = isDot ? DOT_FROM : MARK_FROM
      const to = isDot ? DOT_TO : MARK_TO
      // Dégradé diagonal, calculé sur l'emprise de la forme concernée.
      const t = isDot
        ? clamp01((mx - (DOT.cx - DOT.r)) / (DOT.r * 4) + (my - (DOT.cy - DOT.r)) / (DOT.r * 4))
        : clamp01((mx / MARK_W) * 0.45 + (my / MARK_H) * 0.55)

      const offset = (y * size + x) * 4
      pixels[offset] = Math.round(mix(from[0], to[0], t))
      pixels[offset + 1] = Math.round(mix(from[1], to[1], t))
      pixels[offset + 2] = Math.round(mix(from[2], to[2], t))
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }
  return pixels
}

/* ------------------------------------------------------------ PNG encoder */

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filtre "None"
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* -------------------------------------------------------------------- Run */

mkdirSync(outDir, { recursive: true })

// Source unique : un PNG carré haute résolution, redimensionné par png2icons
// vers toutes les tailles attendues par Windows.
const master = encodePng(renderIcon(1024), 1024)

const ico = png2icons.createICO(master, png2icons.BICUBIC, 0, false, true)
if (!ico) throw new Error("png2icons n'a pas pu produire le .ico")

writeFileSync(path.join(outDir, 'icon.ico'), ico)
writeFileSync(path.join(outDir, 'icon.png'), encodePng(renderIcon(512), 512))
writeFileSync(path.join(outDir, 'icon-256.png'), encodePng(renderIcon(256), 256))

console.log(`[audii] icônes générées dans ${path.relative(root, outDir)} (.ico : ${ico.length} octets)`)
