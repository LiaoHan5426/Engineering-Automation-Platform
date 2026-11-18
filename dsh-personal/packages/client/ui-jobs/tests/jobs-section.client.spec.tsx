// @vitest-environment jsdom
import { computed, h, nextTick, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { cleanup, fireEvent, render } from './vue-render.client.ts'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { JobsSnapshot, JobView, ObservedJob } from '@deepseek-ai/dsh-api-job-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { JobsSection, JobsRunningIndicator, type JobsSectionProps } from '../src/client/JobsSection.tsx'
import { createJobsSectionStore } from '../src/client/jobs-store.ts'
import { en } from '../src/client/locales.ts'
const SESSION = 'session' as SessionId
const t = makeTranslate(en)
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
  vi.stubGlobal('CSS', { supports: () => false })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
function job(id: string, over: Partial<JobView> = {}): JobView {
  return { id: id as JobView['id'], kind: 'bash', label: id, status: 'running', startedAt: 1000, output: { total: 0, earliest: 0 }, ...over }
}
function bench(rows: readonly JobView[], observed: Readonly<Record<string, ObservedJob>> = {}) {
  const snapshot = shallowRef<JobsSnapshot>({ rows: { [SESSION]: rows }, observed })
  const store = createJobsSectionStore().create()
  const stopRows = vi.fn(), stopObserve = vi.fn()
  const watchRows = vi.fn(() => stopRows), observe = vi.fn(() => stopObserve), killJob = vi.fn(async () => true)
  const props = {
    sessionId: SESSION, t, useJobs: <T,>(select: (s: JobsSnapshot) => T) => computed(() => select(snapshot.value)),
    useStore: bindSnapshotSelector(store), actions: store.actions, watchRows, observe, killJob,
    useAccess: () => computed(() => true),
    renderFactorySlot: (_name: string, p: { onToggle?: () => void; label?: string }) => p.onToggle ? h('button', { onClick: p.onToggle }, p.label) : null,
  } as JobsSectionProps
  return { props, snapshot, store, stopRows, stopObserve, watchRows, observe, killJob }
}
function labels(container: HTMLElement) { return [...container.querySelectorAll('[data-job-label]')].map(el => el.textContent) }
describe('Session panel jobs', () => {
  it('holds a roster watcher even with no rows and releases it on unmount', () => {
    const b = bench([]), view = render(h(JobsSection, b.props))
    expect(view.container.textContent).toBe(''); expect(b.watchRows).toHaveBeenCalledWith(SESSION)
    view.unmount(); expect(b.stopRows).toHaveBeenCalledOnce()
  })
  it('sorts live rows before settled rows and hides the settled tail until opened', async () => {
    const b = bench([job('done', { status: 'completed', finishedAt: 5000 }), job('old'), job('new', { startedAt: 2000 })])
    const view = render(h(JobsSection, b.props))
    expect(labels(view.container)).toEqual(['new', 'old'])
    await fireEvent.click(view.getByRole('button', { name: t('section.settledCount', { count: 1 }) }))
    expect(labels(view.container)).toEqual(['new', 'old', 'done'])
  })
  it('opens settled rows by default and preserves clearing across remounts', async () => {
    const b = bench([job('done', { status: 'completed', finishedAt: 5000 })])
    let view = render(h(JobsSection, b.props)); expect(labels(view.container)).toEqual(['done'])
    await fireEvent.click(view.getByRole('button', { name: t('section.clear') }))
    expect(labels(view.container)).toEqual([]); view.unmount()
    view = render(h(JobsSection, b.props)); expect(labels(view.container)).toEqual([])
  })
  it('shows six rows in full and folds seven to five, preserving the user choice', async () => {
    const b = bench(Array.from({ length: 7 }, (_, i) => job('job-' + i, { startedAt: i })))
    const view = render(h(JobsSection, b.props)); expect(labels(view.container)).toHaveLength(5)
    await fireEvent.click(view.getByRole('button', { name: t('live.more', { count: 2 }) }))
    expect(labels(view.container)).toHaveLength(7); view.unmount()
    expect(labels(render(h(JobsSection, b.props)).container)).toHaveLength(7)
  })
  it('observes only the expanded visible row and releases output on collapse or unmount', async () => {
    const b = bench([job('first'), job('second')]), view = render(h(JobsSection, b.props))
    expect(b.observe).not.toHaveBeenCalled()
    await fireEvent.click(view.getByRole('button', { name: t('row.expandAria', { label: 'first' }) }))
    expect(b.observe).toHaveBeenCalledWith(SESSION, 'first')
    b.snapshot.value = { ...b.snapshot.value, rows: { [SESSION]: [job('first', { progress: 'halfway' }), job('second')] } }
    await nextTick()
    expect(b.observe).toHaveBeenCalledTimes(1); expect(b.stopObserve).not.toHaveBeenCalled()
    await fireEvent.click(view.getByRole('button', { name: t('row.expandAria', { label: 'second' }) }))
    expect(b.stopObserve).toHaveBeenCalledOnce(); expect(b.observe).toHaveBeenLastCalledWith(SESSION, 'second')
    view.unmount(); expect(b.stopObserve).toHaveBeenCalledTimes(2)
  })
  it('keeps the elapsed clock ticking during frequent progress frames', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    const b = bench([job('live')]), view = render(h(JobsSection, b.props))
    for (let frame = 0; frame < 7; frame++) {
      await vi.advanceTimersByTimeAsync(200)
      b.snapshot.value = { ...b.snapshot.value, rows: { [SESSION]: [job('live', { progress: String(frame) })] } }
      await nextTick()
    }
    expect(view.getByRole('button', { name: t('row.expandAria', { label: 'live' }) }).textContent).toContain(t('duration.seconds', { seconds: 1 }))
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
  it('requires a second stop press and leaves the admitted request pending until a row frame', async () => {
    const b = bench([job('live')]), view = render(h(JobsSection, b.props))
    await fireEvent.click(view.getByRole('button', { name: t('kill.stopAria', { label: 'live' }) }))
    expect(b.killJob).not.toHaveBeenCalled()
    await fireEvent.click(view.getByRole('button', { name: t('kill.confirm') }))
    expect(b.killJob).toHaveBeenCalledWith(SESSION, 'live')
    expect(view.getByRole('button', { name: t('kill.stopAria', { label: 'live' }) }).hasAttribute('disabled')).toBe(true)
  })
  it('omits stop controls without job kill access', () => {
    const b = bench([job('live')]); b.props.useAccess = () => computed(() => false)
    const view = render(h(JobsSection, b.props)); expect(view.queryByRole('button', { name: t('kill.stopAria', { label: 'live' }) })).toBeNull()
  })
})
describe('Jobs running indicator', () => {
  it('counts stopping jobs and releases its own roster watcher even while the panel shows', async () => {
    const b = bench([job('one'), job('two', { status: 'stopping' })])
    const view = render(h(JobsRunningIndicator, { ...b.props, panelShown: false }))
    expect(view.container.textContent).toBe(t('indicator.running', { count: 2 }))
    await view.rerender(h(JobsRunningIndicator, { ...b.props, panelShown: true }))
    expect(view.container.textContent).toBe(''); expect(b.stopRows).not.toHaveBeenCalled()
    view.unmount(); expect(b.stopRows).toHaveBeenCalledOnce()
  })
})
