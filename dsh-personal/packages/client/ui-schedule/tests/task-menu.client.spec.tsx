// @vitest-environment jsdom
import { h as vueH, Fragment, nextTick, shallowRef, defineComponent } from 'vue'
/**
 * `TaskMenu` behaviors: the pinned header slot, the `data-menu-field` keyboard
 * handover a portaled list performs once it is placed, the row walk, and the
 * dismissal and focus-return paths the task manager's four menus rely on.
 */
import * as uiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import { act, cleanup, fireEvent, render, screen, within } from './vue-render.client.ts'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { TaskMenu } from '../src/client/TaskMenu.tsx'
import type { TaskMenuEntry } from '../src/client/TaskMenu.tsx'
import taskMenuCss from '../src/client/TaskMenu.module.css'
afterEach(cleanup)
/** Rows every walking case uses: one enabled row and one disabled row. */
const ITEMS: readonly TaskMenuEntry[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta', disabled: true },
]
/** Three enabled rows, so the walk can wrap at both ends. */
const THREE_ROWS: readonly TaskMenuEntry[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
]
/**
 * Host that owns the open state, as every call site does, and closes on both
 * selection and dismissal.
 * @param props.onSelect - receives each selected row id.
 * @param props.portal - whether the host opens the menu in portal mode.
 * @returns the anchored menu.
 */
const OpenMenu = defineComponent(
  (props: { onSelect: (id: string) => void; portal?: boolean }) => {
    const open = shallowRef(true)
    return () =>
      vueH(TaskMenu, {
        open: open.value,
        portal: props.portal ?? false,
        items: ITEMS,
        onSelect: (id: string) => {
          props.onSelect(id)
          open.value = false
        },
        onClose: () => {
          open.value = false
        },
        anchor: vueH('button', { type: 'button' }, ['trigger']),
      })
  },
  { props: ['onSelect', 'portal'] },
)
describe('TaskMenu', () => {
  it('assigns independent CSS anchors to portaled menus without measuring their bounds', () => {
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    onTestFinished(() => {
      measure.mockRestore()
    })
    const view = render(
      vueH(Fragment, {}, [
        vueH(TaskMenu, {
          open: true,
          portal: true,
          anchor: vueH('button', { type: 'button' }, ['first trigger']),
          items: ITEMS,
          onSelect: () => {},
          onClose: () => {},
        }),
        vueH(TaskMenu, {
          open: true,
          portal: true,
          anchor: vueH('button', { type: 'button' }, ['second trigger']),
          items: ITEMS,
          onSelect: () => {},
          onClose: () => {},
        }),
      ]),
    )
    const anchors = ['first trigger', 'second trigger'].map(
      label => screen.getByRole('button', { name: label }).parentElement!.style.anchorName,
    )
    expect(anchors.every(name => name !== '')).toBe(true)
    expect(new Set(anchors).size).toBe(2)
    const menus = screen.getAllByRole('menu')
    expect(menus.map(menu => menu.style.positionAnchor)).toEqual(anchors)
    expect(
      menus.every(
        menu => !view.container.contains(menu) && menu.style.left === '' && menu.style.top === '',
      ),
    ).toBe(true)
    expect(measure).not.toHaveBeenCalled()
  })
  it('shows items only while open, and reports the clicked row id', async () => {
    const onSelect = vi.fn()
    const mountedView1 = render(
      vueH(TaskMenu, {
        open: false,
        portal: true,
        anchor: vueH('span', {}, ['trigger']),
        onSelect: onSelect,
        onClose: () => {},
      }),
    )
    const rerender = (...args: Parameters<typeof mountedView1.rerender>) => mountedView1.rerender(...args)
    expect(screen.queryByRole('menu')).toBeNull()
    await rerender(
      vueH(TaskMenu, {
        open: true,
        portal: true,
        anchor: vueH('span', {}, ['trigger']),
        items: ITEMS,
        onSelect: onSelect,
        onClose: () => {},
      }),
    )
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Alpha' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('a')
  })
  it('renders an empty list when it is given no rows', () => {
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('span', {}, ['trigger']),
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    expect(within(screen.getByRole('menu')).queryAllByRole('menuitem')).toEqual([])
  })
  it('renders a heading, a separator, a selected check, a leading icon, and a danger row', () => {
    render(
      vueH(TaskMenu, {
        open: true,
        selectedId: 'a',
        listClassName: 'extra',
        className: 'wrapper',
        anchor: vueH('span', {}, ['trigger']),
        items: [
          { type: 'label', id: 'heading', text: 'Group by' },
          { id: 'a', label: 'Alpha' },
          { type: 'separator', id: 'gap' },
          { id: 'c', label: 'Create', icon: vueH('svg', { 'data-testid': 'icon' }) },
          { id: 'd', label: 'Delete', danger: true },
        ],
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    expect(screen.getByText('Group by').getAttribute('role')).toBe('presentation')
    expect(screen.getByRole('separator')).toBeDefined()
    expect(screen.getByTestId('icon')).toBeDefined()
    expect(screen.getByRole('menu').classList.contains('extra')).toBe(true)
    expect(screen.getByText('trigger').parentElement?.classList.contains('wrapper')).toBe(true)
    // Only the selected row carries the trailing check.
    expect(screen.getByRole('menuitem', { name: 'Alpha' }).querySelectorAll('svg')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'Alpha' }).className).toMatch(/selected/)
    expect(screen.getByRole('menuitem', { name: 'Create' }).querySelectorAll('svg')).toHaveLength(
      1,
    )
    expect(screen.getByRole('menuitem', { name: 'Create' }).className).not.toMatch(/selected/)
    expect(screen.getByRole('menuitem', { name: 'Delete' }).querySelectorAll('svg')).toHaveLength(
      0,
    )
    expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toMatch(/danger/)
  })
  it("aligns an in-place list to the anchor's end edge", () => {
    const { container } = render(
      vueH(TaskMenu, {
        open: true,
        align: 'end',
        anchor: vueH('span', {}, ['trigger']),
        items: ITEMS,
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    expect(
      container.querySelector('[role="menu"]')?.classList.contains(taskMenuCss.alignEnd!),
    ).toBe(true)
    expect(container.querySelector('[role="menu"]')?.classList.contains(taskMenuCss.portal!)).toBe(
      false,
    )
  })
  it('keeps text Home and End navigation in a menu header input', async () => {
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        header: vueH('input', { 'aria-label': 'Filter', defaultValue: 'query' }),
        items: ITEMS,
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    const filter = screen.getByRole('textbox', { name: 'Filter' })
    filter.focus()
    expect(await fireEvent.keyDown(filter, { key: 'Home' })).toBe(true)
    expect(await fireEvent.keyDown(filter, { key: 'End' })).toBe(true)
    expect(document.activeElement).toBe(filter)
    // Arrow keys still enter the result list from the field.
    expect(await fireEvent.keyDown(filter, { key: 'ArrowDown' })).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Alpha' }))
  })
  it('hands a placed portal list to the field its header marks', async () => {
    render(
      vueH(TaskMenu, {
        open: true,
        portal: true,
        align: 'end',
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        header: vueH('input', { 'aria-label': 'Filter', 'data-menu-field': '' }),
        items: ITEMS,
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    await nextTick()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Filter' }))
  })
  it.each([
    {
      name: 'iPhone',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    },
    {
      name: 'Android tablet',
      userAgent:
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    },
    {
      name: 'desktop-mode iPad',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    },
  ])(
    'leaves header search focus to the user on $name',
    async ({ userAgent, platform, maxTouchPoints }) => {
      for (const [name, value] of Object.entries({ userAgent, platform, maxTouchPoints })) {
        const descriptor = Object.getOwnPropertyDescriptor(navigator, name)
        Object.defineProperty(navigator, name, { configurable: true, value })
        onTestFinished(() => {
          if (descriptor === undefined) Reflect.deleteProperty(navigator, name)
          else Object.defineProperty(navigator, name, descriptor)
        })
      }
      vi.resetModules()
      const detection = await import('@deepseek-ai/dsh-client-ui-primitives/src/focus.ts')
      const device = vi
        .spyOn(uiPrimitives, 'isMobileDevice')
        .mockImplementation(detection.isMobileDevice)
      onTestFinished(() => {
        device.mockRestore()
      })
      const menu = (open: boolean) =>
        vueH(TaskMenu, {
          open: open,
          portal: true,
          anchor: vueH('button', { type: 'button' }, ['trigger']),
          header: vueH('input', { 'aria-label': 'Filter', 'data-menu-field': '' }),
          items: ITEMS,
          onSelect: () => {},
          onClose: () => {},
        })
      const mountedView2 = render(menu(false))
      const rerender = (...args: Parameters<typeof mountedView2.rerender>) => mountedView2.rerender(...args)
      const trigger = screen.getByRole('button', { name: 'trigger' })
      trigger.focus()
      await rerender(menu(true))
      const field = screen.getByRole('textbox', { name: 'Filter' })
      expect(document.activeElement).toBe(trigger)
      field.focus()
      expect(document.activeElement).toBe(field)
      await fireEvent.keyDown(field, { key: 'ArrowDown' })
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Alpha' }))
      await rerender(menu(false))
      trigger.focus()
      await rerender(menu(true))
      expect(document.activeElement).toBe(trigger)
    },
  )
  it('keeps the keyboard on the row when a placed portal list repositions', async () => {
    render(
      vueH(TaskMenu, {
        open: true,
        portal: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        header: vueH('input', { 'aria-label': 'Filter', 'data-menu-field': '' }),
        items: ITEMS,
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    const field = screen.getByRole('textbox', { name: 'Filter' })
    await nextTick()
    expect(document.activeElement).toBe(field)
    await fireEvent.keyDown(field, { key: 'ArrowDown' })
    const alpha = screen.getByRole('menuitem', { name: 'Alpha' })
    expect(document.activeElement).toBe(alpha)
    // A viewport resize must not repeat the initial header focus handover.
    await fireEvent(window, new Event('resize'))
    expect(document.activeElement).toBe(alpha)
  })
  it('walks the list with the arrows, wrapping at both ends, and Escape returns the keyboard', async () => {
    const onClose = vi.fn()
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        items: THREE_ROWS,
        onSelect: () => {},
        onClose: onClose,
      }),
    )
    const trigger = screen.getByRole('button', { name: 'trigger' })
    const alpha = screen.getByRole('menuitem', { name: 'Alpha' })
    const beta = screen.getByRole('menuitem', { name: 'Beta' })
    const gamma = screen.getByRole('menuitem', { name: 'Gamma' })
    trigger.focus()
    // The menu does not move the keyboard on open, so the first step enters at
    // the near end.
    expect(document.activeElement).toBe(trigger)
    // A key outside the walk is left to the browser.
    expect(await fireEvent.keyDown(trigger, { key: 'a' })).toBe(true)
    expect(await fireEvent.keyDown(trigger, { key: 'ArrowDown' })).toBe(false)
    expect(document.activeElement).toBe(alpha)
    await fireEvent.keyDown(alpha, { key: 'ArrowDown' })
    await fireEvent.keyDown(beta, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(gamma)
    await fireEvent.keyDown(gamma, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(alpha)
    await fireEvent.keyDown(alpha, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(gamma)
    await fireEvent.keyDown(gamma, { key: 'Home' })
    expect(document.activeElement).toBe(alpha)
    await fireEvent.keyDown(alpha, { key: 'End' })
    expect(document.activeElement).toBe(gamma)
    await fireEvent.keyDown(gamma, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(trigger)
  })
  it('enters at the last enabled row on ArrowUp and steps over a disabled one', async () => {
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        items: ITEMS,
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    const trigger = screen.getByRole('button', { name: 'trigger' })
    trigger.focus()
    expect(await fireEvent.keyDown(trigger, { key: 'ArrowUp' })).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Alpha' }))
  })
  it('keeps the browser traversal on arrows and Tab when the list has no enabled row', async () => {
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        items: [{ id: 'b', label: 'Beta', disabled: true }],
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    const trigger = screen.getByRole('button', { name: 'trigger' })
    trigger.focus()
    expect(await fireEvent.keyDown(trigger, { key: 'ArrowDown' })).toBe(true)
    expect(await fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(true)
  })
  it('Tab settles the focused row', async () => {
    const onSelect = vi.fn()
    render(vueH(OpenMenu, { onSelect: onSelect }))
    screen.getByRole('button', { name: 'trigger' }).focus()
    expect(
      await fireEvent.keyDown(screen.getByRole('button', { name: 'trigger' }), { key: 'Tab' }),
    ).toBe(false)
    const alpha = screen.getByRole('menuitem', { name: 'Alpha' })
    expect(document.activeElement).toBe(alpha)
    expect(await fireEvent.keyDown(alpha, { key: 'Tab' })).toBe(false)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('a')
  })
  it('Shift+Tab closes back to the anchor', async () => {
    const onClose = vi.fn()
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        items: ITEMS,
        onSelect: () => {},
        onClose: onClose,
      }),
    )
    const trigger = screen.getByRole('button', { name: 'trigger' })
    trigger.focus()
    await fireEvent.keyDown(trigger, { key: 'Tab' })
    const alpha = screen.getByRole('menuitem', { name: 'Alpha' })
    expect(document.activeElement).toBe(alpha)
    expect(await fireEvent.keyDown(alpha, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(trigger)
  })
  it('keeps the browser traversal for Tab on a header control and outside the menu', async () => {
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        header: vueH('input', { 'aria-label': 'Filter' }),
        items: ITEMS,
        onSelect: () => {},
        onClose: () => {},
      }),
    )
    // A focused control inside the list that is not a row keeps the traversal.
    const filter = screen.getByRole('textbox', { name: 'Filter' })
    filter.focus()
    expect(await fireEvent.keyDown(filter, { key: 'Tab' })).toBe(true)
    // So does a keyboard outside both the anchor and the list, on Tab and on
    // the arrow walk alike.
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    expect(await fireEvent.keyDown(outside, { key: 'Tab' })).toBe(true)
    expect(await fireEvent.keyDown(outside, { key: 'ArrowDown' })).toBe(true)
    outside.remove()
  })
  it('leaves the keyboard and the selection alone for a click on the card that is not a row', async () => {
    const onSelect = vi.fn()
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        items: ITEMS,
        onSelect: onSelect,
        onClose: () => {},
      }),
    )
    const trigger = screen.getByRole('button', { name: 'trigger' })
    trigger.focus()
    // The card's own padding is inside the list but outside every row, so the
    // click activates nothing and moves no keyboard.
    await fireEvent.click(screen.getByRole('menu'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)
  })
  it('Escape closes without moving the keyboard when the menu did not hold it', async () => {
    const onClose = vi.fn()
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('button', { type: 'button' }, ['trigger']),
        items: ITEMS,
        onSelect: () => {},
        onClose: onClose,
      }),
    )
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await fireEvent.keyDown(outside, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
  it('closes on an outside pointer press and stays open for one inside the card', async () => {
    const onClose = vi.fn()
    const mountedView3 = render(
      vueH(TaskMenu, {
        open: true,
        portal: true,
        anchor: vueH('span', {}, ['trigger']),
        items: ITEMS,
        onSelect: () => {},
        onClose: onClose,
      }),
    )
    const rerender = (...args: Parameters<typeof mountedView3.rerender>) => mountedView3.rerender(...args)
    // The portaled card is outside the anchor wrapper, so its own press counts
    // as inside through the card ref.
    await fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Alpha' }))
    expect(onClose).not.toHaveBeenCalled()
    await fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
    // An in-place card is inside the anchor wrapper.
    await rerender(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('span', {}, ['trigger']),
        items: ITEMS,
        onSelect: () => {},
        onClose: onClose,
      }),
    )
    await fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Alpha' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('closes on a window blur only when focus moved into an iframe', async () => {
    const onClose = vi.fn()
    render(
      vueH(TaskMenu, {
        open: true,
        anchor: vueH('span', {}, ['trigger']),
        items: ITEMS,
        onSelect: () => {},
        onClose: onClose,
      }),
    )
    await fireEvent.blur(window)
    expect(onClose).not.toHaveBeenCalled()
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    try {
      iframe.focus()
      expect(document.activeElement).toBe(iframe)
      await fireEvent.blur(window)
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      iframe.remove()
    }
  })
  it('returns the keyboard to the anchor after a selection', async () => {
    render(vueH(OpenMenu, { onSelect: () => {} }))
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Alpha' }))
    expect(screen.queryByRole('menu')).toBeNull()
    await act(async () => {
      await Promise.resolve()
    })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'trigger' }))
  })
  it('leaves the keyboard where the owner moved it after a selection', async () => {
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    try {
      render(
        vueH(OpenMenu, {
          onSelect: () => {
            elsewhere.focus()
          },
        }),
      )
      await fireEvent.click(screen.getByRole('menuitem', { name: 'Alpha' }))
      await act(async () => {
        await Promise.resolve()
      })
      expect(document.activeElement).toBe(elsewhere)
    } finally {
      elsewhere.remove()
    }
  })
  it('returns the keyboard to the anchor when the page reports no active element', async () => {
    // A document that reports no active element still has to hand the keyboard
    // back, or the next Tab restarts from the top of the page.
    const activeElement = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null)
    try {
      render(vueH(OpenMenu, { onSelect: () => {} }))
      await fireEvent.click(screen.getByRole('menuitem', { name: 'Alpha' }))
      await act(async () => {
        await Promise.resolve()
      })
    } finally {
      activeElement.mockRestore()
    }
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'trigger' }))
  })
  it('leaves an Escape that an outer layer already handled', async () => {
    // A window capture listener runs before the menu's document listener.
    const consume = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') event.preventDefault()
    }
    window.addEventListener('keydown', consume, true)
    try {
      render(vueH(OpenMenu, { onSelect: () => {} }))
      await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Alpha' }), { key: 'Escape' })
      expect(screen.getByRole('menu')).toBeDefined()
    } finally {
      window.removeEventListener('keydown', consume, true)
    }
  })
})
