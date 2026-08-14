import { build, context } from 'esbuild'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const watch = process.argv.includes('--watch')

await rm(path.join(root, 'dist/main'), { recursive: true, force: true })
await rm(path.join(root, 'dist/preload'), { recursive: true, force: true })

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  // Electron est fourni par le runtime ; tout le reste est bundlé pour que le
  // paquet final n'embarque aucun node_modules.
  external: ['electron'],
  logLevel: 'info'
}

const targets = [
  { entryPoints: [path.join(root, 'src/main/index.ts')], outfile: path.join(root, 'dist/main/index.js') },
  { entryPoints: [path.join(root, 'src/preload/index.ts')], outfile: path.join(root, 'dist/preload/index.js') }
]

if (watch) {
  for (const target of targets) {
    const ctx = await context({ ...common, ...target })
    await ctx.watch()
  }
  console.log('[audii] main + preload : surveillance active')
} else {
  for (const target of targets) {
    await build({ ...common, ...target })
  }
  console.log('[audii] main + preload bundled')
}
