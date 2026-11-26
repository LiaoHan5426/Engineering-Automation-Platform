import { Button, IconFolder, IconPlus, IconX } from '@eap/ui'
import { createElement, type ComponentType } from 'react'
import { createReactSlotWrapper } from './reactSlotBridge'
import { computed, defineComponent, h, onScopeDispose, ref, shallowRef } from 'vue'
import { canonicalSlotName } from './layoutNames'
import type { EapSlotRegistry } from './slotRegistry'

export const WORKSPACE_SEAT = 'eap'

type GuideEntry = {
  id: string
  title: () => string
  description?: () => string
  icon?: ComponentType<{ size: number }>
  order?: number
}

const GuideIcon = createReactSlotWrapper(({ icon }) =>
  createElement(icon as NonNullable<GuideEntry['icon']>, { size: 18 }),
)

type TabType = {
  id: string
  kind: string
  title: (address?: string) => string
  guide?: readonly GuideEntry[]
  canOpen?: (address: string) => boolean
}
type OpenOptions = { params?: Record<string, unknown>; revealIfOpened?: boolean }

export function createSidebarSeat(
  slots: EapSlotRegistry,
  column: HTMLElement,
  startLabel: () => string = () => 'Start',
  newTabLabel: () => string = () => 'New tab',
) {
  const types = shallowRef<TabType[]>([])
  const guideId = 'eap-guide'
  const activeId = ref(guideId)
  const closeHandlers = new Map<string, () => void>()
  const tabs = shallowRef<
    Array<{
      id: string
      kind: string
      typeId: string
      title: string
      contentId?: string
      navigation: { params?: Record<string, unknown>; revision: number }
      lifetime: AbortController
    }>
  >([createGuide()])
  let sequence = 0

  function createGuide() {
    return {
      id: guideId,
      kind: '',
      typeId: '',
      title: '',
      navigation: { revision: 0 },
      lifetime: new AbortController(),
    }
  }

  function showGuide() {
    if (!tabs.value.some((tab) => tab.id === guideId)) tabs.value = [...tabs.value, createGuide()]
    activeId.value = guideId
  }

  function close(id: string) {
    const index = tabs.value.findIndex((item) => item.id === id)
    const tab = tabs.value[index]
    if (!tab) return
    if (id !== guideId) closeHandlers.get(tab.kind)?.()
    tab.lifetime.abort()
    tabs.value = tabs.value.filter((item) => item.id !== id)
    if (tabs.value.length === 0) {
      showGuide()
      column.setAttribute('data-collapsed', '')
    } else if (activeId.value === id) {
      activeId.value = (tabs.value[index] ?? tabs.value[index - 1])?.id ?? guideId
    }
  }

  function open(
    type: TabType | undefined,
    options: OpenOptions = {},
    address?: string,
    replaceGuide = false,
  ) {
    if (!type) return undefined
    const existing =
      options.revealIfOpened !== false
        ? tabs.value.find((tab) => tab.typeId === type.id && tab.contentId === address)
        : undefined
    const id = existing?.id ?? `eap-tab-${++sequence}`
    const tab = {
      id,
      kind: type.kind,
      typeId: type.id,
      title: type.title(address),
      contentId: address,
      navigation: { params: options.params, revision: (existing?.navigation.revision ?? 0) + 1 },
      lifetime: existing?.lifetime ?? new AbortController(),
    }
    const guide = replaceGuide ? tabs.value.find((item) => item.id === guideId) : undefined
    if (existing) {
      tabs.value = tabs.value.map((item) => (item.id === id ? tab : item))
      activeId.value = id
      if (guide) close(guideId)
    } else if (guide) {
      guide.lifetime.abort()
      tabs.value = tabs.value.map((item) => (item.id === guideId ? tab : item))
    } else {
      tabs.value = [...tabs.value, tab]
    }
    activeId.value = id
    column.removeAttribute('data-collapsed')
    return id
  }

  const registry = {
    register(type: TabType) {
      types.value = [...types.value, type]
      return () => {
        for (const tab of tabs.value.filter(
          (item) => item.id !== guideId && item.typeId === type.id,
        ))
          close(tab.id)
        types.value = types.value.filter((item) => item !== type)
      }
    },
    get: (kind: string) => [...types.value].reverse().find((type) => type.kind === kind),
  }

  const controller = {
    mounted: {
      getSnapshot: () => WORKSPACE_SEAT,
      subscribe: () => () => {},
    },
    openTab: (kind: string, options?: OpenOptions) => open(registry.get(kind), options),
    openResource: (address: string, options?: OpenOptions) =>
      open(
        [...types.value].reverse().find((type) => type.canOpen?.(address)),
        options,
        address,
      ),
    registerCloseHandler(kind: string, handler: () => void) {
      closeHandlers.set(kind, handler)
      return () => {
        if (closeHandlers.get(kind) === handler) closeHandlers.delete(kind)
      }
    },
  }

  const View = defineComponent({
    name: 'DshSidebarSeat',
    setup() {
      const guide = computed(() =>
        types.value
          .filter((type) => registry.get(type.kind) === type)
          .flatMap((type) => (type.guide ?? []).map((entry) => ({ type, entry })))
          .sort((a, b) => (a.entry.order ?? 100) - (b.entry.order ?? 100)),
      )
      const expanded = ref(!column.hasAttribute('data-collapsed'))
      const observer = new MutationObserver(() => {
        expanded.value = !column.hasAttribute('data-collapsed')
      })
      observer.observe(column, { attributes: true, attributeFilter: ['data-collapsed'] })
      onScopeDispose(() => observer.disconnect())
      const body = canonicalSlotName('sidebar.right.pane.tab')
      const title = canonicalSlotName('sidebar.right.pane.tab.title')
      return () => {
        if (types.value.length === 0) return null
        const pages = tabs.value.map((tab) => {
          const info = computed(() => ({
            sidebar: {
              expanded: expanded.value,
              fullscreen: false,
            },
            panel: { id: 'eap-sidebar', isFloating: false },
            tab: {
              ...tab,
              visible: activeId.value === tab.id && expanded.value,
              signal: tab.lifetime.signal,
              actions: { close: () => close(tab.id) },
            },
          }))
          return { tab, input: { sessionId: WORKSPACE_SEAT, useTabInfo: () => info } }
        })

        return h('div', { class: 'eap-dsh-sidebar-seat', 'data-testid': 'dsh-sidebar-seat' }, [
          h('div', { class: 'eap-dsh-sidebar-seat__actions' }, [
            ...pages.map(({ tab, input }) => {
              const isGuide = tab.id === guideId
              const label = isGuide ? startLabel() : tab.title
              return h(
                'div',
                {
                  key: tab.id,
                  class: 'eap-dsh-sidebar-seat__tab',
                  'data-active': activeId.value === tab.id ? '' : undefined,
                },
                [
                  h(
                    Button,
                    {
                      size: 'sm',
                      variant: 'ghost',
                      class: 'eap-dsh-sidebar-seat__tab-label',
                      'aria-label': label,
                      title: label,
                      'aria-pressed': activeId.value === tab.id,
                      onClick: () => {
                        activeId.value = tab.id
                      },
                    },
                    () =>
                      h(
                        'span',
                        { class: 'eap-dsh-sidebar-seat__tab-title' },
                        !isGuide &&
                          slots
                            .entriesOfSlot('sidebar.right.pane.tab.title')
                            .some((entry) => entry.options.key === tab.typeId)
                          ? [slots.renderSlot(title, input, { entryKey: tab.typeId })]
                          : label,
                      ),
                  ),
                  h(
                    Button,
                    {
                      size: 'sm',
                      variant: 'icon',
                      class: 'eap-dsh-sidebar-seat__tab-close',
                      'aria-label': `× ${label}`,
                      onClick: () => close(tab.id),
                    },
                    () => h(IconX, { size: 14, 'aria-hidden': 'true' }),
                  ),
                ],
              )
            }),
            activeId.value !== guideId
              ? h(
                  Button,
                  {
                    size: 'sm',
                    variant: 'icon',
                    'aria-label': newTabLabel(),
                    onClick: showGuide,
                  },
                  () => h(IconPlus),
                )
              : null,
          ]),
          activeId.value !== guideId
            ? null
            : h(
                'div',
                { class: 'eap-dsh-sidebar-seat__guide', 'data-testid': 'dsh-sidebar-guide' },
                guide.value.map(({ type, entry }) => {
                  const description = entry.description?.()
                  return h(
                    Button,
                    {
                      key: `${type.id}:${entry.id}`,
                      class: 'eap-dsh-sidebar-seat__guide-entry',
                      variant: 'secondary',
                      onClick: () => open(type, {}, undefined, true),
                    },
                    () => [
                      entry.icon
                        ? h(GuideIcon, { icon: entry.icon, 'aria-hidden': 'true' })
                        : type.kind === 'files'
                          ? h(IconFolder, { size: 18, class: 'eap-dsh-guide-folder' })
                          : null,
                      h('span', { class: 'eap-dsh-sidebar-seat__guide-copy' }, [
                        h('span', entry.title()),
                        description ? h('small', description) : null,
                      ]),
                    ],
                  )
                }),
              ),
          ...pages
            .filter(({ tab }) => tab.id !== guideId)
            .map(({ tab, input }) =>
              h(
                'section',
                {
                  key: tab.id,
                  class: 'eap-dsh-sidebar-seat__body',
                  hidden: activeId.value !== tab.id,
                },
                [slots.renderSlot(body, input, { entryKey: tab.typeId })],
              ),
            ),
        ])
      }
    },
  })

  function dispose() {
    for (const tab of tabs.value) tab.lifetime.abort()
    tabs.value = []
    types.value = []
    closeHandlers.clear()
  }

  return { registry, controller, View, dispose }
}
