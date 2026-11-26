import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CLIENT_MODULES_ID } from './boot-injections.ts'
import { mergeEnablement } from './compose-enablement.ts'
import type { UiClientContribution, WebBootEntry, WebBootGraph } from './types.ts'

interface Manifest {
  name: string
  version: string
  exports?: Record<string, string | { default?: string }>
  dsh?: {
    bundle?: { patch: string | string[] }
    client?: Pick<WebBootEntry, 'inject' | 'external' | 'immediately'> & { platform: string }
  }
}

interface AppBoot {
  bundlePatchPaths(directory: string, bundle: { patch: string | string[] }): string[]
  loadOverlayPatches(label: string, path: string): unknown[]
  composeEntries(layers: unknown[][]): { name?: string; disabled?: boolean }[]
}

interface CoreEntry {
  row: WebBootEntry
  source: Buffer
}

const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest

const revision = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex').slice(0, 24)

/** Compose the built upstream clients without starting an upstream Host or loading a profile. */
export async function composeArtifactBoot(root: string, clients: readonly UiClientContribution[]) {
  const packageRoot = join(root, 'packages')
  const layers = ['base', 'web-app'].map((name) => join(packageRoot, 'bundle', name))
  const webManifest = join(layers[1]!, 'package.json')
  const require = createRequire(webManifest)
  const appBoot = (await import(
    pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href
  )) as AppBoot

  const packages = new Map<string, { directory: string; manifest: Manifest }>()
  for (const group of readdirSync(packageRoot, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    const groupDir = join(packageRoot, group.name)
    for (const pkg of readdirSync(groupDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue
      const directory = join(groupDir, pkg.name)
      if (!readdirSync(directory).includes('package.json')) continue
      const manifest = readManifest(join(directory, 'package.json'))
      packages.set(manifest.name, { directory, manifest })
    }
  }
  const bundleLayers = layers.map((layer) => {
    const bundle = readManifest(join(layer, 'package.json')).dsh?.bundle
    if (!bundle) throw new Error(`Missing bundle declaration: ${layer}`)
    return appBoot
      .bundlePatchPaths(layer, bundle)
      .flatMap((patch) => appBoot.loadOverlayPatches('EAP Web', patch))
  })
  const overlay = fileURLToPath(new URL('../overlay/cordis.patch.yml', import.meta.url))
  const composed = appBoot.composeEntries([
    ...bundleLayers,
    appBoot.loadOverlayPatches('EAP Web', overlay),
  ])
  const artifacts = new Map<string, CoreEntry>()
  for (const entry of composed) {
    if (!entry.name || entry.disabled) continue
    const pkg = packages.get(entry.name)
    const declaration = pkg?.manifest.dsh?.client
    if (!pkg || declaration?.platform !== 'web') continue
    const exported = pkg.manifest.exports?.['./client']
    const relative = typeof exported === 'string' ? exported : exported?.default
    if (!relative?.startsWith('./')) throw new Error(`Missing client export: ${entry.name}`)
    const source = readFileSync(join(pkg.directory, relative))
    const rev = revision(source)
    const { platform: _platform, ...metadata } = declaration
    artifacts.set(entry.name, {
      source,
      row: {
        id: entry.name,
        rev,
        url: `/eap-dsh/client/${rev}.js`,
        ...metadata,
      },
    })
  }
  if (!artifacts.has(CLIENT_MODULES_ID)) throw new Error('Missing DSH client module bootstrap')
  const entries = [...artifacts.values()].map(({ row }) => row)
  const graph: WebBootGraph = {
    rev: revision(JSON.stringify(entries)),
    release: { version: readManifest(webManifest).version },
    entries,
    batches: entries.map(({ id, url, rev }) => ({
      phase: id === CLIENT_MODULES_ID ? 'bootstrap' : 'application',
      url,
      rev,
      entries: [id],
    })),
  }
  return { graph: mergeEnablement(graph, clients), artifacts }
}
