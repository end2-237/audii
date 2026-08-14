/**
 * Mode développement : serveur Vite (HMR) + rebuild du process principal +
 * lancement d'Electron branché sur le serveur.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import electron from 'electron'

const server = await createServer({ configFile: 'vite.config.ts' })
await server.listen()
const address = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '')
if (!address) throw new Error('Serveur Vite injoignable')
server.printUrls()

// Première compilation du process principal, puis surveillance en arrière-plan
// (un changement dans src/main nécessite de relancer `npm run dev`).
await new Promise((resolve, reject) => {
  const build = spawn(process.execPath, ['scripts/build-main.mjs'], { stdio: 'inherit' })
  build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build:main a échoué (${code})`))))
})
const watcher = spawn(process.execPath, ['scripts/build-main.mjs', '--watch'], { stdio: 'inherit' })

const child = spawn(String(electron), ['.'], {
  stdio: 'inherit',
  env: { ...process.env, AUDII_DEV_SERVER: address }
})

const stop = async () => {
  watcher.kill()
  child.kill()
  await server.close()
  process.exit(0)
}

child.on('close', stop)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
