// @vitest-environment jsdom
/** Framework capabilities reach native components only through declared inputs. */
import { Context } from '@deepseek-ai/cordis'
import {
  createApp, defineAsyncComponent, defineComponent, h, nextTick, onScopeDispose,
  shallowRef, type Component, type ComponentPublicInstance, type VNodeChild,
} from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { StandardSourceBinding } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '../src/client/registry.ts'
import { createVueSlotRenderer } from '../src/client/vue/slots.ts'
import { defineSlotComponent } from '../src/client/vue/components.ts'

type Face = Record<string, unknown>
type RenderSlot = (name: string, input: object, options?: object) => VNodeChild
type RenderFactory = (name: string, input: object, options?: object) => VNodeChild
type LocalSlot = (name: string, fallback: Component) => Component
interface Ledger {
  register(options: object, component: unknown): () => void
  registerFactory(options: object, component: unknown): () => void
}
const releases: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const release of releases.splice(0).reverse()) await release()
  vi.restoreAllMocks()
})
async function settle() { await nextTick(); await Promise.resolve(); await nextTick() }
async function bench(extra: Face = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry)
  const absent: StandardSourceBinding = { key: undefined, props: {}, hooks: {}, keyedHooks: {} }
  const current = { getSnapshot: () => absent, subscribe: () => () => {} }
  ctx.slots.installScope('session', { current, bindingSource: () => current })
  ctx.slots.install(createVueSlotRenderer())
  const actions = { run: vi.fn() }
  const secret = vi.fn()
  ctx.slots.provideRoot({
    props: { sessionId: 'framework-session', actions, secret, ...extra },
    hooks: { theme: { getSnapshot: () => 'dark', subscribe: () => () => {} } },
  })
  const container = document.createElement('main')
  document.body.append(container)
  let app: ReturnType<typeof createApp> | undefined
  releases.push(async () => { app?.unmount(); container.remove(); await ctx.fiber.dispose() })
  return {
    ledger: ctx.slots as Ledger, container, actions, secret,
    mount: async () => {
      app = createApp({ render: () => ctx.slots.renderSlot('root', {}) })
      app.mount(container)
      await settle()
    },
  }
}

it('keeps undeclared framework values off a single DOM root and avoids fragment fallthrough warnings', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const b = await bench()
  const received: Face[] = []
  const Plain = defineComponent({ setup: (_props, { attrs }) => {
    received.push({ ...attrs })
    return () => h('button', 'plain')
  } })
  const Fragment = defineComponent({ setup: (_props, { attrs }) => {
    received.push({ ...attrs })
    return () => [h('i', 'left'), h('i', 'right')]
  } })
  const Root = defineSlotComponent<{ renderSlot: RenderSlot }>(['renderSlot'], props => () => [
    props.renderSlot('input.plain', {}), props.renderSlot('input.fragment', {}),
  ])
  b.ledger.register({ name: 'root', children: {
    'input.plain': { kind: 'single', scope: 'root' }, 'input.fragment': { kind: 'single', scope: 'root' },
  } }, Root)
  b.ledger.register({ name: 'input.plain' }, Plain)
  b.ledger.register({ name: 'input.fragment' }, Fragment)
  await b.mount()
  expect(received).toEqual([{}, {}])
  expect(b.container.querySelector('button')?.getAttributeNames()).toEqual([])
  expect(b.container.textContent).toBe('plainleftright')
  expect(warning).not.toHaveBeenCalled()
})

it('honors object props, array props, mixins, extends and kebab declarations', async () => {
  const b = await bench()
  let received: Face = {}
  let attributes: Face = {}
  const Native = defineComponent({
    extends: { props: ['session-id'] },
    mixins: [{ props: ['actions'] }],
    props: { 'use-theme': Function },
    setup(props, { attrs }) {
      received = { ...props }; attributes = { ...attrs }
      return () => h('b', 'declared')
    },
  })
  b.ledger.register({ name: 'root' }, Native)
  await b.mount()
  expect(received['sessionId']).toBe('framework-session')
  expect(received['actions']).toBe(b.actions)
  expect(typeof received['useTheme']).toBe('function')
  expect(attributes).toEqual({})
  expect(b.container.querySelector('b')?.getAttributeNames()).toEqual([])
})

it('retains declared emits listeners including Once and kebab names without forwarding unrelated handlers', async () => {
  const save = vi.fn(), once = vi.fn(), refresh = vi.fn(), hidden = vi.fn()
  const b = await bench({ onSaveItem: save, onSaveItemOnce: once, onRefresh: refresh, onHidden: hidden })
  let attributes: Face = {}
  const Native = defineComponent({
    extends: { emits: ['refresh'] }, mixins: [{ emits: { 'save-item': null } }],
    setup(_props, { attrs, emit }) {
      attributes = { ...attrs }
      return () => h('button', { onClick: () => { emit('save-item', 'saved'); emit('refresh') } }, 'save')
    },
  })
  b.ledger.register({ name: 'root' }, Native)
  await b.mount()
  b.container.querySelector('button')?.click()
  b.container.querySelector('button')?.click()
  expect(save).toHaveBeenCalledTimes(2)
  expect(save).toHaveBeenCalledWith('saved')
  expect(once).toHaveBeenCalledTimes(1)
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(hidden).not.toHaveBeenCalled()
  expect(attributes).toEqual({})
})

it('reads runtime metadata from Vue class component options', async () => {
  const b = await bench()
  let received: Face = {}
  const NativeClass = Object.assign(function NativeClass() {}, {
    __vccOpts: defineComponent({
      props: ['sessionId', 'actions'],
      setup(props, { attrs }) {
        received = { ...props }
        expect(attrs).toEqual({})
        return () => h('b', 'class component')
      },
    }),
  })
  b.ledger.register({ name: 'root' }, NativeClass)
  await b.mount()
  expect(received).toEqual({ sessionId: 'framework-session', actions: b.actions })
  expect(b.container.textContent).toBe('class component')
})

it('preserves caller native inputs, overrides, keys and refs through live rerenders', async () => {
  const b = await bench()
  const click = vi.fn()
  const instance = shallowRef<ComponentPublicInstance | null>(null)
  const current = shallowRef({ key: 'first', label: 'first', color: 'red' })
  let setups = 0
  const Native = defineComponent({
    props: ['sessionId'],
    setup(props) { setups++; return () => h('button', String(props.sessionId)) },
  })
  const Root = defineSlotComponent<{ renderSlot: RenderSlot }>(['renderSlot'], props => () =>
    props.renderSlot('input.caller', {
      key: current.value.key, ref: instance, sessionId: 'caller-session',
      'aria-label': current.value.label, 'data-owner': 'caller', class: 'caller-class',
      style: { color: current.value.color }, title: 'native title', disabled: false, onClick: click,
    }))
  b.ledger.register({ name: 'root', children: { 'input.caller': { kind: 'single', scope: 'root' } } }, Root)
  b.ledger.register({ name: 'input.caller' }, Native)
  await b.mount()
  const button = b.container.querySelector('button')
  expect(button?.textContent).toBe('caller-session')
  expect(button?.className).toBe('caller-class')
  expect(button?.style.color).toBe('red')
  expect(button?.getAttribute('data-owner')).toBe('caller')
  expect(button?.title).toBe('native title')
  expect(button?.disabled).toBe(false)
  expect(instance.value?.$el).toBe(button)
  button?.click(); expect(click).toHaveBeenCalledTimes(1)
  current.value = { key: 'first', label: 'updated', color: 'blue' }
  await settle()
  expect(b.container.querySelector('button')).toBe(button)
  expect(button?.getAttribute('aria-label')).toBe('updated')
  expect(button?.style.color).toBe('blue')
  current.value = { ...current.value, key: 'second' }
  await settle()
  expect(setups).toBe(2)
  expect(b.container.querySelector('button')).not.toBe(button)
  expect(instance.value?.$el).toBe(b.container.querySelector('button'))
})

it('continues passing the complete framework kit to functional components', async () => {
  const b = await bench()
  let received: Face = {}
  const Functional = (props: Face) => { received = props; return h('b', 'functional') }
  b.ledger.register({ name: 'root' }, Functional)
  await b.mount()
  expect(received['sessionId']).toBe('framework-session')
  expect(received['actions']).toBe(b.actions)
  expect(received['secret']).toBe(b.secret)
  expect(typeof received['useTheme']).toBe('function')
  expect(typeof received['renderFactorySlot']).toBe('function')
  expect(b.container.querySelector('b')?.getAttributeNames()).toEqual([])
})

it('applies the same input policy to factory entries and selected and fallback local components', async () => {
  const b = await bench()
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const received: Face[] = []
  const local = (label: string) => defineComponent({
    props: ['sessionId'],
    setup(props, { attrs }) {
      received.push({ ...props, ...attrs })
      return () => h('b', label)
    },
  })
  const Fallback = local('fallback'), Selected = local('selected')
  const factoryAttrs: Face[] = []
  const Factory = defineComponent((props: { useFactorySlot: LocalSlot }, context) => {
    factoryAttrs.push({ ...context.attrs })
    const Local = props.useFactorySlot('body', Fallback)
    return () => h(Local, { 'data-caller': 'local' })
  }, { props: ['useFactorySlot'] })
  const Root = defineSlotComponent<{ renderFactorySlot: RenderFactory }>(['renderFactorySlot'], props => () => [
    props.renderFactorySlot('input.factory', {}),
    props.renderFactorySlot('input.factory', {}, { slots: { body: Selected } }),
  ])
  b.ledger.register({ name: 'root' }, Root)
  b.ledger.registerFactory({ name: 'input.factory', scope: 'root', slots: { body: { scope: 'root' } } }, Factory)
  await b.mount()
  expect(b.container.textContent).toBe('fallbackselected')
  expect(factoryAttrs).toEqual([{}, {}])
  expect(received).toEqual([
    { sessionId: 'framework-session', 'data-caller': 'local' },
    { sessionId: 'framework-session', 'data-caller': 'local' },
  ])
  expect(warning).not.toHaveBeenCalled()
})

it('forwards HOC default slots while keeping undeclared capabilities out of wrapper attrs', async () => {
  const b = await bench()
  let attrs: Face = {}
  const Wrapper = defineComponent({ props: ['children'], setup: (_props, context) => {
    attrs = { ...context.attrs }
    return () => h('section', context.slots.default?.())
  } })
  const Root = defineSlotComponent<{ renderSlot: RenderSlot }>(['renderSlot'], props => () =>
    props.renderSlot('input.hoc', {}, { children: h('strong', 'content') }))
  b.ledger.register({ name: 'root', children: { 'input.hoc': { kind: 'hoc', scope: 'root' } } }, Root)
  b.ledger.register({ name: 'input.hoc', id: 'wrapper' }, Wrapper)
  await b.mount()
  expect(b.container.querySelector('section > strong')?.textContent).toBe('content')
  expect(attrs).toEqual({})
})

it('delivers five declared props to a deferred body through an explicit wrapper and updates them in place', async () => {
  const b = await bench()
  const ready = Promise.withResolvers<Component>()
  const load = vi.fn(() => ready.promise)
  const Async = defineAsyncComponent(load)
  const names = ['useTabInfo', 'useTerminal', 'useTheme', 'view', 't']
  const Wrapper = defineComponent((props: Face, context) => () => h(Async, { ...context.attrs, ...props },
    context.slots), { props: names, inheritAttrs: false })
  const initial = Object.fromEntries(names.map(name => [name, vi.fn()]))
  const current = shallowRef<Face>({})
  let setups = 0, disposed = 0
  let received: Face = {}
  const Body = defineSlotComponent<Face>(names, (props) => {
    setups++; onScopeDispose(() => { disposed++ })
    return () => { received = { ...props }; return h('b', 'async body') }
  })
  const Root = defineSlotComponent<{ renderSlot: RenderSlot }>(['renderSlot'], props => () =>
    props.renderSlot('input.async', current.value))
  b.ledger.register({ name: 'root', children: { 'input.async': { kind: 'single', scope: 'root' } } }, Root)
  const remove = b.ledger.register({ name: 'input.async', inject: () => initial }, Wrapper)
  expect(load).not.toHaveBeenCalled()
  await b.mount()
  expect(load).toHaveBeenCalledTimes(1)
  ready.resolve(Body)
  await vi.waitFor(() => { expect(b.container.textContent).toBe('async body') })
  expect(received).toEqual(initial)
  const updated = Object.fromEntries(names.map(name => [name, vi.fn()]))
  current.value = updated
  await settle()
  expect(received).toEqual(updated)
  expect(setups).toBe(1)
  expect(load).toHaveBeenCalledTimes(1)
  remove(); await settle()
  expect(disposed).toBe(1)
  expect(b.container.textContent).toBe('')
})
