// @vitest-environment jsdom
/** A detached tab cannot render Session-scoped extension rows. */
import { h, defineComponent, shallowRef } from 'vue'
import type { SessionAreaProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { TabMenuContent } from '../src/client/shell/TabMenuContent.tsx'
afterEach(cleanup)
it('renders no extension rows for another target or an unretained Session', async () => {
  const unused = (): never => { throw new Error('Unused framework seat') }
  const renderSlot = vi.fn(() => null)
  const props: InstanceType<typeof TabMenuContent>['$props'] = {
    ...allowAllAccess, dismiss: vi.fn(), useViews: select => shallowRef(select([])),
    useSessions: unused, useSessionRetainInfo: unused, usePanelInfo: unused,
    useSessionStatus: unused, useWorkspaces: unused, useContextMenu: unused,
    useResource: unused,
    SessionProvider: defineComponent((props: SessionAreaProps) => () => props.children, { props: ['session', 'children', 'empty'] }),
    renderSlot, target: { kind: 'image', value: { url: 'blob:original' } },
  }
  const view = render(h(TabMenuContent, props))
  await view.rerender(h(TabMenuContent, {
    ...props, target: { kind: 'tab', value: { sessionId: 'gone', paneId: 'gone', tab: {} } } as never,
  }))
  expect(view.container.textContent).toBe('')
  expect(renderSlot).not.toHaveBeenCalled()
})
