import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolve the vendored dsh-personal tree (DSH_PERSONAL_ROOT or repo sibling). */
export function resolveDshPersonalRoot(fromModuleUrl = import.meta.url): string {
  const fromEnv = process.env.DSH_PERSONAL_ROOT
  if (fromEnv !== undefined && fromEnv !== '') return resolve(fromEnv)
  const packageRoot = resolve(dirname(fileURLToPath(fromModuleUrl)), '..')
  return resolve(packageRoot, '../../../dsh-personal')
}