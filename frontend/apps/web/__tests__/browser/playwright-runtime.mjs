import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)

// Use the explicitly selected driver, or the installation managed by `vp i -g`.
// Never borrow a dependency from another application's private node_modules.
export function loadPlaywright(selected = process.env.EAP_PLAYWRIGHT_MODULE) {
  if (selected) return require(selected)
  const root = join(
    process.env.VP_HOME || join(homedir(), '.vite-plus'),
    'packages',
    '@playwright',
    'test',
  )
  const candidates = existsSync(root)
    ? readdirSync(root)
        .map((entry) => join(root, entry, 'node_modules', '@playwright', 'test'))
        .filter((entry) => existsSync(join(entry, 'package.json')))
    : []
  if (candidates.length !== 1)
    throw new Error(
      'Select EAP_PLAYWRIGHT_MODULE explicitly, or install one Playwright with vp i -g @playwright/test',
    )
  return require(candidates[0])
}
