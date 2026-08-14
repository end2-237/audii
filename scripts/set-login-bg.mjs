/**
 * Remplace le visuel d'ambiance de l'écran de connexion.
 *
 *   npm run login-bg -- <url ou chemin d'un JPEG>
 *
 * L'image livrée est un montage maison, libre de droits. Pour lui substituer
 * une photo (Unsplash, Pexels, une prise de vue à soi), il suffit de passer
 * son adresse ou son chemin : le fichier est écrit à l'emplacement attendu
 * par la feuille de style, aucun code n'est à toucher.
 *
 * Rappel de licence : une photo « Unsplash+ » ou tout autre visuel sous
 * abonnement demande la licence correspondante avant d'être distribuée dans
 * une application vendue.
 */
import { copyFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const target = path.join(root, 'src/renderer/src/assets/login-bg.jpg')

const source = process.argv[2]
if (!source) {
  console.error('usage : npm run login-bg -- <url ou chemin d’un JPEG>')
  process.exit(1)
}

if (/^https?:\/\//i.test(source)) {
  const response = await fetch(source)
  if (!response.ok) throw new Error(`téléchargement impossible : HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) throw new Error(`ce n'est pas une image (${type || 'type inconnu'})`)
  writeFileSync(target, Buffer.from(await response.arrayBuffer()))
} else {
  copyFileSync(path.resolve(source), target)
}

console.log(`[audii] visuel de connexion remplacé : ${path.relative(root, target)}`)
