/**
 * Génère l'icône de l'application (build/icon.ico + build/icon.png) sans
 * dépendance native : rasterisation maison puis encodage PNG/ICO.
 *
 * Le logo reprend celui de l'interface : carré arrondi dégradé magenta ->
 * violet, note de musique blanche.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/* -------------------------------------------------------------- Rendering */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t

/** Couverture douce d'un bord : 1 à l'intérieur, 0 à l'extérieur. */
const cover = (distance) => clamp01(0.5 - distance)

function roundedRectDistance(x, y, size, radius) {
  // Distance signée à un rectangle arrondi centré.
  const half = size / 2
  const dx = Math.abs(x - half) - (half - radius)
  const dy = Math.abs(y - half) - (half - radius)
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ox, oy) - radius
}

/** Distance signée à un triangle convexe (négative à l'intérieur). */
function triangleDistance(x, y, points) {
  let inside = -Infinity
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[(i + 1) % 3]
    const ex = bx - ax
    const ey = by - ay
    // Normale sortante : les sommets sont donnés dans le sens horaire.
    const len = Math.hypot(ex, ey) || 1
    const nx = ey / len
    const ny = -ex / len
    inside = Math.max(inside, (x - ax) * nx + (y - ay) * ny)
  }
  return inside
}

/** Rétrécit un triangle vers son centre, pour arrondir ses angles ensuite. */
function shrink(points, amount) {
  const cx = (points[0][0] + points[1][0] + points[2][0]) / 3
  const cy = (points[0][1] + points[1][1] + points[2][1]) / 3
  return points.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const len = Math.hypot(dx, dy) || 1
    return [x - (dx / len) * amount * 1.9, y - (dy / len) * amount * 1.9]
  })
}

/**
 * Rend l'icône en RGBA (Uint8Array) pour une taille donnée.
 *
 * Le monogramme : un « A » massif dont le contrepoinçon est un triangle de
 * lecture. Deux signes de l'audio en une seule forme, lisible de 16 à 512 px.
 */
function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 4)
  const u = size / 100 // unité relative

  const radius = 23 * u
  const round = 4 * u

  // « A » : triangle extérieur, sommets dans le sens horaire.
  const outer = shrink(
    [
      [50 * u, 15 * u],
      [85 * u, 85 * u],
      [15 * u, 85 * u]
    ],
    round
  )
  // Contrepoinçon : le vide intérieur de la lettre.
  const counter = shrink(
    [
      [50 * u, 41 * u],
      [69 * u, 79 * u],
      [31 * u, 79 * u]
    ],
    round * 0.8
  )
  // Barre transversale du « A », prolongée à droite comme une onde qui sort
  // de la lettre : c'est ce détail qui rend le monogramme reconnaissable.
  const barTop = 62 * u
  const barBottom = 71 * u
  const barLeft = 31 * u
  const barRight = 84 * u

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5

      const shapeAlpha = cover(roundedRectDistance(px, py, size, radius))
      if (shapeAlpha <= 0) continue

      // Dégradé diagonal magenta -> violet.
      const t = clamp01((px / size) * 0.45 + (py / size) * 0.55)
      let r = mix(255, 138, t)
      let g = mix(45, 42, t)
      let b = mix(138, 246, t)

      // Lueur haute pour donner du volume.
      const glow = clamp01(1 - Math.hypot(px - size * 0.3, py - size * 0.18) / (size * 0.75))
      r = mix(r, 255, glow * 0.28)
      g = mix(g, 160, glow * 0.16)
      b = mix(b, 255, glow * 0.2)

      const letter = triangleDistance(px, py, outer) - round
      const hole = triangleDistance(px, py, counter) - round * 0.8
      // Anneau triangulaire : la lettre moins son contrepoinçon.
      const ring = Math.min(cover(letter), 1 - cover(hole))

      // Barre transversale, prolongée à droite comme une onde qui sort de la
      // lettre : c'est ce détail qui rend le monogramme reconnaissable.
      const barDx = Math.max(barLeft - px, px - barRight)
      const barDy = Math.max(barTop - py, py - barBottom)
      const bar = cover(Math.max(barDx, barDy) - round * 0.4)

      const mark = clamp01(Math.max(ring, bar))

      if (mark > 0) {
        r = mix(r, 255, mark)
        g = mix(g, 255, mark)
        b = mix(b, 255, mark)
      }

      const offset = (y * size + x) * 4
      pixels[offset] = Math.round(r)
      pixels[offset + 1] = Math.round(g)
      pixels[offset + 2] = Math.round(b)
      pixels[offset + 3] = Math.round(shapeAlpha * 255)
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

/* ------------------------------------------------------------ ICO encoder */

/** Entrée ICO au format DIB 32 bits (attendu par Windows pour les p'tites tailles). */
function encodeDib(pixels, size) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // XOR + AND
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(size * size * 4, 20)

  const xor = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4 // bottom-up
    for (let x = 0; x < size; x++) {
      const s = src + x * 4
      const d = (y * size + x) * 4
      xor[d] = pixels[s + 2]
      xor[d + 1] = pixels[s + 1]
      xor[d + 2] = pixels[s]
      xor[d + 3] = pixels[s + 3]
    }
  }
  const maskRow = Math.ceil(size / 32) * 4
  const and = Buffer.alloc(maskRow * size) // masque vide : l'alpha suffit
  return Buffer.concat([header, xor, and])
}

function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = []
  const blobs = []
  let offset = 6 + images.length * 16

  for (const { size, data } of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size
    entry[1] = size >= 256 ? 0 : size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    blobs.push(data)
    offset += data.length
  }
  return Buffer.concat([header, ...entries, ...blobs])
}

/* -------------------------------------------------------------------- Run */

mkdirSync(outDir, { recursive: true })

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const images = icoSizes.map((size) => {
  const pixels = renderIcon(size)
  // Windows attend du DIB en dessous de 64 px, du PNG au-dessus.
  const data = size >= 64 ? encodePng(pixels, size) : encodeDib(pixels, size)
  return { size, data }
})

writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(images))
writeFileSync(path.join(outDir, 'icon.png'), encodePng(renderIcon(512), 512))
writeFileSync(path.join(outDir, 'icon-256.png'), encodePng(renderIcon(256), 256))

console.log(`[audii] icônes générées dans ${path.relative(root, outDir)}`)
