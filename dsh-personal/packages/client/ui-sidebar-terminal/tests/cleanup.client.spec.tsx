import { h, computed, ref } from 'vue'
// @vitest-environment jsdom
import { contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
/** Cleanup errors remain reachable after the terminal tab has disappeared. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent, within } from '@testing-library/dom'
import { allowAllAccess, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TerminalCloseFailure } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import { TerminalCleanup } from '../src/client/TerminalCleanup.tsx'
import { en } from '../src/client/locales.ts'
afterEach(cleanup)
type CleanupProps = InstanceType<typeof TerminalCleanup>['$props']
const unusedHook = (): never => { throw new Error('Terminal cleanup does not consume global hooks') }
const standard: Omit<CleanupProps, 'useCloseFailures' | 'retryClose' | 't'> = {
  useSessions: unusedHook, useSessionStatus: unusedHook, useSessionRetainInfo: unusedHook, usePanelInfo: unusedHook,
  useWorkspaces: unusedHook,
  useContextMenu: contextMenuHook(),
  useResource: unusedHook,
  ...allowAllAccess,
}
it('stays absent for ordinary closes and offers a retry only after cleanup fails', async () => {
  const failuresRef = ref<readonly TerminalCloseFailure[]>([])
  const retryClose = vi.fn<CleanupProps['retryClose']>()
  const useCloseFailures: CleanupProps['useCloseFailures'] = selector => computed(() => selector(failuresRef.value))
  const props: CleanupProps = { ...standard, useCloseFailures, retryClose, t: makeTranslate(en) }
  const view = render(h(TerminalCleanup, { ...props }))
  expect(view.container.childElementCount).toBe(0)
  failuresRef.value = [{ id: 'terminal' as WebTerminalId, title: 'Build', message: 'Host unavailable' }]
  await view.rerender(h(TerminalCleanup, { ...props }))
  expect(view.getByRole('alert').textContent).toContain('Terminal “Build” could not be ended: Host unavailable')
  await act(() => { fireEvent.click(view.getByRole('button', { name: en.retry })) })
  expect(retryClose).toHaveBeenCalledWith('terminal')
  failuresRef.value = []
  await view.rerender(h(TerminalCleanup, { ...props }))
  expect(view.container.childElementCount).toBe(0)
})
it('keeps cleanup failures separate and retries the terminal selected by the user', async () => {
  const failures: readonly TerminalCloseFailure[] = [
    { id: 'build' as WebTerminalId, title: 'Build', message: 'Host unavailable' },
    { id: 'tests' as WebTerminalId, title: 'Tests', message: 'Process did not exit' },
  ]
  const retryClose = vi.fn<CleanupProps['retryClose']>()
  const useCloseFailures: CleanupProps['useCloseFailures'] = selector => computed(() => selector(failures))
  const props: CleanupProps = { ...standard, useCloseFailures, retryClose, t: makeTranslate(en) }
  const view = render(h(TerminalCleanup, { ...props }))
  const notices = view.getAllByRole('alert')
  expect(notices.map(notice => notice.textContent)).toEqual([
    'Terminal “Build” could not be ended: Host unavailableRetry',
    'Terminal “Tests” could not be ended: Process did not exitRetry',
  ])
  await act(() => { fireEvent.click(within(notices[1]!).getByRole('button', { name: en.retry })) })
  expect(retryClose).toHaveBeenCalledExactlyOnceWith('tests')
})
