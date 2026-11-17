import { h, type Ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  SlotCore,
  type KeyedSnapshotSelectorHook,
  type FactoryComponentPropsOf,
  type SessionProviderComponent,
  type HocShare,
} from '@deepseek-ai/dsh-client-ui-slots'
import { defineSlotComponent } from '../src/client/vue/components.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'native.typed': { kind: 'single'; scope: 'root'; owner: { label: string } }
  }
  interface SlotFactoryMap {
    'native.typed.factory': { scope: 'root'; props: { label: string } }
  }
}

// Typecheck native constructor inputs at the same registration API used by plugins.
function checkNativeContract(
  core: SlotCore,
  family: KeyedSnapshotSelectorHook<{ label: string }>,
  key: Ref<string>,
) {
  const Native = defineSlotComponent<{ label: string }>(
    ['label'],
    props => () => h('b', props.label),
  )
  core.register({ name: 'native.typed' }, Native)
  core.registerFactory({ name: 'native.typed.factory', scope: 'root' }, Native)
  const Missing = defineSlotComponent<{ absent: string }>(
    ['absent'],
    props => () => h('b', props.absent),
  )
  // @ts-expect-error the slot composition supplies no absent prop.
  core.register({ name: 'native.typed' }, Missing)
  // @ts-expect-error the Factory composition supplies no absent prop.
  core.registerFactory({ name: 'native.typed.factory', scope: 'root' }, Missing)
  const selected: Readonly<Ref<string | undefined>> = family(key, value => value.label)
  const read: Readonly<Ref<{ label: string } | undefined>> = family(key)
  return [selected, read]
}

function checkNativeDefaultSlots(provider: SessionProviderComponent) {
  const hoc: HocShare<{ kind: 'hoc'; scope: 'root' }> = {}
  const area = h(provider, { session: undefined }, { default: () => h('b', 'body') })
  // @ts-expect-error the no-session renderer must remain callable.
  h(provider, { empty: 42 }, { default: () => h('b', 'body') })
  return { hoc, area }
}

describe('native Vue registration contracts', () => {
  it('preserves the existing core registration path for native definitions', () => {
    const core = new SlotCore()
    const Native = defineSlotComponent<FactoryComponentPropsOf<'native.typed.factory'>>(
      ['label', 'renderFactorySlot', 'useFactorySlot'],
      props => () => h('b', props.label),
    )
    const remove = core.registerFactory({ name: 'native.typed.factory', scope: 'root' }, Native)
    expect(core.factory('native.typed.factory')?.component).toBe(Native)
    remove()
    expect(core.factory('native.typed.factory')).toBeUndefined()
    expect(typeof checkNativeContract).toBe('function')
    expect(typeof checkNativeDefaultSlots).toBe('function')
  })
})
