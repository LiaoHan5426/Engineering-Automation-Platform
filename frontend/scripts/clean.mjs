import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const targets = [
  'node_modules',
  'apps/web/node_modules',
  'packages/ui/node_modules',
  'internal/stylelint-config/node_modules',
  'apps/web/dist',
  'packages/ui/dist',
  '.vite',
  '.vite-plus',
  '.cache',
]

for (const target of targets) {
  const path = resolve(frontendRoot, target)
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
    console.log(`removed ${target}`)
  }
}
