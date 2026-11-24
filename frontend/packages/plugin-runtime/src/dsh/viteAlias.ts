/**
 * Shared Vite alias table for apps/web and frontend root vitest.
 * Import from vite.config only (Node); not from browser island code.
 *
 * Points at dsh-personal package roots. Boot imports PLATFORM libs + Cordis
 * plugin sources via `/src/...` (prebuilt `lib/client.js` is DSH ModuleLoader
 * format, not Vite ESM). Do not enable `@vitejs/plugin-vue-jsx` on these `.tsx`
 * seats — it strips `defineComponent((p)=>()=>h(...))` render returns.
 *
 * Each package gets an exact alias plus a trailing-slash prefix alias so
 * `/src/*` file paths resolve on disk.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../..')
const dsh = path.join(repoRoot, 'dsh-personal')

function pkg(...parts: string[]) {
  return path.join(dsh, ...parts)
}

const DSH_PACKAGES: Record<string, string> = {
  '@deepseek-ai/cordis': pkg('vendor/cordis'),
  '@deepseek-ai/cosmokit': pkg('vendor/cosmokit'),
  '@deepseek-ai/schemastery': pkg('vendor/schemastery'),
  '@deepseek-ai/dsh-client-store': pkg('packages/client/store'),
  '@deepseek-ai/dsh-client-ui-slots': pkg('packages/client/ui-slots'),
  '@deepseek-ai/dsh-client-ui-dockkit': pkg('packages/client/ui-dockkit'),
  '@deepseek-ai/dsh-client-ui-primitives': pkg('packages/client/ui-primitives'),
  '@deepseek-ai/dsh-client-ui-renderer': pkg('packages/client/ui-renderer'),
  '@deepseek-ai/dsh-client-ui-layout': pkg('packages/client/ui-layout'),
  '@deepseek-ai/dsh-client-ui-sidebar-right': pkg('packages/client/ui-sidebar-right'),
  '@deepseek-ai/dsh-client-ui-context-menu': pkg('packages/client/ui-context-menu'),
  '@deepseek-ai/dsh-client-ui-session': pkg('packages/client/ui-session'),
  '@deepseek-ai/dsh-client-locale': pkg('packages/client/locale'),
  '@deepseek-ai/dsh-client-shortcuts': pkg('packages/client/shortcuts'),
  '@deepseek-ai/dsh-client-resources': pkg('packages/client/resources'),
  '@deepseek-ai/dsh-session': pkg('packages/core/session'),
  '@deepseek-ai/dsh-brand': pkg('packages/util/brand'),
  '@deepseek-ai/dsh-api-session-controller': pkg('packages/api/session-controller'),
  '@deepseek-ai/dsh-api-remote-access': pkg('packages/api/remote-access'),
  '@deepseek-ai/dsh-util-values': pkg('packages/util/values'),
  '@deepseek-ai/dsh-package-manifest': pkg('packages/util/package-manifest'),
  '@deepseek-ai/dsh-attachment': pkg('packages/attachment/attachment'),
  '@deepseek-ai/dsh-error': pkg('packages/util/error'),
  '@deepseek-ai/dsh-util-crypto': pkg('packages/util/crypto'),
}

export const dshViteAliasList: Array<{ find: string; replacement: string }> = Object.entries(
  DSH_PACKAGES,
).flatMap(([name, dir]) => [
  { find: name, replacement: dir },
  { find: `${name}/`, replacement: `${dir}/` },
])
