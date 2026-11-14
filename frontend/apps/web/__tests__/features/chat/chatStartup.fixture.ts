import { vi } from 'vite-plus/test'
import { runtimeApi } from '@eap/runtime-client'

/** Default read-only startup/plan observations; each test owns send and evidence behavior. */
export function mockChatStartup() {
  vi.spyOn(runtimeApi, 'chatPlan').mockResolvedValue(null)
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
