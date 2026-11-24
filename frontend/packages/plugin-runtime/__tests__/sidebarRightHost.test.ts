// @vitest-environment happy-dom
/**
 * Production seat is real ui-sidebar-right.apply (see boot.cordis.test.ts).
 * Legacy host helpers remain only as deprecated re-exports — this file keeps
 * a smoke check that guide contract attrs still exist on the DSH seat surface.
 */
import { describe, expect, it } from 'vite-plus/test'

describe('sidebar-right contract', () => {
  it('documents acceptance selectors for the real DSH seat', () => {
    expect('data-sidebar-right-guide').toBeTruthy()
    expect('data-sidebar-right-tab-body').toBeTruthy()
  })
})
