import type {
  FactoryDefinition,
  MenuService,
  OverlayComponent,
  OverlayDefinition,
  Selector,
  Snapshot,
} from './contracts'
import { Context } from '@deepseek-ai/cordis'
import * as cordis from '@deepseek-ai/cordis'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
// Built from the immutable, digest-checked source roster; no runtime URL loading.
import {
  contextMenu,
  createClientModuleSystem,
  LocaleRuntime,
  ShortcutsService,
} from '../generated/original.js'

export interface MessageTarget {
  readonly conversationId: string
  readonly messageId: string
  readonly text: string
}
export interface MenuPorts {
  copyText(text: string): Promise<void>
  locale: string
  copyLabel: string
  failureLabel: string
}
import { browserManifest } from './graph'
const menuId = '@deepseek-ai/dsh-client-ui-context-menu'

/** A narrow shell.overlay/factory provider, owned by the existing EAP Chat lifetime. */
export async function mountContextMenu(element: HTMLElement, ports: MenuPorts) {
  const ctx = new Context()
  const root = createRoot(element)
  let disposed = false
  const factories = new Map<string, unknown>()
  let rootProps: Record<string, unknown> = {}
  const overlays = new Map<string, { definition: OverlayDefinition; component: OverlayComponent }>()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale(ports.locale.startsWith('zh') ? 'zh' : 'en')
  const render = () => {
    if (disposed) return
    root.render(
      React.createElement(
        React.Fragment,
        null,
        ...[...overlays].map(([id, entry]) => {
          const instance = entry.definition.store.create()
          const injected = entry.definition.inject()
          const useSnapshot = (source: Snapshot, select: Selector) =>
            select(
              React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot),
            )
          return React.createElement(entry.component, {
            key: id,
            ...rootProps,
            ...injected,
            useCatalog: (select: Selector) => useSnapshot(injected.hooks.catalog, select),
            useStore: (select: Selector) => useSnapshot(instance, select),
            actions: instance.actions,
            renderSlot: () => null,
            t: locale.bind(entry.definition.locale),
          })
        }),
      ),
    )
  }
  ctx.provide('locale', locale)
  const slots = {
    registerFactory(definition: FactoryDefinition, component: unknown) {
      if (factories.has(definition.name)) throw new Error('DSH_DUPLICATE_FACTORY')
      factories.set(definition.name, { definition, component })
      ctx.effect(() => () => {
        factories.delete(definition.name)
      })
    },
    provideRoot(input: { props: Record<string, unknown> }) {
      if (typeof input.props.useContextMenu !== 'function')
        throw new Error('DSH_UNSUPPORTED_ROOT_CONTRIBUTION')
      rootProps = input.props
      ctx.effect(() => () => {
        rootProps = {}
      })
    },
    inject(name: string, register: () => () => void) {
      if (name !== 'shell.overlay') throw new Error('DSH_UNSUPPORTED_SLOT')
      ctx.effect(register, 'eap shell.overlay')
    },
    register(definition: OverlayDefinition, component: OverlayComponent) {
      if (definition.name !== 'shell.overlay' || overlays.has(definition.id))
        throw new Error('DSH_UNSUPPORTED_OVERLAY')
      overlays.set(definition.id, { definition, component })
      render()
      return () => {
        overlays.delete(definition.id)
        render()
      }
    },
  }
  ctx.provide('slots', slots)
  const facade = { mode: 'queue', pendingQueue: [], load: undefined }
  const modules = createClientModuleSystem(
    facade,
    { id: '@eap/dsh-bootstrap', exports: {} },
    {
      boot: browserManifest,
      staticModules: [
        { id: 'react', factory: () => React },
        { id: '@deepseek-ai/cordis', factory: () => cordis },
        { id: '@deepseek-ai/dsh-client-locale', factory: () => ({ LocaleRuntime }) },
        { id: '@deepseek-ai/dsh-client-ui-layout', factory: () => ({ slots: slots }) },
        { id: '@deepseek-ai/dsh-client-shortcuts', factory: () => ({ default: ShortcutsService }) },
        {
          id: menuId,
          factory: (require: (id: string) => Record<string, unknown>) => {
            if (require('react') !== React || require('@deepseek-ai/cordis').Context !== Context)
              throw new Error('DSH_SHARED_IDENTITY_MISMATCH')
            return contextMenu
          },
        },
      ],
      loadBundle: () => {
        throw new Error('DSH_UNREVIEWED_RESOURCE')
      },
    },
  )
  try {
    await ctx.plugin(ShortcutsService).await()
    const plugin = await modules.import(menuId + '/client')
    for (const service of plugin.inject)
      if (!(ctx as unknown as Record<string, unknown>)[service])
        throw new Error(`DSH_MISSING_SERVICE:${service}`)
    await ctx.plugin(plugin).await()
    const menus = (ctx as unknown as { contextMenus: MenuService }).contextMenus
    if (!menus) throw new Error('DSH_MENU_ACTIVATION_FAILED')
    const unregister = menus.register({
      id: 'eap.copy-message',
      target: 'eap.message',
      order: 0,
      resolve: (target: MessageTarget) => [
        {
          id: 'copy',
          label: ports.copyLabel,
          failureLabel: ports.failureLabel,
          run: () => ports.copyText(target.text),
        },
      ],
    })
    return {
      open(event: MouseEvent, target: MessageTarget) {
        if (disposed) return false
        const captured = Object.freeze({
          conversationId: target.conversationId,
          messageId: target.messageId,
          text: target.text,
        })
        event.preventDefault()
        const bounds =
          event.currentTarget instanceof Element
            ? event.currentTarget.getBoundingClientRect()
            : null
        menus.open(
          { kind: 'eap.message', value: captured },
          { x: event.clientX || bounds?.left || 0, y: event.clientY || bounds?.bottom || 0 },
        )
        return true
      },
      setLocale(value: string) {
        locale.setLocale(value.startsWith('zh') ? 'zh' : 'en')
        render()
      },
      async dispose() {
        if (disposed) return
        disposed = true
        unregister()
        await ctx.fiber.dispose()
        root.unmount()
        await modules.dispose()
      },
    }
  } catch (error) {
    disposed = true
    await ctx.fiber.dispose()
    root.unmount()
    await modules.dispose()
    throw error
  }
}
