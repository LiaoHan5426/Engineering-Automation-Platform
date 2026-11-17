// @vitest-environment jsdom
import { h, nextTick, shallowRef, unref } from 'vue'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { VNodeChild } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  render as nativeRender,
} from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent as domEvent, waitFor } from '@testing-library/dom'
import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PaneId, TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import {
  createBrowserControllers,
  type BrowserControllerState,
  type BrowserInjected,
} from '../src/client/browser/BrowserController.ts'
import { createBrowserStore } from '../src/client/browser/store.ts'
import type { BrowserBodyProps } from '../src/client/view/BrowserBody.tsx'
import { BrowserBody } from '../src/client/view/BrowserBody.tsx'
import { WEB_BROWSER_SANDBOX } from '../src/client/view/IframePresentation.ts'
import { createIframePage } from '../src/client/pages.ts'
import { zh } from '../src/client/locales.ts'
import {
  browserAddressCheckpoint,
  type BrowserTabState,
} from '../src/client/browser/BrowserPersistence.ts'
import type { BrowserPageFactory, BrowserPageOptions } from '../src/client/browser/BrowserPage.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { emptyBrowserFrame, type BrowserFrameState } from '../src/client/browser/BrowserFrame.ts'
const SESSION = 'session' as SessionId
const TAB = 'tab' as TabId
const messages: Readonly<Record<string, string>> = zh
const lifetimes = new Set<AbortController>()
const controllers: BrowserInjected[] = []
let mountSequence = 0
const absentState = {
  subscribe:
    (_listener: () => void): (() => void) =>
      () => {},
  getSnapshot: (): BrowserControllerState | undefined => undefined,
}
async function mountBrowser(
  navigation?: {
    readonly url?: string
  },
  options: {
    initial?: BrowserTabState
    createPage?: BrowserPageFactory
    refreshShortcut?: ReturnType<BrowserBodyProps['useTabInfo']>['value']['tab']['refreshShortcut']
  } = {},
) {
  const store = createBrowserStore().create(`browser-body-test-${String(++mountSequence)}`)
  if (options.initial !== undefined) store.actions.replace(TAB, options.initial)
  const lifetime = new AbortController()
  lifetimes.add(lifetime)
  const injected = createBrowserControllers(
    store.actions,
    options.createPage ?? createIframePage,
    () => true,
  )
  controllers.push(injected)
  const { keyedHooks, ...commands } = injected
  const tabActions = {
    bindCommands: vi.fn<
      ReturnType<BrowserBodyProps['useTabInfo']>['value']['tab']['actions']['bindCommands']
    >(() => vi.fn()),
    openResource: vi.fn(),
    openTab: vi.fn(),
    close: vi.fn(),
  }
  const info = shallowRef({
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane' as PaneId, isFloating: false },
    tab: {
      id: TAB,
      kind: 'browser',
      title: 'Browser',
      contentId: 'sidebar://browser/1',
      visible: true,
      navigation: { address: 'sidebar://browser/1', params: navigation, revision: 0 },
      signal: lifetime.signal,
      actions: tabActions,
      refreshShortcut: options.refreshShortcut,
    },
  })
  const props: Pick<
    BrowserBodyProps,
    'sessionId' | 'useTabInfo' | 'useStore' | 'actions' | 't' | 'useBrowserState'
  > &
    Omit<BrowserInjected, 'keyedHooks'> = {
      sessionId: SESSION,
      useTabInfo: () => info,
      useStore: bindSnapshotSelector(store),
      actions: store.actions,
      t: (key, params) => {
        const template = messages[key] ?? key
        return params === undefined
          ? template
          : template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name]))
      },
      ...commands,
      useBrowserState: (key: Parameters<BrowserBodyProps['useBrowserState']>[0]) =>
        useObservableSelector(
          () => {
            const id = unref(key)
            return id === undefined ? absentState : (keyedHooks.browserState(id) ?? absentState)
          },
          () => value => value,
        ),
    }
  const renderBody = async () => await render(h(BrowserBody, { ...(props as BrowserBodyProps) }))
  return {
    view: await renderBody(),
    remount: renderBody,
    store,
    lifetime,
    injected,
    tabActions,
    info,
  }
}
afterEach(async () => {
  cleanup()
  await Promise.all(controllers.splice(0).map(controller => controller.dispose()))
  for (const lifetime of lifetimes) lifetime.abort()
  lifetimes.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})
describe('BrowserBody', () => {
  it('displays the effective browser refresh accelerator', async () => {
    const mounted = await mountBrowser(undefined, {
      refreshShortcut: {
        id: 'page.refresh' as never,
        label: 'Refresh',
        aliases: [],
        binding: null,
        keys: ['Ctrl', 'R'],
        aria: 'Control+R',
        modified: true,
        conflicts: [],
        issue: null,
      },
    })
    expect(
      mounted.view.getByRole('button', { name: zh.reload }).getAttribute('aria-keyshortcuts'),
    ).toBe('Control+R')
  })
  it('retains the mounted browser and refresh binding across tab visibility and navigation-info publications', async () => {
    const mounted = await mountBrowser({ url: 'https://retained.example/' })
    const frame = mounted.view.container.querySelector('iframe')
    expect(frame).not.toBeNull()
    const bindingResult = mounted.tabActions.bindCommands.mock.results[0]!
    if (bindingResult.type !== 'return') throw new Error('Expected a command binding disposer')
    const release = bindingResult.value
    const previous = mounted.info.value
    await act(() => {
      mounted.info.value = {
        ...previous,
        tab: {
          ...previous.tab,
          visible: false,
          navigation: {
            ...previous.tab.navigation,
            revision: previous.tab.navigation.revision + 1,
          },
        },
      }
    })
    expect(mounted.view.container.querySelector('iframe')).toBe(frame)
    expect(mounted.tabActions.bindCommands).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
    mounted.view.unmount()
    expect(release).toHaveBeenCalledTimes(1)
    expect(frame?.isConnected).toBe(false)
  })
  it('shows the saved title and URL without loading until Restore is clicked', async () => {
    const target = {
      kind: 'https' as const,
      url: 'https://saved.example/page',
      title: 'Saved title',
    }
    const mounted = await mountBrowser(undefined, { initial: browserAddressCheckpoint(target, 1) })
    expect(mounted.view.getByText(target.title)).toBeDefined()
    expect(mounted.view.getByText(target.url)).toBeDefined()
    expect(mounted.view.container.querySelector('iframe')).toBeNull()
    expect(mounted.view.getByRole('button', { name: zh.reload })).toHaveProperty('disabled', false)
    await fireEvent.click(mounted.view.getByRole('button', { name: zh['restore.action'] }))
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.src).toBe(target.url)
    })
    expect(mounted.view.queryByText(target.title)).toBeNull()
  })
  it('renders native error details and routes provider open requests through the source tab', async () => {
    const state = createSnapshotStore<BrowserFrameState>({
      ...emptyBrowserFrame(),
      error: { code: -105, description: 'DNS failure' },
    })
    const providers: BrowserPageOptions[] = []
    const mounted = await mountBrowser(undefined, {
      createPage: (options) => {
        providers.push(options)
        return {
          presentation: { mount: () => () => {} },
          frame: {
            getSnapshot: () => state.getSnapshot(),
            subscribe: listener => state.subscribe(listener),
            loadUrl: vi.fn(),
            goBack: vi.fn(),
            goForward: vi.fn(),
            reload: vi.fn(),
            dispose: async () => {},
          },
        }
      },
    })
    expect(mounted.view.getByRole('status').textContent).toContain('DNS failure')
    expect(mounted.view.getByRole('status').textContent).toContain('-105')
    await act(() => {
      state.set({ ...state.getSnapshot(), error: { code: -105, description: undefined } })
    })
    expect(mounted.view.getByRole('status').textContent).toBe(zh['load.failed'])
    await act(() => {
      providers[0]!.openRequested('https://new.example/')
    })
    expect(mounted.tabActions.openTab).toHaveBeenCalledExactlyOnceWith('browser', {
      params: { url: 'https://new.example/' },
      revealIfOpened: false,
    })
  })
  it('routes address input to the controller and renders parser failures', async () => {
    const mounted = await mountBrowser()
    const input = mounted.view.getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'javascript:alert(1)' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.getByRole('alert').textContent).toBe(zh['error.protocol'])
    })
    expect(input).toHaveProperty('value', 'javascript:alert(1)')
    expect(mounted.view.container.querySelector('iframe')).toBeNull()
    await fireEvent.input(input, { target: { value: 'file:///work/index.html' } })
    await fireEvent.submit(input.closest('form')!)
    expect(mounted.view.getByRole('alert').textContent).toBe(zh['error.protocol'])
  })
  it('renders HTTPS in the fixed sandbox and follows controller history', async () => {
    const mounted = await mountBrowser()
    const input = mounted.view.getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'example.com/one' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')).not.toBeNull()
    })
    expect(input).toHaveProperty('value', 'https://example.com/one')
    let frame = mounted.view.container.querySelector('iframe')!
    expect(frame.getAttribute('src')).toBe('https://example.com/one')
    expect(frame.getAttribute('sandbox')).toBe(WEB_BROWSER_SANDBOX)
    expect(frame.getAttribute('allow')).toBeNull()
    // jsdom does not reflect the iframe referrerPolicy property to its attribute.
    expect(frame.referrerPolicy).toBe('no-referrer')
    const disableSandbox = mounted.view.getByRole('button', { name: zh['sandbox.disable'] })
    const protectedMark = disableSandbox.querySelector('svg path:last-child')?.getAttribute('d')
    await fireEvent.click(disableSandbox)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('sandbox')).toBeNull()
    })
    expect(mounted.view.getByRole('status').textContent).toBe(zh['sandbox.warning'])
    const enableSandbox = mounted.view.getByRole('button', { name: zh['sandbox.enable'] })
    expect(enableSandbox.querySelector('svg path:last-child')?.getAttribute('d')).not.toBe(
      protectedMark,
    )
    await fireEvent.click(enableSandbox)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('sandbox')).toBe(
        WEB_BROWSER_SANDBOX,
      )
    })
    expect(
      mounted.view
        .getByRole('button', { name: zh['sandbox.disable'] })
        .querySelector('svg path:last-child')
        ?.getAttribute('d'),
    ).toBe(protectedMark)
    await fireEvent.input(input, { target: { value: 'https://example.com/two' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://example.com/two',
      )
    })
    await fireEvent.click(mounted.view.getByRole('button', { name: zh.back }))
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://example.com/one',
      )
    })
    expect(input).toHaveProperty('value', 'https://example.com/one')
    frame = mounted.view.container.querySelector('iframe')!
    expect(frame.getAttribute('src')).toBe('https://example.com/one')
    expect(mounted.store.getSnapshot().byTab[TAB]?.index).toBe(0)
    await fireEvent.click(mounted.view.getByRole('button', { name: zh.forward }))
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://example.com/two',
      )
    })
    expect(input).toHaveProperty('value', 'https://example.com/two')
    const beforeReload = mounted.store.getSnapshot().byTab[TAB]!.request!.revision
    await fireEvent.click(mounted.view.getByRole('button', { name: zh.reload }))
    expect(mounted.store.getSnapshot().byTab[TAB]!.request?.revision).toBe(beforeReload + 1)
    await fireEvent.submit(input.closest('form')!)
    expect(mounted.store.getSnapshot().byTab[TAB]!.request?.revision).toBe(beforeReload + 2)
    await act(() => {
      mounted.tabActions.bindCommands.mock.calls.at(-1)![0].refresh!()
    })
    expect(mounted.store.getSnapshot().byTab[TAB]!.request?.revision).toBe(beforeReload + 3)
  })
  it('marks later frame loads unknown and limits unsafe toolbar actions', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const mounted = await mountBrowser()
    const input = mounted.view.getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'https://example.com/one' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')).not.toBeNull()
    })
    await fireEvent.input(input, { target: { value: 'https://example.com/two' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://example.com/two',
      )
    })
    const frame = mounted.view.container.querySelector('iframe')!
    const revision = mounted.store.getSnapshot().byTab[TAB]!.request!.revision
    await fireEvent.load(frame)
    expect(mounted.store.getSnapshot().byTab[TAB]?.navigation).toEqual({
      status: 'known',
      revision,
    })
    expect(mounted.view.getByRole('button', { name: zh.back })).toHaveProperty('disabled', false)
    await fireEvent.load(frame)
    expect(mounted.store.getSnapshot().byTab[TAB]?.navigation).toEqual({
      status: 'unknown',
      revision,
    })
    expect(mounted.view.getByText(zh['address.changed'])).toBeDefined()
    expect(mounted.view.getByRole('button', { name: zh.back })).toHaveProperty('disabled', true)
    expect(mounted.view.getByRole('button', { name: zh.forward })).toHaveProperty('disabled', true)
    expect(mounted.view.getByRole('button', { name: zh.external })).toHaveProperty(
      'disabled',
      true,
    )
    expect(mounted.view.getByRole('button', { name: zh.reload })).toHaveProperty('disabled', false)
    await fireEvent.click(mounted.view.getByRole('button', { name: zh.external }))
    expect(open).not.toHaveBeenCalled()
    await fireEvent.click(mounted.view.getByRole('button', { name: zh.reload }))
    expect(mounted.store.getSnapshot().byTab[TAB]?.navigation).toEqual({
      status: 'loading',
      revision: revision + 1,
    })
  })
  it('shows a best-effort iframe error notice until the next controlled load', async () => {
    const mounted = await mountBrowser()
    const input = mounted.view.getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'https://example.com/one' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')).not.toBeNull()
    })
    const failedFrame = mounted.view.container.querySelector('iframe')!
    await fireEvent.error(failedFrame)
    expect(mounted.injected.keyedHooks.browserState(TAB)?.getSnapshot().frame.error).toBeDefined()
    await waitFor(() => {
      expect(mounted.view.getByText(zh['load.failed'])).toBeDefined()
    })
    await fireEvent.click(mounted.view.getByRole('button', { name: zh.reload }))
    await waitFor(() => {
      expect(mounted.view.queryByText(zh['load.failed'])).toBeNull()
    })
    await fireEvent.error(failedFrame)
    expect(mounted.view.queryByText(zh['load.failed'])).toBeNull()
  })
  it('loads loopback under the default sandbox and keeps it across sandbox changes', async () => {
    const mounted = await mountBrowser()
    const input = mounted.view.getByRole('textbox')
    await fireEvent.input(input, { target: { value: 'http://localhost:5173/' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'http://localhost:5173/',
      )
    })
    expect(mounted.view.container.querySelector('iframe')?.getAttribute('sandbox')).toBe(
      WEB_BROWSER_SANDBOX,
    )
    await fireEvent.click(mounted.view.getByRole('button', { name: zh['sandbox.disable'] }))
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('sandbox')).toBeNull()
    })
    await fireEvent.click(mounted.view.getByRole('button', { name: zh['sandbox.enable'] }))
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('sandbox')).toBe(
        WEB_BROWSER_SANDBOX,
      )
    })
    expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
      'http://localhost:5173/',
    )
  })
  it('opens known Web targets externally and consumes an initial typed navigation', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const mounted = await mountBrowser({ url: 'https://initial.example/path' })
    const input = mounted.view.getByRole('textbox') as HTMLInputElement
    await waitFor(() => {
      expect(input.value).toBe('https://initial.example/path')
    })
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')).not.toBeNull()
    })
    await fireEvent.click(mounted.view.getByRole('button', { name: zh.external }))
    expect(open).toHaveBeenCalledWith(
      'https://initial.example/path',
      '_blank',
      'noopener,noreferrer',
    )
  })
  it('keeps a rejected initial URL in the address input for editing', async () => {
    const mounted = await mountBrowser({ url: 'file:/work/index.html' })
    const input = mounted.view.getByRole('textbox')
    await waitFor(() => {
      expect(mounted.view.getByRole('alert').textContent).toBe(zh['error.protocol'])
    })
    expect(input).toHaveProperty('value', 'file:/work/index.html')
    expect(mounted.view.container.querySelector('iframe')).toBeNull()
  })
  it('reloads the latest controlled URL instead of replaying the initial URL after remount', async () => {
    const mounted = await mountBrowser({ url: 'https://initial.example/path' })
    const input = mounted.view.getByRole('textbox')
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://initial.example/path',
      )
    })
    await fireEvent.input(input, { target: { value: 'https://latest.example/path' } })
    await fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(mounted.view.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://latest.example/path',
      )
    })
    mounted.view.unmount()
    const remounted = await mounted.remount()
    await waitFor(() => {
      expect(remounted.container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://latest.example/path',
      )
    })
    expect(remounted.getByRole('textbox')).toHaveProperty('value', 'https://latest.example/path')
    expect(mounted.store.getSnapshot().byTab[TAB]?.entries.at(-1)?.url).toBe(
      'https://latest.example/path',
    )
  })
})
async function render(node: VNodeChild) {
  const view = nativeRender(node)
  await nextTick()
  return view
}
const fireEvent = {
  async click(...args: Parameters<typeof domEvent.click>) {
    await nextTick()
    const value = domEvent.click(...args)
    await nextTick()
    return value
  },
  async input(...args: Parameters<typeof domEvent.input>) {
    await nextTick()
    const value = domEvent.input(...args)
    await nextTick()
    return value
  },
  async submit(...args: Parameters<typeof domEvent.submit>) {
    await nextTick()
    const value = domEvent.submit(...args)
    await nextTick()
    return value
  },
  async load(...args: Parameters<typeof domEvent.load>) {
    await nextTick()
    const value = domEvent.load(...args)
    await nextTick()
    return value
  },
  async error(...args: Parameters<typeof domEvent.error>) {
    await nextTick()
    const value = domEvent.error(...args)
    await nextTick()
    return value
  },
}
