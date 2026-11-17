/** Vue setup-owned selectors over domain-owned immutable snapshot sources. */
import {
  computed,
  effectScope,
  isRef,
  isReadonly,
  onScopeDispose,
  shallowReadonly,
  shallowRef,
  toValue,
  watch,
  type Ref,
} from 'vue'
import {
  standardHookPropName,
  type HostObservable,
  type KeyedStandardSource,
} from '@deepseek-ai/dsh-client-ui-slots'
import { SlotAssemblyError } from '../errors.ts'
import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-primitives'

/** Named values supplied to a component or contextual hook. */
export type Face = Record<string, unknown>
type Select = (value: unknown) => unknown
type Equal = (left: unknown, right: unknown) => boolean
type Key = string | Readonly<Ref<string | undefined>>
const identity: Select = value => value

/** A hook follows its source getter throughout the component's setup lifetime.
 * @param source - getter for the current immutable snapshot source.
 * @returns a setup hook that selects a readonly snapshot ref.
 */
export function selectorSeat(
  source: () => HostObservable<unknown> | undefined,
): (select?: Select, equal?: Equal) => Readonly<Ref<unknown>> {
  return (select: Select = identity, equal?: Equal) =>
    useObservableSelector(source, () => select, equal)
}

/** Explicit keys may be refs; the selector-only form follows the inherited session key.
 * @param source - getter for the current keyed source resolver.
 * @param defaultKey - getter for the inherited Session identity.
 * @returns a setup hook selecting the current keyed snapshot.
 */
export function keyedSeat(
  source: () => KeyedStandardSource | undefined,
  defaultKey: () => string | undefined,
): (
  keyOrSelect?: Key | Select,
  memberOrSelect?: string | Select | Equal,
  equal?: Equal,
) => Readonly<Ref<unknown>> {
  return (keyOrSelect?: Key | Select, memberOrSelect?: string | Select | Equal, equal?: Equal) => {
    const explicit = typeof keyOrSelect === 'string' || isRef(keyOrSelect)
    const member = explicit && typeof memberOrSelect === 'string' ? memberOrSelect : undefined
    const select = explicit
      ? typeof memberOrSelect === 'function'
        ? (memberOrSelect as Select)
        : identity
      : (keyOrSelect ?? identity)
    const compare = explicit ? equal : (memberOrSelect as Equal | undefined)
    return useObservableSelector(
      () => {
        const key = explicit ? toValue(keyOrSelect) : defaultKey()
        const resolver = source()
        return key === undefined || resolver === undefined
          ? undefined
          : member === undefined
            ? resolver(key)
            : resolver(key, member)
      },
      () => select,
      compare,
    )
  }
}

/** Bind bare fixed/keyed inject sources while keeping source replacement reactive.
 * @param face - getter for the current injected values and sources.
 * @param defaultKey - getter for the inherited Session identity.
 * @returns reactive fixed and keyed setup hooks indexed by their standard names.
 */
export function bindSources(
  face: () => Face,
  defaultKey: () => string | undefined,
): Readonly<Ref<Face>> {
  const fixed = new Map<string, ReturnType<typeof selectorSeat>>()
  const keyed = new Map<string, ReturnType<typeof keyedSeat>>()
  return computed(() => {
    const bound: Face = {}
    for (const name of Object.keys(face()['hooks'] ?? {})) {
      let seat = fixed.get(name)
      if (seat === undefined) {
        seat = selectorSeat(
          () =>
            ((face()['hooks'] ?? {}) as Record<string, HostObservable<unknown> | undefined>)[name],
        )
        fixed.set(name, seat)
      }
      bound[standardHookPropName(name)] = seat
    }
    for (const name of Object.keys(face()['keyedHooks'] ?? {})) {
      let seat = keyed.get(name)
      if (seat === undefined) {
        seat = keyedSeat(
          () =>
            ((face()['keyedHooks'] ?? {}) as Record<string, KeyedStandardSource | undefined>)[name],
          defaultKey,
        )
        keyed.set(name, seat)
      }
      bound[standardHookPropName(name)] = seat
    }
    return bound
  })
}

/**
 * A contextual Hook owns a child scope for its factory, context, and framework values.
 * Equivalent wrappers retain the scope; changed inputs dispose it before rebinding.
 * @param factory - getter for the current contextual hook factory.
 * @param standard - getter for framework-provided values supplied to the factory.
 * @param context - getter for the current contextual value.
 * @returns a setup hook forwarding a reactive ref or retaining effect-only disposal.
 */
export function contextualSeat(
  factory: () => (standard: Face, context: unknown) => unknown,
  standard: () => Face,
  context: () => unknown,
): (...args: unknown[]) => Ref<unknown> | undefined {
  return (...args: unknown[]) => {
    const result = shallowRef<Readonly<Ref<unknown>>>()
    let kind: 'effect' | 'selector' | undefined
    let activeScope: ReturnType<typeof effectScope> | undefined
    let bound:
      | {
        factory: ReturnType<typeof factory>
        standard: Face
        context: unknown
      }
      | undefined
    const release = () => {
      result.value = undefined
      const previous = activeScope
      activeScope = undefined
      bound = undefined
      previous?.stop()
    }
    onScopeDispose(release)
    watch(
      () => ({ factory: factory(), standard: standard(), context: context() }),
      (current) => {
        // New props/options wrappers do not change the contextual binding. Only
        // the factory, context, or individual framework values own its lifetime.
        const previous = bound
        if (
          previous !== undefined &&
          Object.is(previous.factory, current.factory) &&
          Object.is(previous.context, current.context) &&
          Object.keys(previous.standard).length === Object.keys(current.standard).length &&
          Object.keys(previous.standard).every(
            key =>
              Object.hasOwn(current.standard, key) &&
              Object.is(previous.standard[key], current.standard[key]),
          )
        )
          return
        release()
        const scope = effectScope()
        activeScope = scope
        try {
          const selected = scope.run(() => {
            const hook = current.factory(current.standard, current.context)
            if (typeof hook !== 'function')
              throw new SlotAssemblyError('contextual hook factory must return a native Vue hook')
            return (hook as (...params: unknown[]) => unknown)(...args)
          })
          if (selected !== undefined && !isRef(selected))
            throw new SlotAssemblyError('contextual selector hook must return a Vue ref')
          const nextKind = selected === undefined ? 'effect' : 'selector'
          if (kind !== undefined && kind !== nextKind)
            throw new SlotAssemblyError('contextual hook return kind changed during rebinding')
          kind = nextKind
          bound = { ...current, standard: { ...current.standard } }
          result.value = selected
        } catch (error) {
          release()
          throw error
        }
      },
      { flush: 'sync', immediate: true },
    )
    if (kind === 'effect') return undefined
    if (isReadonly(result.value)) return shallowReadonly(computed(() => result.value?.value))
    // Contextual DOM seats own writable refs. Keep one forwarding ref while
    // rebinding its target, so Vue's ref writer reaches the current scope only.
    return computed({
      get: () => result.value?.value,
      set: (value: unknown) => {
        const target = result.value
        if (target !== undefined && !isReadonly(target)) (target as Ref<unknown>).value = value
      },
    })
  }
}
