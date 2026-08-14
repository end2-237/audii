/**
 * Génère une petite bibliothèque WAV de test (avec métadonnées LIST/INFO) pour
 * vérifier le scan, la lecture et l'estimation de BPM sans dépendre des
 * fichiers personnels de l'utilisateur.
 *
 *   node scripts/make-fixtures.mjs [dossier]   (défaut : ~/Music)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const RATE = 44100

function infoChunk(fields) {
  const parts = [Buffer.from('INFO', 'ascii')]
  for (const [id, value] of Object.entries(fields)) {
    const text = Buffer.from(`${value}\0`, 'ascii')
    const padded = text.length % 2 === 0 ? text : Buffer.concat([text, Buffer.alloc(1)])
    const header = Buffer.alloc(8)
    header.write(id, 0, 'ascii')
    header.writeUInt32LE(text.length, 4)
    parts.push(header, padded)
  }
  const body = Buffer.concat(parts)
  const header = Buffer.alloc(8)
  header.write('LIST', 0, 'ascii')
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

/** Piste rythmique : kick + hi-hat au tempo demandé, avec une basse tenue. */
function renderSamples(bpm, seconds, key) {
  const total = Math.floor(RATE * seconds)
  const samples = new Int16Array(total)
  const beat = (60 / bpm) * RATE

  for (let i = 0; i < total; i++) {
    const t = i / RATE
    const phase = (i % beat) / RATE

    // Kick : sinus descendant avec enveloppe très courte.
    const kickEnv = Math.exp(-phase * 26)
    const kick = Math.sin(2 * Math.PI * (110 - 70 * Math.min(1, phase * 12)) * phase) * kickEnv * 0.75

    // Hi-hat sur les contretemps.
    const offEnv = Math.exp(-Math.abs(phase - (30 / bpm)) * 90)
    const hat = (Math.random() * 2 - 1) * offEnv * 0.2

    // Basse et nappe constantes : la seule périodicité du signal est le beat,
    // ce qui rend le BPM attendu non ambigu pour le test.
    const bass = Math.sin(2 * Math.PI * key * t) * 0.16
    const pad = Math.sin(2 * Math.PI * key * 2 * t) * 0.06

    const value = Math.max(-1, Math.min(1, kick + hat + bass + pad))
    samples[i] = Math.round(value * 32000)
  }
  return Buffer.from(samples.buffer)
}

function wav(bpm, seconds, key, info) {
  const data = renderSamples(bpm, seconds, key)

  const fmt = Buffer.alloc(24)
  fmt.write('fmt ', 0, 'ascii')
  fmt.writeUInt32LE(16, 4)
  fmt.writeUInt16LE(1, 8) // PCM
  fmt.writeUInt16LE(1, 10) // mono
  fmt.writeUInt32LE(RATE, 12)
  fmt.writeUInt32LE(RATE * 2, 16)
  fmt.writeUInt16LE(2, 20)
  fmt.writeUInt16LE(16, 22)

  const list = infoChunk(info)

  const dataHeader = Buffer.alloc(8)
  dataHeader.write('data', 0, 'ascii')
  dataHeader.writeUInt32LE(data.length, 4)

  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, dataHeader, data])
  const riff = Buffer.alloc(8)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(body.length, 4)
  return Buffer.concat([riff, body])
}

const target = process.argv[2] ?? path.join(homedir(), 'Music')

const albums = [
  {
    album: 'Chill Vibes',
    artist: 'Audii Lab',
    tracks: [
      { title: 'Slow Motion', bpm: 72, key: 55 },
      { title: 'Night Drive', bpm: 92, key: 65 },
      { title: 'Golden Hour', bpm: 104, key: 73 }
    ]
  },
  {
    album: 'Workout Energy',
    artist: 'Buyticle Sound',
    tracks: [
      { title: 'Push Harder', bpm: 128, key: 82 },
      { title: 'Sprint', bpm: 150, key: 98 },
      { title: 'Cooldown', bpm: 88, key: 62 }
    ]
  },
  {
    album: 'Focus Mode',
    artist: 'Audii Lab',
    tracks: [
      { title: 'Deep Work', bpm: 110, key: 58 },
      { title: 'Flow State', bpm: 118, key: 69 }
    ]
  }
]

for (const entry of albums) {
  const dir = path.join(target, entry.album)
  mkdirSync(dir, { recursive: true })
  entry.tracks.forEach((track, index) => {
    const file = path.join(dir, `${String(index + 1).padStart(2, '0')} - ${track.title}.wav`)
    writeFileSync(
      file,
      wav(track.bpm, 24, track.key, {
        INAM: track.title,
        IART: entry.artist,
        IPRD: entry.album,
        IGNR: 'Electronic',
        ICRD: '2024'
      })
    )
    console.log(`${file}  (${track.bpm} BPM attendu)`)
  })
}
