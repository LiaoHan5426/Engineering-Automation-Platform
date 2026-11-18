/** Read Vite's pack options without invoking legacy bundler config discovery. */
import { dirname, resolve } from 'node:path'
import { loadConfigFromFile } from 'vite-plus'
import type { UserConfig } from 'vite-plus/pack'

/**
 * Evaluate a Vite configuration using Node's native TypeScript support.
 * @param configFile - Vite configuration file to load.
 * @returns Its explicitly declared pack configurations.
 * @throws If the file has no pack configuration.
 */
export async function loadPackConfig(configFile: string): Promise<UserConfig[]> {
  const file = resolve(configFile)
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, file, dirname(file), 'silent', undefined, 'native')
  const pack = (loaded?.config as { pack?: UserConfig | UserConfig[] } | undefined)?.pack
  if (pack === undefined) throw new Error(`${configFile}: Vite config has no pack configuration`)
  return Array.isArray(pack) ? pack : [pack]
}

/**
 * Select enabled package builds after inheriting workspace defaults.
 * Empty-string entries disable a face; passing them to Pack would discover src/index.ts.
 * @param defaults - Workspace defaults for the current compiler face.
 * @param configs - Package-owned configurations, or one empty object for a package without a config.
 * @returns Configurations whose entry does not disable the current face.
 */
export function selectPackConfigs(defaults: UserConfig, configs: readonly UserConfig[]): UserConfig[] {
  return configs.map(config => inheritPackDefaults(defaults, config)).filter(config => config.entry !== '')
}

/**
 * Apply flat workspace defaults, retaining package options and appending default plugins.
 * @param defaults - Root entry, output, and plugin defaults (no nested options).
 * @param config - Package-owned pack options.
 * @returns Options with missing values filled and default plugins appended.
 */
export function inheritPackDefaults(defaults: UserConfig, config: UserConfig): UserConfig {
  const merged: Record<string, unknown> = { ...config }
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = merged[key]
    if (value == null) merged[key] = fallback
    else if (key === 'plugins' && Array.isArray(value) && Array.isArray(fallback)) merged[key] = [...value, ...fallback]
  }
  return merged as UserConfig
}
