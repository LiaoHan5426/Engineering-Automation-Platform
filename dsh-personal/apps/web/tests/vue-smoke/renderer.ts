/** Test-only native composition; production plugin selection stays profile-owned. */
import type { Context } from '@deepseek-ai/cordis'
import { defineSlotComponent } from '../../../../packages/client/ui-renderer/src/client/vue/components.ts'
import type {
  PropsRuntime,
  PropsRenderSlots,
  StandardSourceBinding,
} from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '../../../../packages/client/ui-renderer/src/client/registry.ts'
import { createVueSlotRenderer } from '../../../../packages/client/ui-renderer/src/client/vue/slots.ts'
import { UiRenderer } from '../../../../packages/client/ui-renderer/src/client/renderer.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'vue-smoke.content': { kind: 'single'; scope: 'root' }
  }
}

export const inject = ['modules']

function requireSlots(ctx: Context): asserts ctx is Context & { slots: SlotRegistry } {
  if (!('slots' in ctx) || !(ctx.slots instanceof SlotRegistry)) {
    throw new Error('Vue smoke renderer requires its installed SlotRegistry')
  }
}

/** Install the native renderer over the authoritative registry and stylesheet owner. */
export function apply(ctx: Context): void {
  const slots = new SlotRegistry(ctx)
  // This profile has no session feature; supply an explicitly absent scope to the native tree.
  const absent: StandardSourceBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} }
  const current = { getSnapshot: () => absent, subscribe: () => () => {} }
  slots.installScope('session', {
    current,
    bindingSource: () => current,
    renderArea: (binding, props) =>
      binding.key === undefined ? (props.empty?.() ?? null) : props.children,
  })
  slots.install(createVueSlotRenderer())
  const Root = defineSlotComponent<PropsRuntime<'root'> & PropsRenderSlots<'vue-smoke.content'>>(
    ['renderSlot'],
    props => () => props.renderSlot('vue-smoke.content', {}),
  )
  slots.register(
    { name: 'root', children: { 'vue-smoke.content': { kind: 'single', scope: 'root' } } },
    Root,
  )
  requireSlots(ctx)
  const renderer = new UiRenderer(ctx)
  ctx.effect(function* () {
    yield ctx.effect(
      () => () => {
        renderer.dispose()
      },
      'smoke: native application',
    )
    yield ctx.reflect.provide('uiRenderer', renderer)
  }, 'smoke: native renderer')
}
