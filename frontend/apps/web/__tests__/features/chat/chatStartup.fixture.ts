import { vi } from 'vite-plus/test'
import { runtimeApi } from '@eap/runtime-client'

/** Default read-only startup/plan observations; each test owns send and evidence behavior. */
export function mockChatStartup() {
  vi.spyOn(runtimeApi, 'chatPlan').mockResolvedValue(null)
  vi.spyOn(runtimeApi, 'chatGraph').mockImplementation(async (conversationId) => ({ conversationId, revision: 0, nodes: [], operations: [] }))
  vi.spyOn(runtimeApi, 'chatOperation').mockRejectedValue({ response: { status: 404 } })
  vi.spyOn(runtimeApi, 'aiStatus').mockResolvedValue({
    state: 'disabled',
    provider: 'none',
    model: '',
    configurationRevision: '',
    lastObservedAt: null,
    errorCode: '',
    tools: { git_status: false },
    workspaceLabel: '',
  })
  return vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    effectiveDefaultId: null,
    items: [],
  })
}
