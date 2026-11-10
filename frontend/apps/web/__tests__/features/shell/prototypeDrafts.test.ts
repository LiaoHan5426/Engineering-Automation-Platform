// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import {
  scopedPrototypeStorage,
  readDesignerRecovery,
  writeDesignerRecovery,
} from '../../../src/features/shell/prototypeDrafts'
import {
  emptyPrototypeSchema,
  loadPrototypeSchema,
  loadPrototypeVersions,
  savePrototypeSchema,
} from '../../../src/features/shell/prototypeSchema'
afterEach(() => localStorage.clear())
it('uses only source-scoped data and retains distinct local version histories', () => {
  localStorage.setItem(
    'eap.prototype-schema.v1',
    JSON.stringify(emptyPrototypeSchema('Old global')),
  )
  const alpha = scopedPrototypeStorage('builder-alpha'),
    beta = scopedPrototypeStorage('builder-beta')
  expect(loadPrototypeSchema(alpha)).toBeNull()
  expect(loadPrototypeSchema(beta)).toBeNull()
  savePrototypeSchema(emptyPrototypeSchema('Alpha'), alpha)
  savePrototypeSchema(emptyPrototypeSchema('Beta'), beta)
  savePrototypeSchema(emptyPrototypeSchema('Alpha second'), alpha)
  expect(loadPrototypeVersions(alpha).map((x) => x.title)).toEqual(['Alpha second', 'Alpha'])
  expect(loadPrototypeVersions(beta).map((x) => x.title)).toEqual(['Beta'])
})
it('restores unsaved and clean projects separately and refuses corrupt data without overwriting it', () => {
  const value = {
    format: 1 as const,
    sourceRef: 'builder-alpha' as const,
    title: 'Unpublished',
    project: { pages: ['draft'] },
    cleanTitle: 'Saved',
    cleanProject: { pages: ['saved'] },
  }
  writeDesignerRecovery(value)
  expect(readDesignerRecovery('builder-alpha')).toEqual(value)
  expect(readDesignerRecovery('builder-beta')).toBeNull()
  localStorage.setItem('eap.prototype-recovery.v1.builder-alpha', 'corrupt')
  expect(() => readDesignerRecovery('builder-alpha')).toThrow('DESIGNER_RECOVERY_INVALID')
  expect(localStorage.getItem('eap.prototype-recovery.v1.builder-alpha')).toBe('corrupt')
})
