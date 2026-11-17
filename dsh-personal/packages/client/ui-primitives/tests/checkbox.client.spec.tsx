// @vitest-environment jsdom
/** The shared checkbox keeps native label activation and controlled state. */
import { fireEvent, screen } from '@testing-library/dom'
import { renderVue as render } from './vue-render.ts'
import { h } from 'vue'
import { expect, it, vi } from 'vitest'
import { Checkbox } from '../src/Checkbox.tsx'
it('requests a checked state through its visible label and follows the owner', () => {
  const onChange = vi.fn()
  const { rerender } = render(h(Checkbox, { 'label': 'Images', 'checked': false, 'onChange': onChange }))
  fireEvent.click(screen.getByText('Images'))
  expect(onChange).toHaveBeenLastCalledWith(true)
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Images' }).checked).toBe(false)
  rerender(h(Checkbox, { 'label': 'Images', 'checked': true, 'onChange': onChange }))
  fireEvent.click(screen.getByRole('checkbox'))
  expect(onChange).toHaveBeenLastCalledWith(false)
})
it('refuses label activation while disabled', () => {
  const onChange = vi.fn()
  render(h(Checkbox, { 'label': 'Images', 'checked': true, 'disabled': true, 'onChange': onChange }))
  fireEvent.click(screen.getByText('Images'))
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(true)
})
it('marks initial modal focus only when requested', () => {
  const view = render(h(Checkbox, { 'label': 'Acknowledge', 'checked': false, 'onChange': () => { } }))
  expect(screen.getByRole('checkbox').hasAttribute('data-modal-autofocus')).toBe(false)
  view.rerender(h(Checkbox, { 'label': 'Acknowledge', 'checked': false, 'onChange': () => { }, 'modalAutofocus': true }))
  expect(screen.getByRole('checkbox').hasAttribute('data-modal-autofocus')).toBe(true)
  expect(document.activeElement).not.toBe(screen.getByRole('checkbox'))
})
it('preserves caller hover text', () => {
  const onChange = vi.fn()
  render(h(Checkbox, { 'label': 'Office', 'checked': false, 'onChange': onChange, 'title': 'Office tools' }))
  expect(screen.getByText('Office')).toBeTruthy()
  const input = screen.getByRole('checkbox', { name: 'Office' })
  expect(input.closest('label')?.title).toBe('Office tools')
  fireEvent.click(input)
  expect(onChange).toHaveBeenLastCalledWith(true)
})
