// @vitest-environment jsdom
/** The Built-in plugins section: its heading, its tab row, and which tab is mounted. */
import { fireEvent, screen } from '@testing-library/dom'
import { defineComponent, h, ref } from 'vue'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { nextTick } from 'vue'

import { afterEach, describe, expect, it } from 'vitest'
import { PluginsSettingsSection } from '../src/client/PluginsSettingsSection.tsx'
import type {
  PluginsSettingsSectionProps,
  PluginsSettingsTabEntry,
} from '../src/client/PluginsSettingsSection.tsx'
import { en } from '../src/client/locales.ts'
afterEach(cleanup)
const t = (key: keyof typeof en) => en[key]
function renderSection(rows: readonly PluginsSettingsTabEntry[]) {
  const props = {
    t,
    useTabs: bindSnapshotSelector(createSnapshotStore(rows)),
    renderSlot: (
      _name: string,
      _owner: unknown,
      options: {
        only?: string
      },
    ) => h('span', {}, [options.only]),
  } as PluginsSettingsSectionProps
  render(
    h(PluginsSettingsSection, {
      ...props,
    }),
  )
}
describe('PluginsSettingsSection', () => {
  it('says so when no plugin contributed a tab', async () => {
    renderSection([])
    expect(screen.getByText(en.empty)).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
  })
  it('defaults to the first ordered tab and mounts another only after selection', async () => {
    renderSection([
      { id: 'configurable', order: 0, label: 'Configurable' },
      { id: 'all', order: 10, label: 'Plugin list' },
    ])
    const configurable = screen.getByRole('tab', { name: 'Configurable' })
    const all = screen.getByRole('tab', { name: 'Plugin list' })
    expect(configurable.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('configurable')).toBeTruthy()
    expect(screen.queryByText('all')).toBeNull()
    {
      fireEvent.click(all)
      await nextTick()
    }
    expect(all.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('all')).toBeTruthy()
    expect(screen.getByText('configurable').closest('[role="tabpanel"]')).toHaveProperty(
      'hidden',
      true,
    )
    {
      fireEvent.click(configurable)
      await nextTick()
    }
    expect(configurable.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('all').closest('[role="tabpanel"]')).toHaveProperty('hidden', true)
  })
  it('leads with its own heading and intro', async () => {
    renderSection([{ id: 'configurable', order: 0, label: 'Configurable' }])
    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.intro)).toBeTruthy()
  })
  it('moves focus and selection with standard horizontal tab keys', async () => {
    renderSection([
      { id: 'configurable', order: 0, label: 'Configurable' },
      { id: 'all', order: 10, label: 'Plugin list' },
      { id: 'diagnostics', order: 20, label: 'Diagnostics' },
    ])
    const configurable = screen.getByRole('tab', { name: 'Configurable' })
    const all = screen.getByRole('tab', { name: 'Plugin list' })
    const diagnostics = screen.getByRole('tab', { name: 'Diagnostics' })
    expect(configurable.getAttribute('tabindex')).toBe('0')
    expect(all.getAttribute('tabindex')).toBe('-1')
    configurable.focus()
    {
      fireEvent.keyDown(configurable, { key: 'ArrowRight' })
      await nextTick()
    }
    expect(document.activeElement).toBe(all)
    expect(all.getAttribute('aria-selected')).toBe('true')
    {
      fireEvent.keyDown(all, { key: 'End' })
      await nextTick()
    }
    expect(document.activeElement).toBe(diagnostics)
    {
      fireEvent.keyDown(diagnostics, { key: 'ArrowRight' })
      await nextTick()
    }
    expect(document.activeElement).toBe(configurable)
    {
      fireEvent.keyDown(configurable, { key: 'ArrowLeft' })
      await nextTick()
    }
    expect(document.activeElement).toBe(diagnostics)
    {
      fireEvent.keyDown(diagnostics, { key: 'Home' })
      await nextTick()
    }
    expect(document.activeElement).toBe(configurable)
    {
      fireEvent.keyDown(configurable, { key: 'Escape' })
      await nextTick()
    }
    expect(document.activeElement).toBe(configurable)
    expect(configurable.getAttribute('aria-selected')).toBe('true')
  })
  it('retains tab DOM and drafts while hidden and removes withdrawn contributions', async () => {
    const rows = createSnapshotStore<readonly PluginsSettingsTabEntry[]>([
      { id: 'a', order: 0, label: 'A' },
      { id: 'b', order: 1, label: 'B' },
      { id: 'c', order: 2, label: 'C' },
    ])
    const Draft = defineComponent(
      (props: { id: string }) => {
        const draft = ref('')
        return () =>
          h('input', {
            'aria-label': props.id,
            value: draft.value,
            onInput: (event: Event) => {
              if (event.target instanceof HTMLInputElement) draft.value = event.target.value
            },
          })
      },
      { props: ['id'] },
    )
    const props = {
      t,
      useTabs: bindSnapshotSelector(rows),
      renderSlot: (_name: string, _owner: unknown, options: { only?: string }) =>
        h(Draft, { id: options.only ?? '' }),
    } as PluginsSettingsSectionProps
    render(h(PluginsSettingsSection, props))
    expect(screen.queryByRole('textbox', { name: 'b' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'B' }))
    await nextTick()
    const input = screen.getByRole('textbox', { name: 'b' })
    fireEvent.input(input, { target: { value: 'retained draft' } })
    await nextTick()
    input.focus()
    fireEvent.click(screen.getByRole('tab', { name: 'A' }))
    await nextTick()
    expect(input.closest('[role="tabpanel"]')).toHaveProperty('hidden', true)
    fireEvent.click(screen.getByRole('tab', { name: 'B' }))
    await nextTick()
    expect(screen.getByRole('textbox', { name: 'b' })).toBe(input)
    expect(input).toHaveProperty('value', 'retained draft')
    rows.set(rows.getSnapshot().filter(row => row.id !== 'b'))
    await nextTick()
    expect(input.isConnected).toBe(false)
    expect(screen.getByRole('tab', { name: 'A' }).getAttribute('aria-selected')).toBe('true')
  })
})
