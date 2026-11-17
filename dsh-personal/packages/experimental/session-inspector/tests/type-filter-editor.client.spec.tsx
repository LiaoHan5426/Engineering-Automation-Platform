import { h, nextTick } from 'vue'
import { fireEvent as fireEventNative } from '@testing-library/dom'
// @vitest-environment jsdom
/** Drafts and asynchronous candidates cannot change the applied filter without confirmation. */
import {
  act as actNative,
  cleanup,
  render as renderNative,
} from '../../../test-support/client-runtime/src/vue-test.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { TypeFilter } from '../src/client/views/TypeFilter.tsx'
import { en } from '../src/client/locales.ts'
afterEach(cleanup)
const t = makeTranslate(en)
it('discards out-of-order responses and confirms the typed fragment with Enter', async () => {
  const empty = Promise.withResolvers<readonly string[]>()
  const earlier = Promise.withResolvers<readonly string[]>()
  const later = Promise.withResolvers<readonly string[]>()
  const suggest = vi.fn((query: string) =>
    query === '' ? empty.promise : query === 'd' ? earlier.promise : later.promise,
  )
  const apply = vi.fn()
  const ui = await render(h(TypeFilter, { value: '', suggest: suggest, apply: apply, t: t }))
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Filter types' }))
  })
  const input = ui.getByRole('combobox', { name: 'Type keyword' })
  expect(document.activeElement).toBe(input)
  expect(ui.getByRole('dialog').parentElement).toBe(document.body)
  await act(async () => {
    await fireEvent.input(input, { target: { value: 'd' } })
  })
  await act(async () => {
    await fireEvent.input(input, { target: { value: 'delta' } })
  })
  expect(suggest.mock.calls.map(([query]) => query)).toEqual(['', 'd', 'delta'])
  expect(apply).not.toHaveBeenCalled()
  await act(async () => {
    later.resolve(['reasoning-delta', 'tool-call-delta'])
  })
  expect(ui.getAllByRole('option').map(option => option.textContent)).toEqual([
    'reasoning-delta',
    'tool-call-delta',
  ])
  await act(async () => {
    earlier.resolve(['block-end'])
    empty.resolve(['assistant/message'])
  })
  expect(ui.getAllByRole('option').map(option => option.textContent)).toEqual([
    'reasoning-delta',
    'tool-call-delta',
  ])
  await fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  await fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
  expect(apply).not.toHaveBeenCalled()
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(apply).toHaveBeenCalledExactlyOnceWith('delta')
  expect(ui.queryByRole('dialog')).toBeNull()
})
it('confirms candidates by keyboard or click and scrolls the active option into view', async () => {
  const suggest = async () => ['reasoning-delta', 'tool-call-delta']
  const apply = vi.fn()
  const ui = await render(h(TypeFilter, { value: 'delta', suggest: suggest, apply: apply, t: t }))
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Filter types' }))
  })
  const input = ui.getByRole('combobox', { name: 'Type keyword' })
  const options = ui.getAllByRole('option')
  const scroll = options.map((option) => {
    const callback = vi.fn()
    option.scrollIntoView = callback
    return callback
  })
  await fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(options[1]!.getAttribute('aria-selected')).toBe('true')
  expect(scroll[1]).toHaveBeenCalledWith({ block: 'nearest' })
  await fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(options[0]!.getAttribute('aria-selected')).toBe('true')
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(apply).toHaveBeenLastCalledWith('reasoning-delta')
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Filter types' }))
  })
  await fireEvent.click(ui.getByRole('option', { name: 'tool-call-delta' }))
  expect(apply).toHaveBeenLastCalledWith('tool-call-delta')
  expect(ui.queryByRole('dialog')).toBeNull()
})
it('discards drafts on dismissal and requires confirmation after clearing', async () => {
  const apply = vi.fn()
  const ui = await render(
    h(TypeFilter, { value: 'tool', suggest: async () => [], apply: apply, t: t }),
  )
  const trigger = ui.getByRole('button', { name: 'Filter types' })
  expect(trigger.getAttribute('aria-pressed')).toBe('true')
  await act(async () => {
    await fireEvent.click(trigger)
  })
  await act(async () => {
    await fireEvent.input(ui.getByRole('combobox'), { target: { value: 'delta' } })
  })
  await fireEvent.keyDown(ui.getByRole('combobox'), { key: 'Escape' })
  expect(ui.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  await act(async () => {
    await fireEvent.click(trigger)
  })
  expect(ui.getByRole<HTMLInputElement>('combobox').value).toBe('tool')
  await fireEvent.pointerDown(document.body)
  expect(ui.queryByRole('dialog')).toBeNull()
  await act(async () => {
    await fireEvent.click(trigger)
  })
  await fireEvent.click(ui.getByRole('button', { name: 'Cancel' }))
  expect(ui.queryByRole('dialog')).toBeNull()
  await act(async () => {
    await fireEvent.click(trigger)
  })
  await fireEvent.blur(window)
  expect(ui.queryByRole('dialog')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
  await act(async () => {
    await fireEvent.click(trigger)
  })
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Clear' }))
  })
  expect(ui.getByRole<HTMLInputElement>('combobox').value).toBe('')
  expect(apply).not.toHaveBeenCalled()
  await fireEvent.click(ui.getByRole('button', { name: 'Apply filter' }))
  expect(apply).toHaveBeenCalledExactlyOnceWith('')
})
it('contains candidate failures and ignores results after closing or unmounting', async () => {
  const failed = Promise.withResolvers<readonly string[]>()
  const closed = Promise.withResolvers<readonly string[]>()
  const unmounted = Promise.withResolvers<readonly string[]>()
  const suggest = vi
    .fn()
    .mockReturnValueOnce(failed.promise)
    .mockReturnValueOnce(closed.promise)
    .mockReturnValueOnce(unmounted.promise)
  const apply = vi.fn()
  const ui = await render(h(TypeFilter, { value: '', suggest: suggest, apply: apply, t: t }))
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Filter types' }))
  })
  await act(async () => {
    failed.reject(new Error('candidate source failed'))
  })
  expect(ui.getByRole('alert').textContent).toContain('candidate source failed')
  await fireEvent.keyDown(ui.getByRole('combobox'), { key: 'Escape' })
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Filter types' }))
  })
  await fireEvent.pointerDown(document.body)
  await act(async () => {
    closed.resolve(['reasoning-delta'])
  })
  expect(ui.queryByRole('dialog')).toBeNull()
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Filter types' }))
  })
  ui.unmount()
  await act(async () => {
    unmounted.resolve(['tool-call-delta'])
  })
  expect(ui.queryByRole('option')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})
it('keeps focus inside the panel until blur leaves it and lets the trigger close an open editor', async () => {
  const ui = await render(
    h(TypeFilter, { value: '', suggest: async () => ['first', 'second'], apply: vi.fn(), t: t }),
  )
  const trigger = ui.getByRole('button', { name: 'Filter types' })
  await act(async () => {
    await fireEvent.click(trigger)
  })
  const input = ui.getByRole('combobox')
  for (const option of ui.getAllByRole('option')) option.scrollIntoView = vi.fn()
  await fireEvent.pointerDown(input)
  await fireEvent.pointerDown(window)
  expect(ui.getByRole('dialog')).toBeTruthy()
  await fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(ui.getByRole('option', { name: 'first' }).getAttribute('aria-selected')).toBe('true')
  await fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(ui.getByRole('option', { name: 'second' }).getAttribute('aria-selected')).toBe('true')
  const option = ui.getByRole('option', { name: 'second' })
  const press = new Event('pointerdown', { bubbles: true, cancelable: true })
  await fireEvent(option, press)
  expect(press.defaultPrevented).toBe(true)
  await fireEvent.focusOut(input, { relatedTarget: option })
  expect(ui.getByRole('dialog')).toBeTruthy()
  await fireEvent.focusOut(input, { relatedTarget: document.body })
  expect(ui.queryByRole('dialog')).toBeNull()
  await act(async () => {
    await fireEvent.click(trigger)
  })
  await fireEvent.pointerDown(trigger)
  expect(ui.getByRole('dialog')).toBeTruthy()
  await fireEvent.click(trigger)
  expect(ui.queryByRole('dialog')).toBeNull()
})
it('keeps an empty candidate list unselected and ignores a rejection after dismissal', async () => {
  const delayed = Promise.withResolvers<readonly string[]>()
  const apply = vi.fn()
  const suggest = vi
    .fn<() => Promise<readonly string[]>>()
    .mockResolvedValueOnce([])
    .mockReturnValueOnce(delayed.promise)
  const ui = await render(
    h(TypeFilter, { value: 'fragment', suggest: suggest, apply: apply, t: t }),
  )
  const trigger = ui.getByRole('button', { name: 'Filter types' })
  await act(async () => {
    await fireEvent.click(trigger)
  })
  const input = ui.getByRole('combobox')
  await fireEvent.keyDown(input, { key: 'ArrowDown' })
  await fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(input.getAttribute('aria-activedescendant')).toBeNull()
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(apply).toHaveBeenCalledWith('fragment')
  await act(async () => {
    await fireEvent.click(trigger)
  })
  await fireEvent.click(trigger)
  await act(async () => {
    delayed.reject('late failure')
  })
  expect(ui.queryByRole('alert')).toBeNull()
})
it('renders a non-Error candidate failure without losing the editable draft', async () => {
  const ui = await render(
    h(TypeFilter, {
      value: 'kept',
      suggest: async () => {
        throw 'candidate failure'
      },
      apply: vi.fn(),
      t: t,
    }),
  )
  await act(async () => {
    await fireEvent.click(ui.getByRole('button', { name: 'Filter types' }))
  })
  expect(ui.getByRole('alert').textContent).toContain('candidate failure')
  expect(ui.getByRole<HTMLInputElement>('combobox').value).toBe('kept')
})
const fireEvent = Object.assign(async (...args: Parameters<typeof fireEventNative>) => {
  await nextTick()
  const result = fireEventNative(...args)
  await nextTick()
  return result
}, {
  async click(...args: Parameters<typeof fireEventNative.click>) {
    await nextTick()
    const result = fireEventNative.click(...args)
    await nextTick()
    return result
  },
  async input(...args: Parameters<typeof fireEventNative.input>) {
    await nextTick()
    const result = fireEventNative.input(...args)
    await nextTick()
    return result
  },
  async keyDown(...args: Parameters<typeof fireEventNative.keyDown>) {
    await nextTick()
    const result = fireEventNative.keyDown(...args)
    await nextTick()
    return result
  },
  async pointerDown(...args: Parameters<typeof fireEventNative.pointerDown>) {
    await nextTick()
    const result = fireEventNative.pointerDown(...args)
    await nextTick()
    return result
  },
  async blur(...args: Parameters<typeof fireEventNative.blur>) {
    await nextTick()
    const result = fireEventNative.blur(...args)
    await nextTick()
    return result
  },
  async focusOut(...args: Parameters<typeof fireEventNative.focusOut>) {
    await nextTick()
    const result = fireEventNative.focusOut(...args)
    await nextTick()
    return result
  },
})
const render = async (...args: Parameters<typeof renderNative>) => {
  const view = renderNative(...args)
  await nextTick()
  return view
}
const act = actNative
