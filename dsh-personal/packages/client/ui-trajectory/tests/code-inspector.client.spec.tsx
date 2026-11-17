import { h, nextTick } from 'vue'
// @vitest-environment jsdom
/** PTC source, output, and independent wrapping through the trajectory inspector. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render as renderNative, act } from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent, waitFor, within } from '@testing-library/dom'
const render = async (...args: Parameters<typeof renderNative>) => {
  const view = renderNative(...args)
  await nextTick()
  return view
}
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TrajectoryTable } from '../src/client/TrajectoryTable.tsx'
import { deriveTrajectoryLayout } from '../src/client/layout.ts'
import type { TrajectoryCellProps } from '../src/client/trajectory-record.ts'
import { t } from './locale.client.ts'
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const SOURCE = 'const value = await tools.bash({ command: "pwd" })\nreturn value\n'
const ARGS = JSON.stringify({ code: SOURCE, description: 'Read the working directory' })
const CELL: TrajectoryCellProps = {
  index: 1, kind: 'tool', toolName: 'run_code', text: `run_code · ${ARGS}`, callId: 'code-1',
  inputDetail: ARGS, outputDetail: 'printed line\n42', result: 'printed line', timeSeconds: 0.5,
}
function Harness({ cell = CELL, getDefault = () => false, setDefault = () => { } }: {
  cell?: TrajectoryCellProps
  getDefault?: () => boolean
  setDefault?: (value: boolean) => void
}) {
  return h(TrajectoryTable, { 'turns': [{ turn: 1, groups: [{ title: 'Step 1', cells: [cell] }] }], 'renderSlot': () => null, 'loadImage': async () => 'blob:unused', 't': t, 'stringWrapping': { label: 'Wrap lines', getDefault, setDefault }, 'collapsedTurns': new Set<number>(), 'onToggleTurn': () => { }, 'collapsedAssistants': new Set<string>(), 'onToggleAssistant': () => { }, 'collapsedTools': new Set<string>(), 'onToggleTool': () => { } })
}
function failedCell(name: string, texts: readonly string[], nested: boolean): TrajectoryCellProps {
  const argsRaw = name === 'run_code' ? ARGS : '{"file_path":"missing.txt"}'
  const result: ToolResultNode = {
    kind: 'tool-result', seq: 1, time: 1000, callId: 'failed-call', name,
    args: PartialArguments.fromText(argsRaw), call: { name, argsRaw }, callTime: 500,
    content: texts.map(text => ({ type: 'text', text })), isError: true,
    error: { name: 'ToolError', code: 'TOOL_FAILED' }, subCalls: [],
  }
  const turns = deriveTrajectoryLayout({
    nodes: nested ? [{ ...result, callId: 'parent', name: 'run_code', isError: false, subCalls: [result] }] : [result],
    partial: null, runningCalls: [],
  }, t)
  return turns.flatMap(turn => turn.groups.flatMap(group => group.cells))
    .find(cell => cell.kind === (nested ? 'subtool' : 'tool'))!
}
describe('PTC trajectory inspector', () => {
  it.each([
    ['run_code', false], ['read', false], ['read', true],
  ] as const)('keeps failed %s JSON output as raw text (nested: %s)', async (name, nested) => {
    const output = '{ "reason" : "missing", "steps": [1, 2] }\n'
    const view = await (async () => {
      const nativeView = await render(h(Harness, { 'cell': failedCell(name, [output], nested) }))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    await act(() => fireEvent.click(ui.getByRole('row', { name: /TOOL/ })))
    for (const tab of ['Summary', 'Result']) {
      await act(() => fireEvent.click(ui.getByRole('tab', { name: tab })))
      const panel = ui.getByRole('tabpanel')
      expect(within(panel).queryByRole('tree', { name: 'Result JSON' })).toBeNull()
      expect([...panel.querySelectorAll('pre')].filter(pre => pre.textContent === output)).toHaveLength(1)
    }
  })
  it.each([
    ['run_code', false], ['read', false], ['read', true],
  ] as const)('keeps error details for empty %s blocks (nested: %s)', async (name, nested) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const cell = failedCell(name, ['', ''], nested)
    expect(cell.outputDetail).toBe('ToolError: TOOL_FAILED')
    const view = await (async () => {
      const nativeView = await render(h(Harness, { 'cell': cell }))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    expect(ui.getByRole('row', { name: /TOOL/ }).textContent).toContain('TOOL_FAILED')
    await act(() => fireEvent.click(ui.getByRole('row', { name: /TOOL/ })))
    for (const tab of ['Summary', 'Result']) {
      await act(() => fireEvent.click(ui.getByRole('tab', { name: tab })))
      expect(ui.getByRole('tabpanel').textContent).toContain('ToolError: TOOL_FAILED')
    }
    if (name === 'run_code') {
      await act(() => fireEvent.click(ui.getByRole('tab', { name: 'Summary' })))
      await act(() => fireEvent.click(ui.getByRole('button', { name: 'Copy output' })))
      await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('ToolError: TOOL_FAILED') })
    }
  })
  it.each([
    ['run_code', false], ['read', false], ['read', true],
  ] as const)('keeps whitespace-only %s failure text verbatim (nested: %s)', async (name, nested) => {
    const output = ' \n\t '
    const cell = failedCell(name, [output], nested)
    expect(cell.resultPreviewMarkdown).toBe(output)
    expect(cell.outputDetail).toBe(output)
    const view = await (async () => {
      const nativeView = await render(h(Harness, { 'cell': cell }))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    await act(() => fireEvent.click(ui.getByRole('row', { name: /TOOL/ })))
    for (const tab of ['Summary', 'Result']) {
      await act(() => fireEvent.click(ui.getByRole('tab', { name: tab })))
      const panel = ui.getByRole('tabpanel')
      expect(panel.textContent).not.toContain('ToolError: TOOL_FAILED')
      expect([...panel.querySelectorAll('pre')].filter(pre => pre.textContent === output)).toHaveLength(1)
    }
  })
  it.each(['run_code', 'read'])('preserves the recorded %s failure in the ledger and inspector', async (name) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const output = name === 'run_code'
      ? "Error: code run failed (exception): Identifier 'value' has already been declared\nCaptured output:\nstep one\n"
      : 'Error: missing.txt does not exist\nCheck the file path.\n'
    const argsRaw = name === 'run_code' ? ARGS : '{"file_path":"missing.txt"}'
    const turns = deriveTrajectoryLayout({
      nodes: [{
        kind: 'tool-result', seq: 1, time: 1000, callId: 'failed-call', name,
        args: PartialArguments.fromText(argsRaw), call: { name, argsRaw }, callTime: 500,
        content: [{ type: 'text', text: output }], isError: true,
        error: { name: 'CodeRunFailedError', code: 'CODE_RUN_FAILED' }, subCalls: [],
      }],
      partial: null, runningCalls: [],
    }, t)
    const cell = turns.flatMap(turn => turn.groups.flatMap(group => group.cells))[0]!
    const view = await (async () => {
      const nativeView = await render(h(Harness, { 'cell': cell }))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    expect(ui.getByRole('row', { name: /TOOL/ }).textContent).toContain(output.split('\n')[0])
    await act(() => fireEvent.click(ui.getByRole('row', { name: /TOOL/ })))
    for (const tab of ['Summary', 'Result']) {
      await act(() => fireEvent.click(ui.getByRole('tab', { name: tab })))
      const panel = ui.getByRole('tabpanel')
      expect(panel.textContent).not.toContain('CodeRunFailedError: CODE_RUN_FAILED')
      expect([...panel.querySelectorAll('pre')].filter(pre => pre.textContent === output)).toHaveLength(1)
    }
    if (name === 'run_code') {
      await act(() => fireEvent.click(ui.getByRole('tab', { name: 'Summary' })))
      await act(() => fireEvent.click(ui.getByRole('button', { name: 'Copy output' })))
      await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith(output) })
    }
  })
  it.each(['run_code', 'cua_run_code'])('shows the %s description, numbered source, original arguments, and verbatim output', async (toolName) => {
    const view = await (async () => {
      const nativeView = await render(h(Harness, { 'cell': { ...CELL, toolName, text: `${toolName} · ${ARGS}` } }))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    await act(() => fireEvent.click(ui.getByRole('row', { name: new RegExp(`${toolName} Read the working directory`) })))
    expect(ui.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Summary', 'Code', 'Result', 'Schema', 'Timing'])
    expect(ui.getByRole('tabpanel').textContent).toContain('Read the working directory')
    expect(view.container.querySelector('[data-line-numbers] pre')?.textContent).toBe(SOURCE.trimEnd())
    expect(ui.getByRole('tabpanel').textContent).toContain('printed line\n42')
    await act(() => fireEvent.click(ui.getByRole('button', { name: 'Code' })))
    expect(ui.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true')
    await act(() => fireEvent.click(ui.getByRole('button', { name: 'Original JSON' })))
    expect(ui.getByRole('tree', { name: 'parameters JSON' }).textContent).toContain('description:')
    await act(() => fireEvent.click(ui.getByRole('button', { name: 'Original JSON' })))
    expect(view.container.querySelector('[data-line-numbers] pre')?.textContent).toBe(SOURCE.trimEnd())
  })
  it('copies exact source, raw JSON, and output with feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const view = await (async () => {
      const nativeView = await render(h(Harness, null))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    await act(() => fireEvent.click(ui.getByRole('row', { name: /run_code Read/ })))
    await act(() => fireEvent.click(ui.getByRole('button', { name: 'Copy code' })))
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith(SOURCE) })
    await waitFor(() => { expect(ui.getByRole('button', { name: 'Copied' })).toBeTruthy() })
    await act(() => fireEvent.click(ui.getByRole('button', { name: 'Copy output' })))
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith('printed line\n42') })
    await act(() => fireEvent.click(ui.getByRole('tab', { name: 'Code' })))
    await act(() => fireEvent.click(ui.getByRole('button', { name: 'Original JSON' })))
    await act(() => fireEvent.click(ui.getByRole('button', { name: 'Copy JSON' })))
    await waitFor(() => { expect(writeText).toHaveBeenLastCalledWith(ARGS) })
  })
  it('samples the last wrapping choice on open without changing another open inspector', async () => {
    let preference = false
    const props = { getDefault: () => preference, setDefault: (value: boolean) => { preference = value } }
    const first = await (async () => {
      const nativeView = await render(h(Harness, { ...props }))
      await act(() => { })
      return nativeView
    })()
    const second = await (async () => {
      const nativeView = await render(h(Harness, { ...props }))
      await act(() => { })
      return nativeView
    })()
    const a = within(first.container)
    const b = within(second.container)
    await act(() => fireEvent.click(a.getByRole('row', { name: /run_code Read/ })))
    await act(() => fireEvent.click(b.getByRole('row', { name: /run_code Read/ })))
    await act(() => fireEvent.click(a.getByRole('button', { name: 'Wrap lines' })))
    expect(preference).toBe(true)
    expect(a.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('true')
    expect(b.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('false')
    await act(() => fireEvent.click(b.getByRole('tab', { name: 'Code' })))
    expect(b.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('true')
    await act(() => fireEvent.click(b.getByRole('button', { name: 'Wrap lines' })))
    expect(preference).toBe(false)
    expect(a.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('true')
    await act(() => fireEvent.click(a.getByRole('button', { name: 'Close details' })))
    await act(() => fireEvent.click(a.getByRole('row', { name: /run_code Read/ })))
    expect(a.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe('false')
  })
  it('shows pending execution and keeps a failed run’s captured output', async () => {
    const pending = { ...CELL, timeSeconds: null }
    delete pending.result
    delete pending.outputDetail
    const view = await (async () => {
      const nativeView = await render(h(Harness, { 'cell': pending }))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    await act(() => fireEvent.click(ui.getByRole('row', { name: /run_code Read/ })))
    expect(ui.getByRole('tabpanel').textContent).toContain('Running…')
    await view.rerender(h(Harness, { 'cell': { ...CELL, isError: true, outputDetail: 'Error: execution failed\nCaptured output:\nstep one' } }))
    expect(ui.getByRole('tabpanel').textContent).toContain('Failed')
    expect(ui.getByRole('tabpanel').textContent).toContain('Error: execution failed\nCaptured output:\nstep one')
  })
  it('uses a tree for complete JSON output and generic input for malformed arguments', async () => {
    const view = await (async () => {
      const nativeView = await render(h(Harness, { 'cell': { ...CELL, outputDetail: '{"passed":12,"failed":0}' } }))
      await act(() => { })
      return nativeView
    })()
    const ui = within(view.container)
    await act(() => fireEvent.click(ui.getByRole('row', { name: /run_code Read/ })))
    expect(ui.getByRole('tree', { name: 'Result JSON' }).textContent).toContain('passed:12')
    await view.rerender(h(Harness, { 'cell': { ...CELL, inputDetail: '{"code":3}' } }))
    expect(ui.getByRole('tab', { name: 'Payload' })).toBeTruthy()
    expect(ui.queryByRole('tab', { name: 'Code' })).toBeNull()
    expect(ui.getByRole('tree', { name: 'Payload JSON' }).textContent).toContain('code:3')
  })
})
