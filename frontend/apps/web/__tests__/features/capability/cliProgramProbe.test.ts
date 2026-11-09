// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi, type CliProgramItem } from '@eap/runtime-client'
import Manager from '../../../src/features/capability/CliProgramManager.vue'

let app: App | undefined
let root: HTMLDivElement
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
describe('CLI program probe shared projection', () => {
  it.each([true, false])(
    'refreshes the parent catalog after a probe with success=%s',
    async (success) => {
      const program: CliProgramItem = {
        id: 'git',
        name: 'Git',
        binary: 'git',
        builtin: true,
        channel: { binary: 'git', source: 'shipped', resolvedPath: '/bin/git' },
        operations: [],
      }
      vi.spyOn(runtimeApi, 'cliPrograms').mockResolvedValue({ items: [program] })
      vi.spyOn(runtimeApi, 'probeCliProgram').mockResolvedValue({
        capability: 'git',
        binary: 'git',
        source: 'shipped',
        resolvedPath: '/bin/git',
        executed: true,
        success,
        message: success ? 'probe complete' : 'probe failed',
      })
      const saved = vi.fn()
      root = document.createElement('div')
      document.body.append(root)
      app = createApp(Manager, { items: [], kind: null, onSaved: saved })
      app.mount(root)
      for (let i = 0; i < 8; i++) await Promise.resolve()
      await nextTick()
      const probe = [...root.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === '探测程序',
      )
      expect(probe).toBeDefined()
      probe!.click()
      for (let i = 0; i < 8; i++) await Promise.resolve()
      await nextTick()
      expect(runtimeApi.probeCliProgram).toHaveBeenCalledWith('git')
      expect(saved).toHaveBeenCalledOnce()
      expect(root.textContent).toContain(success ? '程序探测成功' : 'probe failed')
    },
  )
})
