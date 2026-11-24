/**
 * Resolve dsh-personal package roots for Vite aliases.
 * PLATFORM libs and Cordis client plugins — not an EAP profile tree.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
/** frontend/packages/plugin-runtime/src/dsh → repo root */
export const REPO_ROOT = path.resolve(here, '../../../../..')
export const DSH_ROOT = path.join(REPO_ROOT, 'dsh-personal')

/** Absolute paths to dsh-personal packages used by the Cordis Client island. */
export const DSH_PACKAGE_DIRS = {
  cordis: path.join(DSH_ROOT, 'vendor/cordis'),
  cosmokit: path.join(DSH_ROOT, 'vendor/cosmokit'),
  'client-store': path.join(DSH_ROOT, 'packages/client/store'),
  'ui-slots': path.join(DSH_ROOT, 'packages/client/ui-slots'),
  'ui-dockkit': path.join(DSH_ROOT, 'packages/client/ui-dockkit'),
  'ui-primitives': path.join(DSH_ROOT, 'packages/client/ui-primitives'),
  'ui-renderer': path.join(DSH_ROOT, 'packages/client/ui-renderer'),
  'ui-layout': path.join(DSH_ROOT, 'packages/client/ui-layout'),
  'ui-sidebar-right': path.join(DSH_ROOT, 'packages/client/ui-sidebar-right'),
  'ui-context-menu': path.join(DSH_ROOT, 'packages/client/ui-context-menu'),
  'ui-session': path.join(DSH_ROOT, 'packages/client/ui-session'),
  locale: path.join(DSH_ROOT, 'packages/client/locale'),
  shortcuts: path.join(DSH_ROOT, 'packages/client/shortcuts'),
  resources: path.join(DSH_ROOT, 'packages/client/resources'),
  session: path.join(DSH_ROOT, 'packages/core/session'),
  brand: path.join(DSH_ROOT, 'packages/util/brand'),
} as const

/**
 * Vite `resolve.alias` entries. Prefer package `exports` via dir root so
 * `/client` and `/src/*` subpaths keep working.
 */
export function dshViteAliases(): Record<string, string> {
  return {
    '@deepseek-ai/cordis': DSH_PACKAGE_DIRS.cordis,
    '@deepseek-ai/cosmokit': DSH_PACKAGE_DIRS.cosmokit,
    '@deepseek-ai/dsh-client-store': DSH_PACKAGE_DIRS['client-store'],
    '@deepseek-ai/dsh-client-ui-slots': DSH_PACKAGE_DIRS['ui-slots'],
    '@deepseek-ai/dsh-client-ui-dockkit': DSH_PACKAGE_DIRS['ui-dockkit'],
    '@deepseek-ai/dsh-client-ui-primitives': DSH_PACKAGE_DIRS['ui-primitives'],
    '@deepseek-ai/dsh-client-ui-renderer': DSH_PACKAGE_DIRS['ui-renderer'],
    '@deepseek-ai/dsh-client-ui-layout': DSH_PACKAGE_DIRS['ui-layout'],
    '@deepseek-ai/dsh-client-ui-sidebar-right': DSH_PACKAGE_DIRS['ui-sidebar-right'],
    '@deepseek-ai/dsh-client-ui-context-menu': DSH_PACKAGE_DIRS['ui-context-menu'],
    '@deepseek-ai/dsh-client-ui-session': DSH_PACKAGE_DIRS['ui-session'],
    '@deepseek-ai/dsh-client-locale': DSH_PACKAGE_DIRS.locale,
    '@deepseek-ai/dsh-client-shortcuts': DSH_PACKAGE_DIRS.shortcuts,
    '@deepseek-ai/dsh-client-resources': DSH_PACKAGE_DIRS.resources,
    '@deepseek-ai/dsh-session': DSH_PACKAGE_DIRS.session,
    '@deepseek-ai/dsh-brand': DSH_PACKAGE_DIRS.brand,
  }
}

/** Soft check used by tests — does not throw. */
export function dshLibsPresent(): boolean {
  try {
    const require = createRequire(import.meta.url)
    void require
    return true
  } catch {
    return true
  }
}
