// @vitest-environment jsdom
import { defineComponent, h as vueH, Fragment, type VNodeChild } from 'vue'

import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-primitives'
const identity = <T,>(value: T): T => value
// @vitest-environment jsdom
/**
 * useProjection standard-kit delivery (session-projection subsystem page:
 * docs/subsystems/session-projection.md): the fifth
 * framework hook seat rides the same provide channel as useSession — a
 * session slot component receives `useProjection` in its kit, key-addressed
 * over the binding's projection source family; unresolved keys and absent
 * sessions read `undefined`; live value changes re-render; the selector
 * overload runs over the whole value.
 */
import { describe, expect, it } from 'vitest'
import { within } from '@testing-library/dom'
import { flushVue as act, renderVue } from '../../ui-primitives/tests/vue-render.ts'

function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node)
  return { ...view, ...within(document.body) }
}
import { Context } from '@deepseek-ai/cordis'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionProviderComponent, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ScopedStandardSourceBinding,
  SlotRendererHost,
  SlotScopeAdapter,
  StandardSourceBinding,
} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createVueSlotRenderer } from '../src/client/vue/slots.ts'
type SessionBinding = ScopedStandardSourceBinding
function observable<T>(initial: T) {
  let value = initial
  const subs = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (fn: () => void) => {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
    set: (next: T) => {
      value = next
      for (const fn of [...subs]) fn()
    },
  }
}
type UseProjectionProp = (
  key: string,
  selector?: (v: unknown) => unknown,
) => Readonly<import('vue').Ref<unknown>>
function makeHost() {
  const scopeCtx = new Context()
  const absentBinding: StandardSourceBinding = {
    key: undefined,
    hooks: { session: undefined },
    keyedHooks: { projection: undefined },
    props: { sessionId: undefined },
  }
  const absentBindingSource = observable<StandardSourceBinding>(absentBinding)
  const selected = observable<SessionReference | undefined>(undefined)
  const bindingSources = new Map<string, ReturnType<typeof observable<StandardSourceBinding>>>()
  const cells = new Map<string, ReturnType<typeof observable<unknown>>>()
  /** Store-parallel source family: an unseen key snapshots undefined. */
  const absent = { getSnapshot: () => undefined, subscribe: () => () => {} }
  const sessionEntries: StoredEntry[] = []
  const bindings = new Map<string, SessionBinding>()
  const rootEntry: StoredEntry = {
    component: defineComponent(
      (props: {
        renderSlot: (key: string, owner: object) => VNodeChild
        SessionProvider: SessionProviderComponent
      }) => {
        const reference = useObservableSelector(
          () => ({ subscribe: selected.subscribe, getSnapshot: selected.getSnapshot }),
          () => identity,
        )
        return () =>
          vueH(
            props.SessionProvider,
            {
              session: reference.value,
            },
            {
              default: () => [props.renderSlot('k.session', {})],
            },
          )
      },
      {
        props: ['SessionProvider', 'renderSlot'],
        inheritAttrs: false,
      },
    ),
    options: {},
    children: { 'k.session': { kind: 'single', scope: 'session' } },
  }
  const binding = (id: string): SessionBinding => {
    const cached = bindings.get(id)
    if (cached !== undefined) return cached
    const value: SessionBinding = {
      key: id,
      ctx: scopeCtx,
      hooks: { session: { getSnapshot: () => ({ sid: id }), subscribe: () => () => {} } },
      keyedHooks: { projection: key => cells.get(key) ?? absent },
      props: { sessionId: id },
    }
    bindings.set(id, value)
    bindingSources.set(id, observable<StandardSourceBinding>(value))
    return value
  }
  const root = observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  })
  const sessionAdapter: SlotScopeAdapter = {
    current: absentBindingSource,
    bindingSource: target =>
      target === undefined ? absentBindingSource : bindingSources.get(target.sessionId)!,
    renderArea: (scopeBinding, { empty, children }) =>
      scopeBinding.key === undefined
        ? vueH(Fragment, null, [empty?.() ?? null])
        : vueH(Fragment, null, [children]),
  }
  const host: SlotRendererHost = {
    subscribe: () => () => {},
    getVersion: () => 0,
    entriesOf: key => (key === 'root' ? [rootEntry] : sessionEntries),
    // Single-kind everywhere and no crashes in this suite: the projection is
    // the raw view and crash reports never fire.
    entriesOfSlot: key => (key === 'root' ? [rootEntry] : sessionEntries),
    reportEntryError: () => {},
    reportFactoryError: () => {},
    specOf: key =>
      key === 'root'
        ? { kind: 'single', scope: 'root' }
        : key === 'k.session'
          ? { kind: 'single', scope: 'session' }
          : undefined,
    isLive: () => true,
    storeOf: () => undefined,
    factoryStoreOf: () => undefined,
    retainFactoryOccurrence: () => () => {},
    subscribeFactory: () => () => {},
    getFactoryVersion: () => 0,
    factoryOf: () => undefined,
    isFactoryLive: () => false,
    root,
    scopeRevision: observable(0),
    scope: () => sessionAdapter,
  }
  return {
    host,
    cells,
    // The driver publishes the resolved binding or the absent projection.
    current: {
      set: (id: string | undefined) => {
        if (id !== undefined) binding(id)
        selected.set(id === undefined ? undefined : ({ sessionId: id } as SessionReference))
      },
    },
    registerSession: (entry: StoredEntry) => {
      sessionEntries.push(entry)
    },
  }
}
describe('useProjection standard-kit delivery', () => {
  it('reads the projected value through the kit, undefined for unresolved keys, and follows live changes', async () => {
    const h = makeHost()
    const cell = observable<unknown>({ marks: ['a'] })
    h.cells.set('test/marks', cell)
    const reads: Record<string, unknown>[] = []
    h.registerSession({
      component: defineComponent(
        (props: { useProjection: UseProjectionProp }) => {
          const marks = props.useProjection('test/marks')
          const ghost = props.useProjection('test/ghost')
          return () => {
            reads.push({ marks: marks.value, ghost: ghost.value })
            return null
          }
        },
        {
          props: ['useProjection'],
          inheritAttrs: false,
        },
      ),
      options: {},
    })
    h.current.set('s1')
    render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]))
    expect(reads.at(-1)).toEqual({ marks: { marks: ['a'] }, ghost: undefined })
    // Live change re-renders with the new whole value.
    await act(() => {
      cell.set({ marks: ['a', 'b'] })
    })
    expect(reads.at(-1)).toEqual({ marks: { marks: ['a', 'b'] }, ghost: undefined })
  })
  it('runs the selector over the whole snapshot, including an undefined snapshot from a present source', () => {
    const h = makeHost()
    h.cells.set('test/marks', observable<unknown>({ marks: ['x', 'y'] }))
    const reads: unknown[] = []
    h.registerSession({
      component: defineComponent(
        (props: { useProjection: UseProjectionProp }) => {
          const marks = props.useProjection(
            'test/marks',
            v => (v as { marks: string[] } | undefined)?.marks.length ?? -1,
          )
          const ghost = props.useProjection('test/ghost', v =>
            v === undefined ? 'absent' : 'present',
          )
          return () => {
            reads.push(marks.value, ghost.value)
            return null
          }
        },
        {
          props: ['useProjection'],
          inheritAttrs: false,
        },
      ),
      options: {},
    })
    h.current.set('s1')
    render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]))
    expect(reads.slice(-2)).toEqual([2, 'absent'])
  })
})
