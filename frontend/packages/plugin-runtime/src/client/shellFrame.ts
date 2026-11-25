import {
  defineComponent,
  Fragment,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  Teleport,
  type Component,
  type VNodeChild,
} from 'vue'
import { withShellRoot } from './layoutFacade'
import {
  LAYOUT_FACTORIES,
  LAYOUT_OCCUPANTS,
  LAYOUT_SLOTS,
  ROOT_OUTLETS,
} from './layoutSlots'

const SESSION = { sessionId: 'eap' }

type SlotRecord = (typeof LAYOUT_SLOTS)[number]
type RenderSlot = (key: string, input: object, options?: object) => VNodeChild
type RenderFactory = (name: string, input: object) => VNodeChild

type SlotApi = {
  register: (options: object, component?: unknown) => () => void
  registerFactory: (options: object, component?: unknown) => () => void
  inject: (key: string, callback: () => () => void) => () => void
  entries: (key: string) => readonly { options?: { key?: string } }[]
  subscribe: (key: string, fn: () => void) => () => void
}

const BY_KEY = new Map<string, SlotRecord>(LAYOUT_SLOTS.map((slot) => [slot.key, slot]))

function childSpec(key: string): { kind: string; scope: string } {
  const slot = BY_KEY.get(key)
  if (!slot) throw new Error(`unknown slot "${key}"`)
  return { kind: slot.kind, scope: slot.scope }
}

function bandOf(key: string): 'header' | 'dock' | 'body' {
  if (
    key === 'conversation.header' ||
    key.startsWith('conversation.header.') ||
    key.startsWith('conversation.session.header')
  ) {
    return 'header'
  }
  if (
    key === 'conversation.composer' ||
    key.startsWith('conversation.composer.') ||
    key.startsWith('conversation.input.')
  ) {
    return 'dock'
  }
  return 'body'
}

function createHost(slots: SlotApi, childKeys: readonly string[], rightbarOwner?: object): Component {
  return defineComponent({
    name: 'EapLayoutHost',
    props: ['renderSlot', 'renderSlotChain', 'renderFactorySlot', 'SessionProvider'],
    setup(props) {
      const tick = ref(0)
      const stops: Array<() => void> = []
      onMounted(() => {
        for (const key of childKeys) {
          if (BY_KEY.get(key)?.kind !== 'keyed') continue
          stops.push(slots.subscribe(key, () => { tick.value += 1 }))
        }
      })
      onBeforeUnmount(() => {
        while (stops.length) stops.pop()?.()
      })
      return () => {
        void tick.value
        const renderSlot = props.renderSlot as RenderSlot
        const renderSlotChain = props.renderSlotChain as RenderSlot | undefined
        const groups: Record<'header' | 'body' | 'dock', VNodeChild[]> = {
          header: [],
          body: [],
          dock: [],
        }
        for (const key of childKeys) {
          groups[bandOf(key)].push(renderChild(renderSlot, renderSlotChain, key, rightbarOwner))
        }
        const bands = (['header', 'body', 'dock'] as const).map((name) =>
          groups[name].length
            ? h('div', { 'data-dsh-band': name, style: { display: 'contents' } }, groups[name])
            : null,
        )
        const body = h('div', { style: { display: 'contents' } }, bands)
        const SessionProvider = props.SessionProvider as Component | undefined
        if (!SessionProvider) return body
        return h(SessionProvider, { session: SESSION, children: body }, () => body)
      }
    },
  })
}

function renderChild(
  renderSlot: RenderSlot,
  renderSlotChain: RenderSlot | undefined,
  key: string,
  rightbarOwner?: object,
): VNodeChild {
  const slot = BY_KEY.get(key)
  if (!slot) throw new Error(`unknown slot "${key}"`)
  const input = key === 'rightbar' && rightbarOwner ? rightbarOwner : {}
  if (slot.kind === 'chain') {
    if (!renderSlotChain) return null
    return renderSlotChain(key, input)
  }
  if (slot.kind !== 'keyed') return renderSlot(key, input)
  return renderSlot(key, input, { entryKey: 'eap-layout' })
}

function createRootFrame(slots: SlotApi, rightbarOwner: object): Component {
  const rootChildren = LAYOUT_OCCUPANTS.find((item) => item.parent === 'root')?.children ?? []
  const byOutlet = new Map<string, string[]>()
  for (const key of rootChildren) {
    const outlet = ROOT_OUTLETS[key as keyof typeof ROOT_OUTLETS]
    const list = byOutlet.get(outlet) ?? []
    list.push(key)
    byOutlet.set(outlet, list)
  }
  return defineComponent({
    name: 'EapLayoutRoot',
    props: ['renderSlot', 'renderSlotChain', 'renderFactorySlot', 'SessionProvider'],
    setup(props) {
      const tick = ref(0)
      const stops: Array<() => void> = []
      onMounted(() => {
        for (const key of rootChildren) {
          if (BY_KEY.get(key)?.kind !== 'keyed') continue
          stops.push(slots.subscribe(key, () => { tick.value += 1 }))
        }
      })
      onBeforeUnmount(() => {
        while (stops.length) stops.pop()?.()
      })
      return () => {
        void tick.value
        const renderSlot = props.renderSlot as RenderSlot
        const renderSlotChain = props.renderSlotChain as RenderSlot | undefined
        const renderFactory = props.renderFactorySlot as RenderFactory
        const place = (outlet: string) =>
          (byOutlet.get(outlet) ?? []).map((key) =>
            renderChild(renderSlot, renderSlotChain, key, rightbarOwner),
          )
        const factories = (outlet: string) =>
          LAYOUT_FACTORIES.filter((factory) => factory.outlet === outlet).map((factory) =>
            renderFactory(factory.name, {}),
          )
        return h(Fragment, [
          ...place('shell'),
          ...factories('shell'),
          h(Teleport, { to: '#eap-dsh-region-conversation' }, [
            ...place('conversation'),
            ...factories('conversation'),
          ]),
          h(Teleport, { to: '#eap-dsh-region-settings' }, factories('settings')),
          h(Teleport, { to: '#eap-dsh-region-sidebar-leading' }, [
            ...place('sidebar-leading'),
            ...factories('sidebar-leading'),
          ]),
          h(Teleport, { to: '#eap-cordis-sidebar-right' }, place('sidebar-right')),
        ])
      }
    },
  })
}

function occupantOptions(parent: string, children: readonly string[]): Record<string, unknown> {
  const slot = BY_KEY.get(parent)
  const options: Record<string, unknown> = {
    name: parent,
    children: Object.fromEntries(children.map((key) => [key, childSpec(key)])),
  }
  if (slot?.kind === 'keyed') options.key = 'eap-layout'
  if (slot?.kind === 'list' || slot?.kind === 'hoc') options.id = 'eap-layout'
  if (slot?.kind === 'chain') options.select = () => null
  if (slot?.kind === 'single') options.priority = 1
  return options
}

/** Declare every shell-owned catalog seat and render root into the five outlets. */
export function installShellLayout(slots: SlotApi, rightbarOwner: object): () => void {
  const stops: Array<() => void> = []
  const rootChildren = LAYOUT_OCCUPANTS.find((item) => item.parent === 'root')?.children ?? []
  stops.push(
    withShellRoot(() =>
      slots.register(
        {
          name: 'root',
          children: Object.fromEntries(rootChildren.map((key) => [key, childSpec(key)])),
        },
        createRootFrame(slots, rightbarOwner),
      ),
    ),
  )
  for (const factory of LAYOUT_FACTORIES) {
    stops.push(
      slots.registerFactory(
        {
          name: factory.name,
          scope: factory.scope,
          children: Object.fromEntries(factory.children.map((key) => [key, childSpec(key)])),
        },
        createHost(slots, factory.children),
      ),
    )
  }

  const occupants = LAYOUT_OCCUPANTS.filter((item) => item.parent !== 'root')
  const declared = new Set<string>([
    ...rootChildren,
    ...LAYOUT_FACTORIES.flatMap((factory) => factory.children),
  ])
  const done = new Set<string>()
  const registerOccupant = (parent: string, children: readonly string[]) =>
    slots.register(occupantOptions(parent, children), createHost(slots, children, rightbarOwner))

  const drain = () => {
    let moved = true
    while (moved) {
      moved = false
      for (const occupant of occupants) {
        if (done.has(occupant.parent)) continue
        if (!declared.has(occupant.parent)) continue
        stops.push(registerOccupant(occupant.parent, occupant.children))
        done.add(occupant.parent)
        for (const child of occupant.children) declared.add(child)
        moved = true
      }
    }
  }
  drain()
  for (const occupant of occupants) {
    if (done.has(occupant.parent)) continue
    stops.push(
      slots.inject(occupant.parent, () => {
        const stop = registerOccupant(occupant.parent, occupant.children)
        done.add(occupant.parent)
        for (const child of occupant.children) declared.add(child)
        drain()
        return stop
      }),
    )
  }
  return () => {
    while (stops.length) {
      try {
        stops.pop()?.()
      } catch {
        /* dispose continues */
      }
    }
  }
}
