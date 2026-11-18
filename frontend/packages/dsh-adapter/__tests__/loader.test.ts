import { expect, it, vi } from 'vite-plus/test'
import * as React from 'react'
import * as cordis from '@deepseek-ai/cordis'
import { createClientModuleSystem, contextMenu } from '../generated/original.js'
it('uses genuine registration, shared identities and one materialization; rejects unknown modules', async () => {
  const factory = vi.fn((require: (id: string) => unknown) => {
    expect(require('react')).toBe(React)
    expect(require('@deepseek-ai/cordis')).toBe(cordis)
    return contextMenu
  })
  const transport = vi.fn(() => {
    throw new Error('DSH_UNREVIEWED_RESOURCE')
  })
  const loader = createClientModuleSystem(
    { mode: 'queue', pendingQueue: [] },
    { id: 'bootstrap', exports: {} },
    {
      boot: { rev: 'fixture', entries: [], batches: [] },
      staticModules: [
        { id: 'react', factory: () => React },
        { id: '@deepseek-ai/cordis', factory: () => cordis },
        { id: 'menu', factory },
      ],
      loadBundle: transport,
    },
  )
  expect(await loader.import('menu')).toBe(contextMenu)
  expect(await loader.import('menu')).toBe(contextMenu)
  expect(factory).toHaveBeenCalledTimes(1)
  await expect(loader.import('https://example.test/arbitrary.js')).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
  await loader.dispose()
})
