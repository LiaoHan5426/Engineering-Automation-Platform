// @vitest-environment jsdom
/**
 * The plugin's wiring: `ctx.resources` is provided, the `resource` root keyed
 * hook reaches every slot component as `useResource`, and both leave with the
 * fiber so a reload of the plugin registers cleanly again.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts'
import { defineComponent, shallowRef, watchEffect, type ShallowRef } from 'vue'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { apply, inject, type ResourceSnapshot, type UseResource } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { ResourceRegistry } from '../src/client/resources.ts'
import type { ResourceProvider } from '../src/client/contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'resources.probe': { kind: 'single'; scope: 'root' }
    'resources.sessionProbe': { kind: 'single'; scope: 'session' }
    'resources.sessionPeer': { kind: 'single'; scope: 'session' }
  }
  interface ResourceProtocolMap {
    feed: string
  }
}

const A = 'dsh-resource://feed/one'
let runtime: SlotTestRuntime | undefined

afterEach(async () => {
  await runtime?.dispose()
  runtime = undefined
})

const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

async function boot(): Promise<SlotTestRuntime> {
  const rt = await SlotTestRuntime.create()
  await rt.declare({
    'resources.probe': { kind: 'single', scope: 'root' },
    'resources.sessionProbe': { kind: 'single', scope: 'session' },
    'resources.sessionPeer': { kind: 'single', scope: 'session' },
  })
  return rt
}

describe('client-resources apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('provides ctx.resources and hands every slot component useResource over the shared source', async () => {
    runtime = await boot()
    await runtime.mount({ inject: [...inject], apply })
    expect(runtime.ctx.resources).toBeInstanceOf(ResourceRegistry)

    // A root-scope component reading one address through the standard hook.
    let seen: Readonly<ShallowRef<ResourceSnapshot<string>>> | undefined
    runtime.slots.register({ name: 'resources.probe' }, defineComponent((props: { useResource: UseResource }) => {
      seen = props.useResource<'feed'>(A)
      return () => null
    }, { props: ['useResource'] }))
    await runtime.renderSlot('resources.probe', {})
    expect(seen?.value).toMatchObject({ status: 'none', value: undefined })

    let push: ((value: string) => void) | undefined
    await act(async () => {
      runtime!.ctx.effect(() => runtime!.ctx.resources.register<'feed'>({
        protocol: 'feed',
        open: () => ({
          [Symbol.asyncIterator]: () => ({
            next: () => new Promise<IteratorResult<RemoteResult<string>>>((resolve) => {
              push = (value) => { resolve({ done: false, value: { ok: true, value } }) }
            }),
          }),
        }),
      }), 'spec: feed provider')
    })
    expect(seen?.value).toMatchObject({ status: 'loading' })
    // Rendering the hook is what holds the address: the provider's stream is open.
    expect(push).toBeDefined()
    await act(async () => { push!('v1'); await settle() })
    expect(seen?.value).toMatchObject({ status: 'live', value: 'v1' })
    expect(runtime.ctx.resources.source(A).getSnapshot()).toBe(seen?.value)
  })

  it('releases absent keys and switches one native seat without retaining the old provider', async () => {
    runtime = await boot()
    await runtime.mount({ inject: [...inject], apply })
    const address = shallowRef<string | undefined>(undefined)
    const signals: AbortSignal[] = []
    const open = vi.fn<ResourceProvider<'feed'>['open']>(async function* (key, { signal }) {
      signals.push(signal)
      yield { ok: true, value: key }
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    })
    runtime.ctx.effect(() => runtime!.ctx.resources.register({ protocol: 'feed', open }), 'spec: keyed provider')
    let seat: Readonly<ShallowRef<ResourceSnapshot<string> | undefined>> | undefined
    const withdraw = runtime.slots.register({ name: 'resources.probe' }, defineComponent((props: { useResource: UseResource }) => {
      seat = props.useResource<'feed'>(address)
      return () => null
    }, { props: ['useResource'] }))
    await runtime.renderSlot('resources.probe', {})
    expect(seat?.value).toBeUndefined()
    expect(open).not.toHaveBeenCalled()
    await act(async () => { address.value = A; await settle() })
    const firstSeat = seat
    expect(seat?.value).toMatchObject({ status: 'live', value: A })
    const B = 'dsh-resource://feed/two'
    await act(async () => { address.value = B; await settle() })
    expect(seat).toBe(firstSeat)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(seat?.value).toMatchObject({ status: 'live', value: B })
    await act(() => { address.value = undefined })
    expect(signals[1]?.aborted).toBe(true)
    expect(seat?.value).toBeUndefined()
    expect(open).toHaveBeenCalledTimes(2)
    await act(async () => { address.value = A; await settle() })
    expect(signals[2]?.aborted).toBe(false)
    await act(withdraw)
    expect(signals[2]?.aborted).toBe(true)
  })

  it('withdraws both on dispose, so a remount registers again without a duplicate', async () => {
    runtime = await boot()
    const handle = await runtime.mount({ inject: [...inject], apply })
    await handle.dispose()
    expect(runtime.ctx.get('resources')).toBeUndefined()

    // Records only whether the standard hook is present on a root-scope component's props.
    let hook: UseResource | undefined
    runtime.slots.register({ name: 'resources.probe' }, defineComponent((props: { useResource?: UseResource }) => {
      watchEffect(() => { hook = props.useResource })
      return () => null
    }, { props: ['useResource'] }))
    await runtime.renderSlot('resources.probe', {})
    expect(hook).toBeUndefined()

    await runtime.mount({ inject: [...inject], apply })
    await act(async () => { await settle() })
    expect(hook).toBeTypeOf('function')
  })

  it('shares one address across independently bound views without reopening on rebinding', async () => {
    runtime = await boot()
    const rt = runtime
    const firstId = await rt.sessions.add({ id: 'first-session' })
    const secondId = await rt.sessions.add({ id: 'second-session' })
    const firstReference = rt.sessions.retain(firstId)
    await firstReference.ready
    const secondReference = rt.sessions.retain(secondId)
    await secondReference.ready
    await rt.mount({ inject: [...inject], apply })
    const opened = Promise.withResolvers<undefined>()
    const open = vi.fn<ResourceProvider<'feed'>['open']>(async function* () {
      try { yield { ok: true as const, value: 'shared data' } } finally { opened.resolve(undefined) }
    })
    await act(async () => {
      rt.ctx.effect(() => rt.ctx.resources.register({ protocol: 'feed', open }), 'spec: shared address')
    })
    const source = rt.ctx.resources.source(A)
    const seen: {
      root?: Readonly<ShallowRef<ResourceSnapshot<string>>>
      first?: Readonly<ShallowRef<ResourceSnapshot<string>>>
      second?: Readonly<ShallowRef<ResourceSnapshot<string>>>
      firstSession?: string
      secondSession?: string
    } = {}
    rt.slots.register({ name: 'resources.probe' }, defineComponent((props: PropsRuntime<'resources.probe'>) => {
      seen.root = props.useResource<'feed'>(A)

      return () => null
    }, { props: ['useResource'] }))
    rt.slots.register({ name: 'resources.sessionProbe' }, defineComponent((props: PropsRuntime<'resources.sessionProbe'>) => {
      seen.first = props.useResource<'feed'>(A)
      watchEffect(() => { seen.firstSession = props.sessionId })
      return () => null
    }, { props: ['useResource', 'sessionId'] }))
    rt.slots.register({ name: 'resources.sessionPeer' }, defineComponent((props: PropsRuntime<'resources.sessionPeer'>) => {
      seen.second = props.useResource<'feed'>(A)
      watchEffect(() => { seen.secondSession = props.sessionId })
      return () => null
    }, { props: ['useResource', 'sessionId'] }))
    await rt.renderSlot('resources.probe', {})
    const firstView = await rt.renderSlot('resources.sessionProbe', {}, { session: firstReference })
    const secondView = await rt.renderSlot('resources.sessionPeer', {}, { session: secondReference })
    await act(async () => { await opened.promise })
    const snapshot = source.getSnapshot()
    expect(snapshot).toEqual({ status: 'live', value: 'shared data', failure: undefined })
    expect(seen.root?.value).toBe(snapshot)
    expect(seen.first?.value).toBe(snapshot)
    expect(seen.second?.value).toBe(snapshot)
    expect([seen.firstSession, seen.secondSession]).toEqual([firstId, secondId])
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]![0]).toBe(A)
    expect(open.mock.calls[0]![1]).toStrictEqual({ signal: expect.any(AbortSignal) as AbortSignal })

    const replacement = rt.sessions.retain(secondId)
    await replacement.ready
    await firstView.update({}, { session: replacement })
    firstReference.release()
    await secondView.update({})
    expect([seen.firstSession, seen.secondSession]).toEqual([secondId, secondId])
    expect(rt.ctx.resources.source(A)).toBe(source)
    expect(seen.root?.value).toBe(snapshot)
    expect(seen.first?.value).toBe(snapshot)
    expect(seen.second?.value).toBe(snapshot)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]![1].signal.aborted).toBe(false)
  })
})
