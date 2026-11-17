// @vitest-environment jsdom
import {
  defineComponent,
  computed,
  shallowRef,
  watch,
  h as vueH,
  Fragment,
  onMounted,
  onErrorCaptured,
  useSlots,
  type VNodeChild,
} from 'vue'


// @vitest-environment jsdom
/**
 * Hoc slots over the real ui-slots SlotCore: nesting order, owner and
 * children delivery, remount semantics, crash containment, and every scope.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { within } from '@testing-library/dom'
import {
  cleanupVue as cleanup,
  flushVue as act,
  renderVue,
} from '../../ui-primitives/tests/vue-render.ts'

function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node)
  return { ...view, ...within(document.body) }
}

import {
  SlotCore,
  type PropsRenderSlots,
  type ScopedStandardSourceBinding,
  type SlotRendererHost,
  type SlotScopeAdapter,
  type StandardSourceBinding,
} from '@deepseek-ai/dsh-client-ui-slots'
import { createVueSlotRenderer } from '../src/client/vue/slots.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'spec.hoc': {
      kind: 'hoc'
      scope: 'root'
      owner: {
        tone: string
      }
    }
    'spec.hoc.maybe': {
      kind: 'hoc'
      scope: 'session-maybe'
    }
    'spec.hoc.session': {
      kind: 'hoc'
      scope: 'session'
    }
    'spec.hoc.keyed': {
      kind: 'hoc'
      scope: 'root'
      owner: {
        tone: string
      }
    }
  }
}
type Frame = PropsRenderSlots<
  'spec.hoc' | 'spec.hoc.maybe' | 'spec.hoc.session' | 'spec.hoc.keyed'
>
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
/** Passthrough host over the real core whose current scope is one live Session. */
function hostOver(core: SlotCore): SlotRendererHost {
  const rootBinding: StandardSourceBinding = {
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }
  const session = {
    key: 'S1',
    ctx: new Context(),
    hooks: {},
    keyedHooks: {},
    props: {},
  } as ScopedStandardSourceBinding
  const source = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} })
  const sessionSource = source<StandardSourceBinding>(session)
  const adapter: SlotScopeAdapter = {
    current: sessionSource,
    bindingSource: () => sessionSource,
    renderArea: (_binding, { children }) => vueH(Fragment, null, [children]),
  }
  return {
    subscribe: (key, fn) => core.subscribe(key, fn),
    getVersion: key => core.getVersion(key),
    entriesOf: key => core.entries(key),
    entriesOfSlot: key => core.entriesOfSlot(key),
    reportEntryError: (key, entry, error, info) => {
      core.reportEntryError(key, entry, error, info)
    },
    reportFactoryError: () => {},
    specOf: key => core.specDynamic(key),
    isLive: entry => core.isLive(entry),
    storeOf: () => undefined,
    factoryStoreOf: () => undefined,
    retainFactoryOccurrence: () => () => {},
    subscribeFactory: () => () => {},
    getFactoryVersion: () => 0,
    factoryOf: () => undefined,
    isFactoryLive: () => false,
    root: source(rootBinding),
    scopeRevision: source(0),
    scope: () => adapter,
  }
}
const flush = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}
const mounts = vi.fn()
const Content = defineComponent(
  (props: { label?: string }) => {
    const label = computed(() => props.label ?? 'content')
    onMounted(() =>
      watch(
        () => [label.value],
        () => { mounts(label.value) },
        { immediate: true, flush: 'post' },
      ),
    )
    return () =>
      vueH(
        'p',
        {
          'data-testid': label.value,
        },
        [label.value],
      )
  },
  {
    props: ['label'],
    inheritAttrs: false,
  },
)
/** A layer that wraps its children in a section carrying its id and the owner's tone. */
function layer(id: string) {
  return ({ tone, children }: { tone?: string; children: VNodeChild }) =>
    vueH(
      'section',
      {
        'data-layer': id,
        'data-tone': tone,
      },
      [children],
    )
}
let setTone: (tone: string) => void = () => {}
/** Register the root declaring the hoc slots, render the root-scope hoc around Content, and mount. */
function mount(core: SlotCore, body?: (renderSlot: Frame['renderSlot']) => VNodeChild) {
  core.register(
    {
      name: 'root',
      children: {
        'spec.hoc': { kind: 'hoc', scope: 'root' },
        'spec.hoc.maybe': { kind: 'hoc', scope: 'session-maybe' },
        'spec.hoc.session': { kind: 'hoc', scope: 'session' },
        'spec.hoc.keyed': { kind: 'hoc', scope: 'root' },
      },
    },
    defineComponent(
      (props: Frame) => {
        const tone = shallowRef('calm')
        const set = (
          next: typeof tone.value | ((previous: typeof tone.value) => typeof tone.value),
        ) => {
          tone.value = typeof next === 'function' ? next(tone.value) : next
        }
        setTone = set
        return () => {
          void tone.value
          return vueH(Fragment, null, [
            body?.(props.renderSlot) ??
              props.renderSlot('spec.hoc', { tone: tone.value }, { children: vueH(Content, null) }),
          ])
        }
      },
      {
        props: ['renderSlot'],
        inheritAttrs: false,
      },
    ) as never,
  )
  return render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(hostOver(core), {})]))
}
describe('hoc slots', () => {
  it('renders the content unchanged without layers, then nests layers lowest order outermost', async () => {
    const core = new SlotCore()
    const view = mount(core)
    expect(view.getByTestId('content')).toBeTruthy()
    expect(view.container.querySelector('section')).toBeNull()
    core.register({ name: 'spec.hoc', id: 'inner', order: 10 }, layer('inner') as never)
    core.register({ name: 'spec.hoc', id: 'outer' }, layer('outer') as never)
    await flush()
    const outer = view.container.querySelector('section[data-layer="outer"]')
    const inner = outer?.querySelector(':scope > section[data-layer="inner"]')
    expect(inner?.querySelector(':scope > p')?.textContent).toBe('content')
    expect(outer?.getAttribute('data-tone')).toBe('calm')
    expect(inner?.getAttribute('data-tone')).toBe('calm')
  })
  it('updates owner props without remounting the content, and remounts it when the layer set changes', async () => {
    const core = new SlotCore()
    mounts.mockClear()
    const view = mount(core)
    core.register({ name: 'spec.hoc', id: 'outer' }, layer('outer') as never)
    await flush()
    mounts.mockClear()
    await act(() => {
      setTone('calm')
    })
    expect(mounts).not.toHaveBeenCalled()
    await act(() => {
      setTone('loud')
    })
    expect(view.container.querySelector('section')?.getAttribute('data-tone')).toBe('loud')
    expect(mounts).not.toHaveBeenCalled()
    const dispose = core.register(
      { name: 'spec.hoc', id: 'inner', order: 10 },
      layer('inner') as never,
    )
    await flush()
    expect(mounts).toHaveBeenCalledOnce()
    dispose()
    await flush()
    expect(view.container.querySelector('section[data-layer="inner"]')).toBeNull()
    expect(view.getByTestId('content')).toBeTruthy()
  })
  it('contains a crashed layer to its occurrence: content renders there and the layer stays for other occurrences', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const core = new SlotCore()
    const reported = vi.fn()
    core.onEntryError(reported)
    const view = mount(core, renderSlot =>
      vueH(Fragment, null, [
        vueH(
          'div',
          {
            'data-testid': 'calm-outlet',
          },
          [
            renderSlot(
              'spec.hoc',
              { tone: 'calm' },
              {
                children: vueH(Content, {
                  label: 'calm-content',
                }),
              },
            ),
          ],
        ),
        vueH(
          'div',
          {
            'data-testid': 'loud-outlet',
          },
          [
            renderSlot(
              'spec.hoc',
              { tone: 'loud' },
              {
                children: vueH(Content, {
                  label: 'loud-content',
                }),
              },
            ),
          ],
        ),
      ]),
    )
    core.register({ name: 'spec.hoc', id: 'outer' }, layer('outer') as never)
    core.register({ name: 'spec.hoc', id: 'fragile', order: 10 }, (({
      tone,
      children,
    }: {
      tone: string
      children: VNodeChild
    }) => {
      if (tone === 'loud') throw new Error('layer failed')
      return vueH(
        'section',
        {
          'data-layer': 'fragile',
        },
        [children],
      )
    }) as never)
    await flush()
    await flush()
    const loud = view.getByTestId('loud-outlet')
    expect(loud.querySelector('section[data-layer="outer"] > p')?.textContent).toBe('loud-content')
    expect(loud.querySelector('section[data-layer="fragile"]')).toBeNull()
    const calm = view.getByTestId('calm-outlet')
    expect(
      calm.querySelector('section[data-layer="outer"] > section[data-layer="fragile"] > p')
        ?.textContent,
    ).toBe('calm-content')
    expect(view.container.querySelector('[data-slot-error]')).toBeNull()
    expect(core.entriesOfSlot('spec.hoc').map(entry => entry.options.id)).toEqual([
      'outer',
      'fragile',
    ])
    expect(reported).toHaveBeenCalledWith(
      'spec.hoc',
      expect.anything(),
      expect.objectContaining({ message: 'layer failed' }),
      { abdicated: false },
    )
    expect(reported).toHaveBeenCalledTimes(1)
  })
  it('a crashed occurrence does not retry while it stays mounted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const core = new SlotCore()
    let ownerTone = 'loud'
    let shown = true
    const view = mount(core, renderSlot =>
      shown
        ? renderSlot(
          'spec.hoc',
          { tone: ownerTone },
          {
            children: vueH(Content, {
              label: 'retry-content',
            }),
          },
        )
        : false,
    )
    const calls = vi.fn()
    core.register({ name: 'spec.hoc', id: 'fragile' }, (({
      tone,
      children,
    }: {
      tone: string
      children: VNodeChild
    }) => {
      calls(tone)
      if (tone === 'loud') throw new Error('layer failed')
      return vueH(
        'section',
        {
          'data-layer': 'fragile',
        },
        [children],
      )
    }) as never)
    await flush()
    expect(calls).toHaveBeenCalledWith('loud')
    expect(view.getByTestId('retry-content')).toBeTruthy()
    calls.mockClear()
    await act(() => {
      setTone('same-owner')
    })
    expect(calls).not.toHaveBeenCalled()
    ownerTone = 'calm'
    await act(() => {
      setTone('changed-owner')
    })
    expect(calls).not.toHaveBeenCalled()
    expect(view.getByTestId('retry-content')).toBeTruthy()
    expect(view.container.querySelector('section[data-layer="fragile"]')).toBeNull()
    shown = false
    await act(() => {
      setTone('unmounted')
    })
    expect(view.queryByTestId('retry-content')).toBeNull()
    shown = true
    await act(() => {
      setTone('remounted')
    })
    expect(calls).toHaveBeenCalledWith('calm')
    expect(view.container.querySelector('section[data-layer="fragile"] > p')?.textContent).toBe(
      'retry-content',
    )
  })
  it('passes content errors upward without blaming or removing any layer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const core = new SlotCore()
    const reported = vi.fn()
    core.onEntryError(reported)
    const failing = shallowRef(false)
    function Fragile() {
      if (failing.value) throw new Error('content failed')
      return vueH(
        'p',
        {
          'data-testid': 'fragile',
        },
        ['fragile'],
      )
    }
    const caught = vi.fn()
    const Catch = defineComponent(() => {
      const error = shallowRef<unknown>()
      const children = useSlots()
      onErrorCaptured((reason) => {
        error.value = reason
        caught(reason)
        return false
      })
      return () =>
        error.value === undefined
          ? children.default?.()
          : vueH('p', {
            'data-testid': 'host-fallback',
          })
    })
    const view = mount(core, renderSlot =>
      vueH(Catch, null, {
        default: () => [
          renderSlot('spec.hoc', { tone: 'calm' }, { children: vueH(Fragile, null) }),
        ],
      }),
    )
    core.register({ name: 'spec.hoc', id: 'outer' }, layer('outer') as never)
    core.register({ name: 'spec.hoc', id: 'inner', order: 10 }, layer('inner') as never)
    await flush()
    failing.value = true
    await act(() => {
      setTone('loud')
    })
    await flush()
    expect(view.getByTestId('host-fallback')).toBeTruthy()
    expect(caught).toHaveBeenCalledWith(expect.objectContaining({ message: 'content failed' }))
    expect(reported).not.toHaveBeenCalled()
    expect(core.entriesOfSlot('spec.hoc').map(entry => entry.options.id)).toEqual([
      'outer',
      'inner',
    ])
  })
  it('renders its layers around nothing when the owner omits children', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot => renderSlot('spec.hoc', { tone: 'calm' }))
    core.register({ name: 'spec.hoc', id: 'outer' }, layer('outer') as never)
    await flush()
    expect(view.container.querySelector('section[data-layer="outer"]')?.children).toHaveLength(0)
    expect(view.container.querySelector('section[data-layer="outer"]')?.textContent).toBe('')
  })
  it('wraps content in session-maybe and strict session layers', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot =>
      vueH(Fragment, null, [
        renderSlot(
          'spec.hoc.maybe',
          {},
          {
            children: vueH(Content, {
              label: 'maybe-content',
            }),
          },
        ),
        renderSlot(
          'spec.hoc.session',
          {},
          {
            children: vueH(Content, {
              label: 'session-content',
            }),
          },
        ),
      ]),
    )
    core.register({ name: 'spec.hoc.maybe', id: 'maybe' }, layer('maybe') as never)
    core.register({ name: 'spec.hoc.session', id: 'session' }, layer('session') as never)
    await flush()
    expect(view.container.querySelector('section[data-layer="maybe"] p')?.textContent).toBe(
      'maybe-content',
    )
    expect(view.container.querySelector('section[data-layer="session"] p')?.textContent).toBe(
      'session-content',
    )
  })
})
function keyedOutlet(renderSlot: Frame['renderSlot'], entryKey: string, label: string) {
  return vueH(
    'div',
    {
      'data-testid': `${label}-outlet`,
    },
    [
      renderSlot(
        'spec.hoc.keyed',
        { tone: 'x' },
        {
          entryKey,
          children: vueH(Content, {
            label: label,
          }),
        },
      ),
    ],
  )
}
describe('keyed hoc slots', () => {
  it('applies wildcard layers to every key and exact-key layers only to their key', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot =>
      vueH(Fragment, null, [
        keyedOutlet(renderSlot, 'ts', 'ts-content'),
        keyedOutlet(renderSlot, 'md', 'md-content'),
      ]),
    )
    core.register({ name: 'spec.hoc.keyed', id: 'w' }, layer('w') as never)
    core.register({ name: 'spec.hoc.keyed', id: 'ts', key: 'ts', order: 1 }, layer('ts') as never)
    await flush()
    const ts = view.getByTestId('ts-content-outlet')
    expect(
      ts.querySelector('section[data-layer="w"] > section[data-layer="ts"] > p')?.textContent,
    ).toBe('ts-content')
    const md = view.getByTestId('md-content-outlet')
    expect(md.querySelector('section[data-layer="w"] > p')?.textContent).toBe('md-content')
    expect(md.querySelector('section[data-layer="ts"]')).toBeNull()
  })
  it('omitted entryKey applies only wildcard layers', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot =>
      renderSlot(
        'spec.hoc.keyed',
        { tone: 'x' },
        {
          children: vueH(Content, {
            label: 'wild-content',
          }),
        },
      ),
    )
    core.register({ name: 'spec.hoc.keyed', id: 'w' }, layer('w') as never)
    core.register({ name: 'spec.hoc.keyed', id: 'ts', key: 'ts', order: 1 }, layer('ts') as never)
    await flush()
    expect(view.container.querySelector('section[data-layer="w"] > p')?.textContent).toBe(
      'wild-content',
    )
    expect(view.container.querySelector('section[data-layer="ts"]')).toBeNull()
  })
  it('an exact-key layer replaces the wildcard layer with the same id', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot =>
      vueH(Fragment, null, [
        keyedOutlet(renderSlot, 'ts', 'ts-content'),
        keyedOutlet(renderSlot, 'md', 'md-content'),
      ]),
    )
    core.register({ name: 'spec.hoc.keyed', id: 'x' }, layer('wild') as never)
    core.register({ name: 'spec.hoc.keyed', id: 'x', key: 'ts' }, layer('exact') as never)
    await flush()
    const ts = view.getByTestId('ts-content-outlet')
    expect(ts.querySelector('section[data-layer="exact"] > p')?.textContent).toBe('ts-content')
    expect(ts.querySelector('section[data-layer="wild"]')).toBeNull()
    const md = view.getByTestId('md-content-outlet')
    expect(md.querySelector('section[data-layer="wild"] > p')?.textContent).toBe('md-content')
    expect(md.querySelector('section[data-layer="exact"]')).toBeNull()
  })
  it('a layer may skip its children, so the content never mounts', async () => {
    const core = new SlotCore()
    mounts.mockClear()
    let outletShown = false
    const view = mount(core, renderSlot =>
      outletShown ? keyedOutlet(renderSlot, 'ts', 'skipped-content') : null,
    )
    core.register({ name: 'spec.hoc.keyed', id: 'replace', key: 'ts' }, (() =>
      vueH('i', {
        'data-testid': 'replaced',
      })) as never)
    outletShown = true
    await act(() => {
      setTone('loud')
    })
    await flush()
    expect(view.getByTestId('replaced')).toBeTruthy()
    expect(view.queryByTestId('skipped-content')).toBeNull()
    expect(mounts).not.toHaveBeenCalledWith('skipped-content')
  })
  it('a crashed keyed layer falls back to its children', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const core = new SlotCore()
    const view = mount(core, renderSlot =>
      vueH(Fragment, null, [
        keyedOutlet(renderSlot, 'ts', 'ts-content'),
        vueH(
          'div',
          {
            'data-testid': 'calm-outlet',
          },
          [
            renderSlot(
              'spec.hoc.keyed',
              { tone: 'calm' },
              {
                entryKey: 'ts',
                children: vueH(Content, {
                  label: 'calm-content',
                }),
              },
            ),
          ],
        ),
      ]),
    )
    core.register({ name: 'spec.hoc.keyed', id: 'fragile', key: 'ts' }, (({
      tone,
      children,
    }: {
      tone: string
      children: VNodeChild
    }) => {
      if (tone === 'x') throw new Error('layer failed')
      return vueH(
        'section',
        {
          'data-layer': 'fragile',
        },
        [children],
      )
    }) as never)
    await flush()
    await flush()
    expect(view.getByTestId('ts-content').textContent).toBe('ts-content')
    expect(
      view.getByTestId('ts-content-outlet').querySelector('section[data-layer="fragile"]'),
    ).toBeNull()
    expect(
      view.getByTestId('calm-outlet').querySelector('section[data-layer="fragile"] > p')
        ?.textContent,
    ).toBe('calm-content')
    expect(
      core.entriesOfSlot('spec.hoc.keyed').map(entry => [entry.options.key, entry.options.id]),
    ).toEqual([['ts', 'fragile']])
  })
  it('interleaves wildcard and exact-key layers by order', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot =>
      vueH(Fragment, null, [
        keyedOutlet(renderSlot, 'ts', 'ts-content'),
        keyedOutlet(renderSlot, 'md', 'md-content'),
      ]),
    )
    core.register({ name: 'spec.hoc.keyed', id: 'w2', order: 2 }, layer('w2') as never)
    core.register({ name: 'spec.hoc.keyed', id: 'e1', key: 'ts', order: 1 }, layer('e1') as never)
    core.register({ name: 'spec.hoc.keyed', id: 'w0', order: 0 }, layer('w0') as never)
    await flush()
    const ts = view.getByTestId('ts-content-outlet')
    expect(
      ts.querySelector(
        'section[data-layer="w0"] > section[data-layer="e1"] > section[data-layer="w2"] > p',
      )?.textContent,
    ).toBe('ts-content')
    const md = view.getByTestId('md-content-outlet')
    expect(
      md.querySelector('section[data-layer="w0"] > section[data-layer="w2"] > p')?.textContent,
    ).toBe('md-content')
    expect(md.querySelector('section[data-layer="e1"]')).toBeNull()
  })
  it('a lower-priority registration at the same key and id shadows the layer until disposed', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot => keyedOutlet(renderSlot, 'ts', 'ts-content'))
    core.register({ name: 'spec.hoc.keyed', id: 'w0', order: 0 }, layer('w0') as never)
    core.register({ name: 'spec.hoc.keyed', id: 'e1', key: 'ts', order: 1 }, layer('e1') as never)
    await flush()
    const dispose = core.register(
      { name: 'spec.hoc.keyed', id: 'e1', key: 'ts', order: 1, priority: -1 },
      layer('shadow') as never,
    )
    await flush()
    const ts = view.getByTestId('ts-content-outlet')
    expect(
      ts.querySelector('section[data-layer="w0"] > section[data-layer="shadow"] > p')?.textContent,
    ).toBe('ts-content')
    expect(ts.querySelector('section[data-layer="e1"]')).toBeNull()
    dispose()
    await flush()
    expect(
      ts.querySelector('section[data-layer="w0"] > section[data-layer="e1"] > p')?.textContent,
    ).toBe('ts-content')
    expect(ts.querySelector('section[data-layer="shadow"]')).toBeNull()
  })
  it('an outer wildcard layer still wraps an exact-key layer that skips its children', async () => {
    const core = new SlotCore()
    const view = mount(core, renderSlot => keyedOutlet(renderSlot, 'ts', 'ts-content'))
    mounts.mockClear()
    core.register({ name: 'spec.hoc.keyed', id: 'w0', order: 0 }, layer('w0') as never)
    core.register({ name: 'spec.hoc.keyed', id: 'replace', key: 'ts', order: 1 }, (() =>
      vueH('i', {
        'data-testid': 'replaced',
      })) as never)
    core.register({ name: 'spec.hoc.keyed', id: 'w2', order: 2 }, layer('w2') as never)
    await flush()
    const ts = view.getByTestId('ts-content-outlet')
    expect(ts.querySelector('section[data-layer="w0"] > i[data-testid="replaced"]')).not.toBeNull()
    expect(ts.querySelector('section[data-layer="w2"]')).toBeNull()
    expect(view.queryByTestId('ts-content')).toBeNull()
    expect(mounts).not.toHaveBeenCalledWith('ts-content')
  })
  it("registering a layer for another key keeps this key's content mounted", async () => {
    const core = new SlotCore()
    mounts.mockClear()
    const view = mount(core, renderSlot => keyedOutlet(renderSlot, 'ts', 'ts-content'))
    core.register({ name: 'spec.hoc.keyed', id: 'w' }, layer('w') as never)
    await flush()
    const before = mounts.mock.calls.length
    await act(() => {
      core.register({ name: 'spec.hoc.keyed', id: 'md', key: 'md' }, layer('md') as never)
    })
    await flush()
    expect(mounts).toHaveBeenCalledTimes(before)
    await act(() => {
      core.register({ name: 'spec.hoc.keyed', id: 'ts2', key: 'ts' }, layer('ts2') as never)
    })
    await flush()
    expect(mounts).toHaveBeenCalledTimes(before + 1)
    expect(view.container.querySelector('section[data-layer="ts2"] > p')?.textContent).toBe(
      'ts-content',
    )
  })
  it('keeps every outlet of a key mounted when another key registers', async () => {
    const core = new SlotCore()
    mounts.mockClear()
    const view = mount(core, renderSlot =>
      vueH(Fragment, null, [
        keyedOutlet(renderSlot, 'ts', 'first-content'),
        keyedOutlet(renderSlot, 'ts', 'second-content'),
      ]),
    )
    core.register({ name: 'spec.hoc.keyed', id: 'w' }, layer('w') as never)
    await flush()
    const before = mounts.mock.calls.length
    await act(() => {
      core.register({ name: 'spec.hoc.keyed', id: 'md', key: 'md' }, layer('md') as never)
    })
    await flush()
    expect(mounts).toHaveBeenCalledTimes(before)
    expect(
      view.getByTestId('first-content-outlet').querySelector('section[data-layer="w"] > p')
        ?.textContent,
    ).toBe('first-content')
    expect(
      view.getByTestId('second-content-outlet').querySelector('section[data-layer="w"] > p')
        ?.textContent,
    ).toBe('second-content')
  })
  it("recompiles a key's chain for a redeclared slot", async () => {
    const core = new SlotCore()
    const declare = () =>
      core.register(
        {
          name: 'root',
          children: { 'spec.hoc.keyed': { kind: 'hoc', scope: 'root' } },
        },
        function Root(props: Frame) {
          return vueH(Fragment, null, [keyedOutlet(props.renderSlot, 'ts', 'ts-content')])
        } as never,
      )
    const undeclare = declare()
    const view = render(
      vueH(Fragment, null, [createVueSlotRenderer().renderRoot(hostOver(core), {})]),
    )
    core.register({ name: 'spec.hoc.keyed', id: 'first', key: 'ts' }, layer('first') as never)
    await flush()
    expect(view.container.querySelector('section[data-layer="first"] > p')?.textContent).toBe(
      'ts-content',
    )
    await act(() => {
      undeclare()
      declare()
      core.register({ name: 'spec.hoc.keyed', id: 'second', key: 'ts' }, layer('second') as never)
    })
    await flush()
    expect(view.container.querySelector('section[data-layer="second"] > p')?.textContent).toBe(
      'ts-content',
    )
    expect(view.container.querySelector('section[data-layer="first"]')).toBeNull()
  })
})
