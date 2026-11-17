// @vitest-environment jsdom
import { shallowRef } from 'vue'
import { toolSeats } from './tool-seats.client.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { fireEvent } from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts'
import { useDisclosure } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/use-disclosure.ts'
import type { StartedToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { contextMenuHook, makeTranslate, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { en } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import { en as common } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { GenericToolCard } from '../src/client/tool/toolviews/GenericToolCard.tsx'
import { FileMutationRow } from '../src/client/tool/toolviews/file-mutation-row.tsx'
import { ReadRow } from '../src/client/tool/toolviews/read-row.tsx'
import { ReadImageRow } from '../src/client/tool/toolviews/read-image-row.tsx'
import { SearchRow } from '../src/client/tool/toolviews/search-row.tsx'
import { WebRow } from '../src/client/tool/toolviews/web-row.tsx'
import { DetailsRow } from '../src/client/tool/toolviews/details-row.tsx'
import { TodoRow } from '../src/client/tool/toolviews/todo-row.tsx'
import { AskQuestionRow } from '../src/client/tool/toolviews/ask-question-row.tsx'
import { BashRow } from '../src/client/tool/toolviews/bash-sample.tsx'
import { parsedToolCall } from '../src/client/tool/models/raw-tool-call.ts'
import { toolRowModel } from '../src/client/tool/models/tool-call-model.ts'
afterEach(cleanup)
type Props = Parameters<typeof GenericToolCard>[0] & InstanceType<typeof TodoRow>['$props'] & InstanceType<typeof ReadImageRow>['$props'] & InstanceType<typeof AskQuestionRow>['$props']
function preparation(name: string, args = new PartialArguments()): Extract<Props, {
  phase: 'preparing'
}> {
  return {
    ...toolSeats,
    getFileTriggerProps: () => ({}),
    useContextMenu: contextMenuHook(), resolveFilePath: path => path,
    phase: 'preparing', callId: 'call', toolName: name,
    block: { phase: 'preparing', args, callId: 'call', name, turn: 1, step: 1, time: 1, subCalls: [] },
    cwd: '/workspace', t: makeTranslate(en, common), useDisclosure, openFile: vi.fn(), loadImage: vi.fn(),
    useTodoHistory: vi.fn(() => shallowRef(undefined)), useSession: vi.fn(() => shallowRef(false)), renderSlot: vi.fn(() => null),
    useProjection: vi.fn(() => shallowRef(undefined)), revealPanel: vi.fn(() => false), reviewPanel: vi.fn(() => false),
  } as Extract<Props, {
    phase: 'preparing'
  }>
}
describe('tool preparation', () => {
  it.each(['read', 'write', 'edit'])('%s does not expose a malformed completed path as a file link', (name) => {
    const args = PartialArguments.fromText(String.raw `{"file_path":"unsafe.txt\q"}`)
    const props = preparation(name, args)
    expect(toolRowModel(name, props.block).filePath).toBeUndefined()
    expect(args.invalid).toBe(true)
  })
  it.each([
    ['read', (props: Props) => h(ReadRow, props)], ['read_image', (props: Props) => h(ReadImageRow, props)], ['write', (props: Props) => h(FileMutationRow, props)], ['edit', (props: Props) => h(FileMutationRow, props)], ['apply_patch', (props: Props) => h(FileMutationRow, props)],
    ['grep', (props: Props) => h(SearchRow, props)], ['glob', (props: Props) => h(SearchRow, props)], ['web_search', (props: Props) => h(WebRow, props)], ['web_fetch', (props: Props) => h(WebRow, props)],
    ['todo_write', (props: Props) => h(TodoRow, props)], ['ask_user_question', (props: Props) => h(AskQuestionRow, props)], ['subagent', (props: Props) => h(DetailsRow, props)], ['subagent_fork', (props: Props) => h(DetailsRow, props)],
    ['run_code', (props: Props) => h(GenericToolCard, props)], ['custom_tool', (props: Props) => h(GenericToolCard, props)],
  ] as const)('%s has a tool-owned prefix without arguments or disclosure', async (name, Component) => {
    const props = preparation(name)
    const view = await act(async () => render(Component(props)))
    expect(view.container.querySelector('[data-state="preparing"]')).not.toBeNull()
    expect(view.container.querySelector('svg')).not.toBeNull()
    expect(view.container.textContent?.trim()).not.toBe('')
    expect(view.queryByRole('button')).toBeNull()
    expect(view.container.querySelector('pre')).toBeNull()
    expect(parsedToolCall(props.block)).toBeNull()
    expect(toolRowModel(name, props.block)).toMatchObject({ state: 'preparing', bodyRaw: null, output: null, filePath: undefined })
    await act(async () => fireEvent.click(view.container.firstElementChild!))
    await act(async () => fireEvent.keyDown(view.container.firstElementChild!, { key: 'Enter' }))
    expect(view.container.querySelector('[aria-expanded="true"]')).toBeNull()
  })
  it.each([['write', 'content'], ['edit', 'new_string']])('%s hides content progress without a path', async (name, field) => {
    const args = new PartialArguments()
    args.append(`{"${field}":"hello`)
    const view = await act(async () => render(h(FileMutationRow, { ...toolSeats, ...preparation(name, args) }, undefined)))
    expect(view.queryByText('1KB')).toBeNull()
    expect(view.queryByRole('button')).toBeNull()
  })
  it.each([
    ['subagent', 'Create subagent'],
    ['subagent_fork', 'Fork subagent'],
  ])('%s keeps its streamed description through dispatch and creation', async (name, title) => {
    const args = new PartialArguments()
    const props = preparation(name, args)
    const view = await act(async () => render(h(DetailsRow, { ...toolSeats, ...props }, undefined)))
    expect(view.getByText(title)).toBeTruthy()
    args.append('{"prompt":"Research products in detail.","description":"Research')
    await act(async () => { view.rerender(h(DetailsRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.getByText('Research')).toBeTruthy()
    args.append(' CLI products"}')
    await act(async () => { view.rerender(h(DetailsRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.getByText('Research CLI products')).toBeTruthy()
    const argsRaw = JSON.stringify({ description: 'Research CLI products', prompt: 'Research products in detail.' })
    const started: StartedToolCall = {
      ...props.block, phase: 'start', args: PartialArguments.fromText(argsRaw), argsRaw,
    }
    await act(async () => { view.rerender(h(DetailsRow, { ...toolSeats, ...props, 'phase': 'start', 'block': started }, undefined)) })
    expect(view.getByText('Research CLI products')).toBeTruthy()
    const settled: ToolResultNode = {
      kind: 'tool-result', seq: 3, time: 3, callId: 'call', callTime: 2, name,
      args: started.args, call: { name, argsRaw }, isError: false, subCalls: [],
      content: [{ type: 'text', text: 'started subagent child-1' }],
    }
    await act(async () => { view.rerender(h(DetailsRow, { ...toolSeats, ...props, 'phase': 'result', 'block': settled }, undefined)) })
    expect(view.getByText('Research CLI products')).toBeTruthy()
    expect(view.queryByText('Agent response')).toBeNull()
    await act(async () => fireEvent.click(view.getByRole('button', { expanded: false })))
    expect(view.getAllByText('Research CLI products')).toHaveLength(2)
    expect(view.getByText('Research products in detail.')).toBeTruthy()
    expect(view.getByText('child-1')).toBeTruthy()
  })
  it('names patch files once the streamed patch text completes', async () => {
    const args = new PartialArguments()
    const props = preparation('apply_patch', args)
    const view = await act(async () => render(h(FileMutationRow, { ...toolSeats, ...props }, undefined)))
    args.append(String.raw `{"input":"*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new`)
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(toolRowModel('apply_patch', props.block, '/workspace').summary).toBe('')
    expect(view.queryByText('src/a.ts')).toBeNull()
    args.append(String.raw `\n*** End Patch"}`)
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.getByText('Edit')).toBeTruthy()
    expect(view.getByText('src/a.ts')).toBeTruthy()
  })
  it('retains the file row through streamed arguments, dispatch, and result', async () => {
    const args = new PartialArguments()
    const props = preparation('write', args)
    const view = await act(async () => render(h(FileMutationRow, { ...toolSeats, ...props }, undefined)))
    const preparingRow = view.container.querySelector('[data-tool="write"]')
    args.append('{"file_path":"hello')
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.queryByRole('button')).toBeNull()
    args.append('.txt"')
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.getByText('hello.txt')).toBeTruthy()
    expect(view.queryByText('1KB')).toBeNull()
    args.append(',"content":"hello')
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.getByText('hello.txt')).toBeTruthy()
    expect(view.getByText('1KB')).toBeTruthy()
    args.append('"}')
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.getByText('1KB')).toBeTruthy()
    await act(async () => fireEvent.click(view.getByText('hello.txt')))
    expect(props.openFile).not.toHaveBeenCalled()
    const started: StartedToolCall = {
      phase: 'start', args: PartialArguments.fromText('{"file_path":"hello.txt","content":"hello"}'), callId: 'call', name: 'write', turn: 1, step: 1, time: 2, subCalls: [],
      argsRaw: '{"file_path":"hello.txt","content":"hello"}',
    }
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'phase': 'start', 'block': started }, undefined)) })
    const row = view.container.querySelector('[data-tool="write"]')
    expect(row).toBe(preparingRow)
    expect(view.getByText('hello.txt')).toBeTruthy()
    expect(view.container.querySelector('[data-state="running"]')).not.toBeNull()
    expect(view.getByText('1KB')).toBeTruthy()
    expect(row?.textContent).toMatch(/1KB.*\+1 -0/)
    await act(async () => fireEvent.click(view.getByText('hello.txt')))
    expect(props.openFile).not.toHaveBeenCalled()
    const result: ToolResultNode = {
      kind: 'tool-result', seq: 3, time: 3, callId: 'call', callTime: 2,
      name: 'write', args: PartialArguments.fromText(started.argsRaw),
      call: { name: 'write', argsRaw: started.argsRaw }, content: [], isError: false, subCalls: [],
      meta: { operation: 'create', path: '/workspace/hello.txt' },
    }
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'phase': 'result', 'block': result }, undefined)) })
    expect(view.container.querySelector('[data-tool="write"]')).toBe(row)
    expect(view.container.querySelector('[data-state="ok"]')).not.toBeNull()
    expect(view.getByText('1KB')).toBeTruthy()
    expect(row?.textContent).toMatch(/1KB.*\+1 -0/)
    await act(async () => fireEvent.click(view.getByRole('button', { name: 'hello.txt' })))
    expect(props.openFile).toHaveBeenCalledWith('/workspace/hello.txt')
  })
  it('keeps the combined edit size before diff totals in every stage', async () => {
    const argsRaw = JSON.stringify({ file_path: 'hello.txt', old_string: 'a'.repeat(600), new_string: 'b'.repeat(425) })
    const args = PartialArguments.fromText(argsRaw)
    const props = preparation('edit', args)
    const view = await act(async () => render(h(FileMutationRow, { ...toolSeats, ...props }, undefined)))
    const row = view.container.querySelector('[data-tool="edit"]')
    expect(view.getByText('2KB')).toBeTruthy()
    const started: StartedToolCall = { ...props.block, phase: 'start', argsRaw }
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'phase': 'start', 'block': started }, undefined)) })
    expect(row?.textContent).toMatch(/2KB.*\+1 -1/)
    const result: ToolResultNode = {
      kind: 'tool-result', seq: 3, time: 3, callId: 'call', callTime: 2,
      name: 'edit', args, call: { name: 'edit', argsRaw }, content: [], isError: false, subCalls: [],
      meta: { diffs: [{ path: 'hello.txt', oldText: 'before', newText: 'after' }] },
    }
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'phase': 'result', 'block': result }, undefined)) })
    expect(view.container.querySelector('[data-tool="edit"]')).toBe(row)
    expect(row?.textContent).toMatch(/2KB.*\+1 -1/)
  })
  it.each([
    ['custom_tool', (props: Props) => h(GenericToolCard, props), 'Tool call', 'custom_tool · Inspect this file'],
    ['subagent', (props: Props) => h(DetailsRow, props), 'Create subagent', 'Inspect this file'],
    ['subagent_fork', (props: Props) => h(DetailsRow, props), 'Fork subagent', 'Inspect this file'],
  ] as const)('%s retains its title and tool-name rule when arguments arrive', async (name, Component, title, summary) => {
    const props = preparation(name)
    const view = await act(async () => render(Component(props)))
    expect(view.getByText(title, { exact: true })).toBeTruthy()
    expect(toolRowModel(name, props.block).summary).toBe(name === 'custom_tool' ? name : '')
    expect(view.queryByText(name, { exact: true }) !== null).toBe(name === 'custom_tool')
    expect(view.queryByRole('button')).toBeNull()
    const started: StartedToolCall = {
      phase: 'start', args: PartialArguments.fromText('{"prompt":"Inspect this file"}'), callId: 'call', name, turn: 1, step: 1, time: 2, subCalls: [],
      argsRaw: '{"prompt":"Inspect this file"}',
    }
    await act(async () => { view.rerender(Component({ ...props, phase: 'start', block: started })) })
    expect(view.getByText(title, { exact: true })).toBeTruthy()
    expect(view.getByText(summary, { exact: true })).toBeTruthy()
    expect(view.getByRole('button', { expanded: false })).toBeTruthy()
    const result: ToolResultNode = {
      kind: 'tool-result', seq: 3, time: 3, callId: 'call', callTime: 2,
      name, args: PartialArguments.fromText(started.argsRaw),
      call: { name, argsRaw: started.argsRaw }, content: [], isError: false, subCalls: [],
    }
    await act(async () => { view.rerender(Component({ ...props, phase: 'result', block: result })) })
    expect(view.getByText(title, { exact: true })).toBeTruthy()
    expect(view.getByText(summary, { exact: true })).toBeTruthy()
  })
  it('updates edit progress when the combined strings cross a kilobyte', async () => {
    const args = new PartialArguments()
    args.append(`{"file_path":"hello.txt","old_string":"${'a'.repeat(600)}","new_string":"`)
    const props = preparation('edit', args)
    const view = await act(async () => render(h(FileMutationRow, { ...toolSeats, ...props }, undefined)))
    expect(view.getByText('1KB')).toBeTruthy()
    args.append('b'.repeat(424))
    expect(args.refresh()).toBe(false)
    args.append('b')
    expect(args.refresh()).toBe(true)
    await act(async () => { view.rerender(h(FileMutationRow, { ...toolSeats, ...props, 'block': { ...props.block } }, undefined)) })
    expect(view.getByText('2KB')).toBeTruthy()
  })
  it('shows a streamed Bash description without enabling expansion', async () => {
    const args = new PartialArguments()
    args.append('{"description":"List files')
    const view = await act(async () => render(h(BashRow, { ...toolSeats, ...preparation('bash', args), 'useSessions': bindSnapshotSelector(createSnapshotStore<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })) }, undefined)))
    expect(view.container.querySelector('[data-state="preparing"]')).not.toBeNull()
    expect(view.getByText('List files')).toBeTruthy()
    expect(view.queryByRole('button')).toBeNull()
  })
})
