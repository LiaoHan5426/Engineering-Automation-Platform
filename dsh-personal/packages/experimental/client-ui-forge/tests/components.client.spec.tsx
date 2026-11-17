import { h, computed } from 'vue'
// @vitest-environment jsdom
/** Session header entry, forge and changes tab titles, and action toast rendering. */
import { fireEvent, screen, within } from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.client.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import toastCss from '@deepseek-ai/dsh-client-ui-primitives/src/Toast.module.css'
import type {
  PaneId,
  SidebarRightTabInfo,
  TabId,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ActionToast } from '../src/client/ActionToast.tsx'
import { changesAddress } from '../src/client/changes-address.ts'
import { ChangesTabTitle } from '../src/client/ChangesTabTitle.tsx'
import { ForgeTabTitle } from '../src/client/ForgeTabTitle.tsx'
import { HeaderButton } from '../src/client/HeaderButton.tsx'
import { en } from '../src/client/locales.ts'
import { createNoticeSource, type PanelSnapshot } from '../src/client/source.ts'
import type { ForgePanelState } from '../src/types.ts'
import { entry, ready, snapshot } from './client-fixtures.client.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const t = makeTranslate(en)
describe('HeaderButton', () => {
  function header(state: ForgePanelState | null, visible = false) {
    const panel = createSnapshotStore<PanelSnapshot>({ state, disconnected: false })
    const visibility = createSnapshotStore<boolean>(visible)
    const toggle = vi.fn<(visible: boolean) => void>()
    const view = render(
      h(
        HeaderButton,
        {
          usePanel: bindSnapshotSelector(panel),
          useVisible: bindSnapshotSelector(visibility),
          toggle: toggle,
          t: t,
        },
        { default: () => [] },
      ),
    )
    return {
      panel,
      visibility,
      toggle,
      view,
      button: () => view.container.querySelector('[data-forge-header]'),
    }
  }
  it.each([
    ['before the first state', null],
    ['outside a Git checkout', ready({ checkout: { state: 'none' } })],
    [
      'while the first inspection of an unknown repository runs',
      ready({ checkout: { state: 'pending' }, repository: null }),
    ],
  ])('stays hidden %s', (_label, state) => {
    expect(header(state).view.container.textContent).toBe('')
  })
  it.each([
    ['a ready checkout', ready()],
    ['a failed inspection', ready({ checkout: { state: 'failed', message: 'boom' } })],
    ['a repeated inspection of a known repository', ready({ checkout: { state: 'pending' } })],
    [
      'bound change requests outside a Git checkout',
      ready({ checkout: { state: 'none' }, changeRequests: [entry(1, snapshot(1))] }),
    ],
  ])('opens the hidden tab for %s', async (_label, state) => {
    const b = header(state)
    const button = b.view.getByRole('button', { name: en['header.label'] })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.querySelector('[data-state]')).toBeNull()
    await act(() => fireEvent.click(button))
    expect(b.toggle).toHaveBeenCalledWith(false)
  })
  it('marks change requests that need attention', () => {
    const b = header(
      ready({
        changeRequests: [entry(1, snapshot(1)), entry(2, snapshot(2, { checksRollup: 'failure' }))],
      }),
    )
    const button = b.view.getByRole('button', { name: en['header.attention'] })
    expect(button.querySelector('[data-state="error"]')).not.toBeNull()
  })
  it('follows the tab visibility and hides a visible tab', async () => {
    const b = header(ready(), true)
    const button = b.view.getByRole('button', { name: en['header.label'] })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    await act(() => fireEvent.click(button))
    expect(b.toggle).toHaveBeenLastCalledWith(true)
    await act(() => {
      b.visibility.set(false)
    })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await act(() => fireEvent.click(button))
    expect(b.toggle).toHaveBeenLastCalledWith(false)
  })
  it('appears, changes its label, and disappears as the panel state changes', async () => {
    const b = header(null)
    await act(() => {
      b.panel.set({ state: ready(), disconnected: false })
    })
    expect(b.button()?.getAttribute('aria-label')).toBe(en['header.label'])
    await act(() => {
      b.panel.set({
        state: ready({ changeRequests: [entry(1, snapshot(1, { mergeability: 'conflicting' }))] }),
        disconnected: false,
      })
    })
    expect(b.button()?.getAttribute('aria-label')).toBe(en['header.attention'])
    await act(() => {
      b.panel.set({ state: ready({ checkout: { state: 'none' } }), disconnected: true })
    })
    expect(b.button()).toBeNull()
  })
})
describe('ForgeTabTitle', () => {
  it('shows the branch glyph and the tab name', () => {
    const view = render(h(ForgeTabTitle, { t: t }, { default: () => [] }))
    expect(view.getByText(en['tab.title'])).toBeTruthy()
    expect(view.container.querySelector('svg')).not.toBeNull()
  })
})
describe('ChangesTabTitle', () => {
  const unused = (): never => {
    throw new Error('the title does not call tab actions')
  }
  function title(contentId: string) {
    const info: SidebarRightTabInfo = {
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: 'pane-1' as PaneId, isFloating: false },
      tab: {
        id: 'tab-1' as TabId,
        kind: 'forge-changes',
        contentId,
        title: 'Captured',
        visible: true,
        navigation: { address: contentId, params: undefined, revision: 1 },
        signal: new AbortController().signal,
        actions: {
          bindCommands: () => () => {},
          openResource: unused,
          openTab: unused,
          close: unused,
        },
      },
    }
    return render(
      h(ChangesTabTitle, { useTabInfo: () => computed(() => info), t: t }, { default: () => [] }),
    )
  }
  it('names the view from its address in the current language', () => {
    const view = title(
      changesAddress({
        sessionId: brandString<SessionId>('s1'),
        source: { kind: 'change', url: 'https://github.com/octo/demo/pull/7' },
      }),
    )
    expect(view.container.textContent).toBe('Changes in #7')
    expect(view.container.querySelector('svg')).not.toBeNull()
  })
  it('keeps the captured title of an address it did not mint', () => {
    expect(title('dsh-resource://forge-changes/s1/remote').container.textContent).toBe('Captured')
  })
})
describe('ActionToast', () => {
  function toast() {
    vi.useFakeTimers()
    const notices = createNoticeSource()
    const dismiss = vi.fn(notices.dismiss)
    const view = render(
      h(
        ActionToast,
        { useNotice: bindSnapshotSelector(notices.hooks.notice), dismiss: dismiss, t: t },
        { default: () => [] },
      ),
    )
    return { notices, dismiss, view }
  }
  it('renders nothing without a notice', () => {
    const b = toast()
    expect(b.view.container.textContent).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('warns about a failure until it fades', async () => {
    const b = toast()
    await act(() => {
      b.notices.report('toast.refreshFailed')
    })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe(en['toast.refreshFailed'])
    expect(alert.querySelector(`.${toastCss.icon}`)).not.toBeNull()
    expect(alert.querySelector(`.${toastCss.success}`)).toBeNull()
    expect(within(alert).queryByRole('button')).toBeNull()
    await act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(b.dismiss).not.toHaveBeenCalled()
    await act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(b.dismiss).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('confirms a success with its values', async () => {
    const b = toast()
    await act(() => {
      b.notices.report('toast.removed', { tone: 'success', params: { name: '#7' } })
    })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Removed #7 from this Session')
    expect(alert.querySelector(`.${toastCss.success}`)).not.toBeNull()
    await act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('holds an undoable notice longer and dismisses it before undoing', async () => {
    const b = toast()
    const order: string[] = []
    b.dismiss.mockImplementation(() => {
      order.push('dismiss')
      b.notices.dismiss()
    })
    await act(() => {
      b.notices.report('toast.removed', {
        tone: 'success',
        params: { name: '#7' },
        undo: () => {
          order.push('undo')
        },
      })
    })
    await act(() => {
      vi.advanceTimersByTime(6999)
    })
    expect(order).toEqual([])
    await act(() =>
      fireEvent.click(
        within(screen.getByRole('alert')).getByRole('button', { name: en['toast.undo'] }),
      ),
    )
    expect(order).toEqual(['dismiss', 'undo'])
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('fades an undoable notice nobody acts on without undoing', async () => {
    const b = toast()
    const undo = vi.fn()
    await act(() => {
      b.notices.report('toast.removed', { tone: 'success', params: { name: '#7' }, undo })
    })
    await act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(b.dismiss).toHaveBeenCalledOnce()
    expect(undo).not.toHaveBeenCalled()
  })
  it('restarts the hold for a repeated notice', async () => {
    const b = toast()
    await act(() => {
      b.notices.report('toast.copyFailed')
    })
    await act(() => {
      vi.advanceTimersByTime(3000)
    })
    await act(() => {
      b.notices.report('toast.copyFailed')
    })
    await act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('alert').textContent).toBe(en['toast.copyFailed'])
    await act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(b.dismiss).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
