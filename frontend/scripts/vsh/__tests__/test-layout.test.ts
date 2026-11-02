import { describe, expect, it } from 'vite-plus/test'
import { inspectTestLayout } from '../src/test-layout.ts'

describe('frontend test placement', () => {
  it('accepts package-root tests, nested fixtures and tooling tests', () => {
    expect(
      inspectTestLayout([
        'apps/web/src/main.ts',
        'apps/web/__tests__/features/chat/session.test.ts',
        'apps/web/__tests__/fixtures/startup.ts',
        'packages/ui/__tests__/button.test.ts',
        'packages/runtime-client/__tests__/contract.typecheck.ts',
        '__tests__/scripts/boundaries.test.ts',
      ]),
    ).toEqual([])
  })
  it('rejects tests and type contracts outside the owning root', () => {
    expect(
      inspectTestLayout([
        'apps/web/src/chat.test.ts',
        'apps/web/mock/chat.test.ts',
        'packages/ui/tests/icon.test.ts',
        'packages/runtime-client/src/contract.typecheck.ts',
        'scripts/boundaries.test.ts',
        'apps/web/src/__tests__/bad.test.ts',
      ]),
    ).toHaveLength(6)
  })
  it('rejects test-only fixtures and snapshots outside __tests__', () => {
    expect(
      inspectTestLayout(['apps/web/src/chat.fixture.ts', 'packages/ui/tests/__snapshots__/a.snap']),
    ).toHaveLength(2)
  })
})
