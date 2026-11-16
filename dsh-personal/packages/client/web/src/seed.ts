/** Initial module manifests; owned Client libraries are compiled before shell assembly. */
import * as Vue from 'vue'
import * as VueVirtual from '@tanstack/vue-virtual'
import * as Cordis from '@deepseek-ai/cordis'
import * as Zod from 'zod'
import * as ClientStore from '@deepseek-ai/dsh-client-store'
import * as UiSlots from '@deepseek-ai/dsh-client-ui-slots'
import * as UiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as UiDockkit from '@deepseek-ai/dsh-client-ui-dockkit'
import type { DshClientModuleManifest } from '@deepseek-ai/dsh-package-manifest'
import { STATIC_MODULE_MANIFEST_EXPORT, type PlatformModule } from './platform.ts'

/** Read the manifest a `staticLinked` library exports beside its ordinary exports. */
function compiledModule(id: string, namespace: object): DshClientModuleManifest {
  const manifest: unknown = Reflect.get(namespace, STATIC_MODULE_MANIFEST_EXPORT)
  if (typeof manifest !== 'object' || manifest === null
    || !('id' in manifest) || manifest.id !== id
    || !('factory' in manifest) || typeof manifest.factory !== 'function'
    || ('meta' in manifest && manifest.meta !== undefined && typeof manifest.meta !== 'function')) {
    throw new Error(`web boot: ${id} must be built with staticLinked before shell assembly`)
  }
  return manifest as DshClientModuleManifest
}

function platform(id: string, exports: Record<string, unknown>): DshClientModuleManifest {
  return { id, factory: () => exports }
}

/**
 * Supply shared third-party identities and package-generated manifests through one protocol.
 * @returns Initial module registrations; JavaScript and metadata factories are not evaluated here.
 */
export function getStaticModules(): readonly DshClientModuleManifest[] {
  return Object.values({
    'vue': platform('vue', Vue),
    '@deepseek-ai/cordis': platform('@deepseek-ai/cordis', Cordis),
    'zod': platform('zod', Zod),
    '@tanstack/vue-virtual': platform('@tanstack/vue-virtual', VueVirtual),
    '@deepseek-ai/dsh-client-store': compiledModule('@deepseek-ai/dsh-client-store', ClientStore),
    '@deepseek-ai/dsh-client-ui-slots': compiledModule('@deepseek-ai/dsh-client-ui-slots', UiSlots),
    '@deepseek-ai/dsh-client-ui-primitives': compiledModule('@deepseek-ai/dsh-client-ui-primitives', UiPrimitives),
    '@deepseek-ai/dsh-client-ui-dockkit': compiledModule('@deepseek-ai/dsh-client-ui-dockkit', UiDockkit),
  } satisfies Record<PlatformModule, DshClientModuleManifest>)
}
