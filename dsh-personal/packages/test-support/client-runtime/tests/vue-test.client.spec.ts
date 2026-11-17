// @vitest-environment jsdom
import { defineComponent, h, nextTick, onScopeDispose, shallowRef, watchEffect } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { render } from '../src/vue-test.ts'
import { renderVue } from '../../../client/ui-primitives/tests/vue-render.ts'

describe.each([
  ['client carrier', render],
  ['primitive carrier', renderVue],
] as const)('%s initial failures', (_name, mount) => {
  it('releases setup-owned reactive work before rethrowing a failed mount', async () => {
    const revision = shallowRef(0)
    const reads: number[] = []
    const disposed = vi.fn()
    const failure = new Error('initial component failed')
    const Failing = defineComponent({
      setup() {
        watchEffect(() => {
          reads.push(revision.value)
        })
        onScopeDispose(disposed)
        throw failure
      },
      render: () => null,
    })
    const before = document.body.childElementCount
    expect(() => mount(h(Failing))).toThrow(failure)
    expect(disposed).toHaveBeenCalledOnce()
    expect(document.body.childElementCount).toBe(before)
    revision.value += 1
    await nextTick()
    expect(reads).toEqual([0])
  })
})
