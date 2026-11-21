// Offline first-load baseline guard (see docs/decisions/frontend-first-load-baseline.md).
// Reads a built dist/index.html + dist/assets and asserts that editor/designer chunks
// (monaco, GrapesJS) are lazy-loaded and never part of the first load. It never raises
// a chunk-size warning threshold and never modifies the build. Run after:
//   vp -C frontend/apps/web build
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distDir = resolve(process.env.EAP_FIRSTLOAD_DIST || resolve(frontendRoot, 'apps/web/dist'))
const indexHtml = resolve(distDir, 'index.html')
const assetsDir = resolve(distDir, 'assets')

if (!existsSync(indexHtml) || !existsSync(assetsDir)) {
  console.error('first-load: dist not found. Run "vp -C frontend/apps/web build" first.')
  process.exit(2)
}

const html = readFileSync(indexHtml, 'utf8')

// Files the browser loads on first paint: the entry <script type=module> and every
// <link rel=modulepreload>. Stylesheets are not JS and are intentionally excluded.
const firstLoad = new Set()
for (const m of html.matchAll(/<script[^>]*\bsrc="\/assets\/([^"]+\.js)"/g)) firstLoad.add(m[1])
for (const m of html.matchAll(
  /<link[^>]*\brel="modulepreload"[^>]*\bhref="\/assets\/([^"]+\.js)"/g,
))
  firstLoad.add(m[1])

const sizes = new Map()
for (const name of readdirSync(assetsDir)) {
  if (!name.endsWith('.js')) continue
  sizes.set(name, statSync(resolve(assetsDir, name)).size)
}

// Editor/designer runtime chunks. These are large by nature and must be lazy.
// worker/api/vs/css/html/json belong to monaco; grapes belongs to GrapesJS.
const editorPattern = /(?:ts|css|html|json)\.worker-|editor\.api-|^vs-|^grapes-/i
const isEditorChunk = (name) => editorPattern.test(name)

const firstLoadList = [...firstLoad].filter((n) => sizes.has(n))
const firstLoadBytes = firstLoadList.reduce((sum, n) => sum + sizes.get(n), 0)
const editorChunks = [...sizes.keys()]
  .filter(isEditorChunk)
  .map((name) => ({ name, bytes: sizes.get(name) }))
const editorInFirstLoad = firstLoadList.filter(isEditorChunk)

const FIRST_LOAD_LIMIT = 2 * 1024 * 1024 // 2 MB; observed baseline ~1.72 MB
const failures = []
if (editorInFirstLoad.length) {
  failures.push(`editor/designer chunks leaked into first load: ${editorInFirstLoad.join(', ')}`)
}
if (editorChunks.length < 5) {
  failures.push(
    `expected editor/designer lazy chunks to exist in dist/assets, found ${editorChunks.length}`,
  )
}
if (!firstLoadList.length) {
  failures.push('no first-load JS detected in index.html (parse failure?)')
}
if (firstLoadBytes >= FIRST_LOAD_LIMIT) {
  failures.push(`first-load JS ${firstLoadBytes} B exceeds limit ${FIRST_LOAD_LIMIT} B`)
}
for (const name of firstLoadList) {
  if (!sizes.has(name)) failures.push(`first-load asset missing in dist/assets: ${name}`)
}

// No wall-clock timestamp: the entry filename carries a content hash, so this
// snapshot stays byte-stable across reruns against the same build and keeps the
// committed evidence file clean. It is a reproducible measurement, not a log.
const evidence = {
  dist: 'frontend/apps/web/dist',
  entry: firstLoadList.find((n) => /^index-/.test(n)) ?? null,
  firstLoadBytes,
  firstLoadLimit: FIRST_LOAD_LIMIT,
  firstLoad: firstLoadList.map((name) => ({ name, bytes: sizes.get(name) })),
  editorLazyChunks: editorChunks.sort((a, b) => b.bytes - a.bytes),
  editorInFirstLoad,
  ok: failures.length === 0,
  failures,
}

const outPath = resolve(
  process.env.EAP_FIRSTLOAD_OUT ||
    resolve(frontendRoot, '../docs/evidence/frontend-batch/first-load-baseline.json'),
)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(evidence, null, 2) + '\n')

console.log(`first-load: ${firstLoadList.length} files, ${(firstLoadBytes / 1024).toFixed(0)} KiB`)
console.log(
  `first-load: editor/designer lazy chunks present = ${editorChunks.length}, leaked into first load = ${editorInFirstLoad.length}`,
)
console.log(`first-load: evidence -> ${outPath}`)
if (failures.length) {
  for (const f of failures) console.error(`first-load FAIL: ${f}`)
  process.exit(1)
}
console.log('first-load: OK')
