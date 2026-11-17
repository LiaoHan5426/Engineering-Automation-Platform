// @vitest-environment jsdom
import { defineComponent, computed, shallowRef, h as vueH, Fragment, type VNodeChild } from 'vue'


import { fireEvent } from '@testing-library/dom'
import { cleanupVue as cleanup, flushVue as act } from '../../ui-primitives/tests/vue-render.ts'

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  FactoryComponentPropsOf,
  PropsRenderFactories,
  PropsRenderSlots,
} from '@deepseek-ai/dsh-client-ui-slots'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'spec.inline.single': {
      kind: 'single'
      scope: 'root'
      inline: true
    }
    'spec.inline.keyed': {
      kind: 'keyed'
      scope: 'root'
      inline: true
    }
    'spec.inline.list': {
      kind: 'list'
      scope: 'root'
      inline: true
    }
    'spec.inline.chain': {
      kind: 'chain'
      scope: 'root'
      inline: true
      owner: {
        enabled: boolean
      }
    }
    'spec.inline.child': {
      kind: 'single'
      scope: 'root'
      inline: true
    }
    'spec.inline.block': {
      kind: 'single'
      scope: 'root'
    }
  }
  interface SlotFactoryMap {
    'spec.inline.factory': {
      scope: 'root'
      children: {
        'spec.inline.child': {
          kind: 'single'
          scope: 'root'
          inline: true
        }
      }
    }
  }
}
afterEach(cleanup)
async function setup() {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(() => runtime.dispose())
  return runtime
}
function Crashed(): never {
  throw new Error('inline entry failed')
}
describe('inline Slot anchors', () => {
  it('keeps inline anchors and exhausted cells as spans while ordinary Slots remain divs', async () => {
    const runtime = await setup()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => {
      error.mockRestore()
    })
    await runtime.root.declare(
      {
        'spec.inline.single': { kind: 'single', scope: 'root', inline: true },
        'spec.inline.keyed': { kind: 'keyed', scope: 'root', inline: true },
        'spec.inline.list': { kind: 'list', scope: 'root', inline: true },
        'spec.inline.block': { kind: 'single', scope: 'root' },
      },
      ({ renderSlot }) =>
        vueH(Fragment, null, [
          renderSlot('spec.inline.single', {}),
          renderSlot('spec.inline.keyed', {}, { entryKey: 'failed' }),
          renderSlot('spec.inline.list', {}),
          renderSlot(
            'spec.inline.block',
            {},
            { fallback: vueH('span', null, ['Ordinary fallback']) },
          ),
        ]),
    )
    runtime.slots.register({ name: 'spec.inline.single' }, Crashed)
    runtime.slots.register({ name: 'spec.inline.keyed', key: 'failed' }, Crashed)
    runtime.slots.register({ name: 'spec.inline.list', id: 'failed' }, Crashed)
    const view = runtime.renderRoot()
    await act(async () => {})
    for (const name of ['spec.inline.single', 'spec.inline.keyed', 'spec.inline.list'] as const) {
      const anchor = view.container.querySelector(`[data-slot="${name}"]`)
      expect(anchor?.tagName).toBe('SPAN')
      expect(anchor?.querySelector('[data-slot-error]')?.tagName).toBe('SPAN')
      expect(runtime.slots.entries(name)).toHaveLength(1)
    }
    expect(view.container.querySelector('[data-slot="spec.inline.block"]')?.tagName).toBe('DIV')
    expect(view.getByText('Ordinary fallback')).toBeTruthy()
  })
  it('uses span overlay fallbacks and span error boundaries for inline chains', async () => {
    const runtime = await setup()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => {
      error.mockRestore()
    })
    await runtime.root.declare(
      {
        'spec.inline.chain': { kind: 'chain', scope: 'root', inline: true },
      },
      defineComponent(
        (props: PropsRenderSlots<'spec.inline.chain'>) => {
          const renderSlotChain = computed(() => props.renderSlotChain)
          const enabled = shallowRef(false)
          const setEnabled = (
            next: typeof enabled.value | ((previous: typeof enabled.value) => typeof enabled.value),
          ) => {
            enabled.value = typeof next === 'function' ? next(enabled.value) : next
          }
          return () =>
            vueH(Fragment, null, [
              vueH(
                'button',
                {
                  onClick: () => {
                    setEnabled(true)
                  },
                },
                ['Enable'],
              ),
              renderSlotChain.value(
                'spec.inline.chain',
                { enabled: enabled.value },
                {
                  fallback: vueH('span', null, ['Fallback']),
                  overlay: true,
                  fallbackOnly: !enabled.value,
                },
              ),
            ])
        },
        {
          props: ['renderSlotChain'],
          inheritAttrs: false,
        },
      ),
    )
    runtime.slots.register(
      { name: 'spec.inline.chain', select: ({ enabled }) => (enabled ? {} : null) },
      Crashed,
    )
    const view = runtime.renderRoot()
    const fallback = view.container.querySelector<HTMLElement>('[data-chain-overlay-fallback]')!
    expect(fallback.tagName).toBe('SPAN')
    expect(fallback.style.display).toBe('contents')
    await act(() => { fireEvent.click(view.getByRole('button', { name: 'Enable' })) })
    expect(view.container.querySelector('[data-chain-overlay-fallback]')).toBe(fallback)
    expect(fallback.style.display).toBe('none')
    expect(view.container.querySelector('[data-slot-error="spec.inline.chain"]')?.tagName).toBe(
      'SPAN',
    )
  })
  it('retains the inline child anchor after its Factory declaration is disposed', async () => {
    const runtime = await setup()
    let retained: VNodeChild = null
    const dispose = runtime.slots.registerFactory(
      {
        name: 'spec.inline.factory',
        scope: 'root',
        children: { 'spec.inline.child': { kind: 'single', scope: 'root', inline: true } },
      },
      defineComponent(
        (nativeProps: FactoryComponentPropsOf<'spec.inline.factory'>) => () => {
          const { renderSlot } = nativeProps
          retained = renderSlot(
            'spec.inline.child',
            {},
            { fallback: vueH('span', null, ['Child fallback']) },
          )
          return retained
        },
        { props: ['renderSlot'], inheritAttrs: false },
      ),
    )
    runtime.slots.register({ name: 'spec.inline.child' }, () => vueH('span', null, ['Child']))
    await runtime.root.declare(
      {},
      defineComponent(
        (props: PropsRenderFactories) => {
          const renderFactorySlot = computed(() => props.renderFactorySlot)
          const hold = shallowRef(false)
          const setHold = (
            next: typeof hold.value | ((previous: typeof hold.value) => typeof hold.value),
          ) => {
            hold.value = typeof next === 'function' ? next(hold.value) : next
          }
          return () =>
            vueH(Fragment, null, [
              vueH(
                'button',
                {
                  onClick: () => {
                    setHold(true)
                  },
                },
                ['Retain child'],
              ),
              hold.value ? retained : renderFactorySlot.value('spec.inline.factory', {}),
            ])
        },
        {
          props: ['renderFactorySlot'],
          inheritAttrs: false,
        },
      ),
    )
    const view = runtime.renderRoot()
    expect(view.getByText('Child')).toBeTruthy()
    await act(() => { fireEvent.click(view.getByRole('button', { name: 'Retain child' })) })
    const anchor = view.container.querySelector('[data-slot="spec.inline.child"]')!
    expect(anchor.tagName).toBe('SPAN')
    await act(async () => {
      dispose()
    })
    expect(view.container.querySelector('[data-slot="spec.inline.child"]')).toBe(anchor)
    expect(anchor.textContent).toBe('')
    expect(view.queryByText('Child fallback')).toBeNull()
    expect(runtime.slots.entries('spec.inline.child')).toHaveLength(0)
  })
})
