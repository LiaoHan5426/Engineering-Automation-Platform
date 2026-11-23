// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import InteractionPatterns from '../../../src/features/shell/InteractionPatterns.vue'
import { i18n } from '../../../src/lib/i18n'

describe('InteractionPatterns', () => {
  let root: HTMLDivElement
  let app: App | undefined
  let navigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    root = document.createElement('div')
    document.body.append(root)
    navigate = vi.fn()
  })

  afterEach(() => {
    app?.unmount()
    app = undefined
    root.remove()
  })

  async function mount() {
    app = createApp(InteractionPatterns, { onNavigate: navigate })
    app.use(i18n)
    app.mount(root)
    await nextTick()
  }

  function find(testId: string, scope: ParentNode = document.body): HTMLElement | null {
    return scope.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  }

  async function toggle(testId: string, scope: ParentNode = document.body) {
    const input = find(testId, scope) as HTMLInputElement | null
    expect(input).toBeTruthy()
    input!.checked = !input!.checked
    input!.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
  }

  async function click(testId: string, scope: ParentNode = document.body) {
    const node = find(testId, scope)
    expect(node).toBeTruthy()
    node!.click()
    await nextTick()
  }

  it('renders the six prototype patterns and the reference boundary', async () => {
    await mount()
    for (const id of [
      'pattern-dialog',
      'pattern-confirm',
      'pattern-drawer',
      'pattern-wizard',
      'pattern-dropdown',
      'pattern-toast',
    ]) {
      expect(find(id, root)).toBeTruthy()
    }
    expect(find('patterns-boundary', root)?.textContent).toContain('不写入后端或本机数据')
    expect(find('patterns-title', root)?.textContent).toContain('交互形态原型库')
  })

  it('keeps the dialog modal and records no real write on cancel or submit', async () => {
    await mount()
    await click('pattern-dialog-open', root)
    const layer = find('pattern-dialog-layer')
    expect(layer).toBeTruthy()
    expect(find('pattern-dialog-provider', layer!)?.getAttribute('placeholder')).toContain('OpenAI')

    await click('pattern-dialog-cancel', layer!)
    expect(find('pattern-dialog-status', root)?.textContent).toContain('没有产生写入')
    expect(find('pattern-dialog-layer')).toBeNull()

    await click('pattern-dialog-open', root)
    const reopened = find('pattern-dialog-layer')!
    await click('pattern-dialog-submit', reopened)
    expect(find('pattern-dialog-status', root)?.textContent).toContain('没有写入连接配置')
    expect(find('pattern-dialog-layer')).toBeNull()
  })

  it('gates the destructive confirmation behind an explicit acknowledgement', async () => {
    await mount()
    const open = find('pattern-confirm-open', root) as HTMLButtonElement
    expect(open.disabled).toBe(true)

    await toggle('pattern-confirm-ack', root)
    expect((find('pattern-confirm-open', root) as HTMLButtonElement).disabled).toBe(false)
    await click('pattern-confirm-open', root)

    const layer = document.body.querySelector('.eap-confirm') as HTMLElement | null
    expect(layer).toBeTruthy()
    expect(layer?.textContent).toContain('删除数据源')
    expect(layer?.textContent).toContain('不可撤销')
    ;(layer!.querySelector('[data-confirm-cancel]') as HTMLElement).click()
    await nextTick()
    expect(find('pattern-confirm-status', root)?.textContent).toContain('没有删除任何配置')
  })

  it('opens and closes the observation drawer without leaving the page', async () => {
    await mount()
    await click('pattern-drawer-open', root)
    const layer = find('pattern-drawer-layer')
    expect(layer?.textContent).toContain('任务详情 · RUN-2041')
    expect(find('pattern-drawer-step-three', layer!)?.textContent).toContain('等待审批')
    ;(layer!.querySelector('[data-eap-dialog-close]') as HTMLElement).click()
    await nextTick()
    expect(find('pattern-drawer-status', root)?.textContent).toContain('仍停留在当前页面')
  })

  it('blocks wizard steps until their preconditions are acknowledged', async () => {
    await mount()
    await click('pattern-wizard-open', root)
    let layer = find('pattern-wizard-layer')!
    expect(find('pattern-wizard-step', layer)?.textContent).toContain('第 1 步')

    await click('pattern-wizard-next', layer)
    expect(find('pattern-wizard-status', root)?.textContent).toContain('前置确认')
    expect(find('pattern-wizard-step', find('pattern-wizard-layer')!)?.textContent).toContain(
      '第 1 步',
    )

    const name = find('pattern-wizard-name', find('pattern-wizard-layer')!) as HTMLInputElement
    name.value = '示例集合'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await click('pattern-wizard-next', find('pattern-wizard-layer')!)
    layer = find('pattern-wizard-layer')!
    expect(find('pattern-wizard-step', layer)?.textContent).toContain('第 2 步')

    await click('pattern-wizard-next', layer)
    expect(find('pattern-wizard-status', root)?.textContent).toContain('前置确认')
    await toggle('pattern-wizard-ack', find('pattern-wizard-layer')!)
    await click('pattern-wizard-next', find('pattern-wizard-layer')!)
    expect(find('pattern-wizard-step', find('pattern-wizard-layer')!)?.textContent).toContain(
      '第 3 步',
    )

    await toggle('pattern-wizard-ack', find('pattern-wizard-layer')!)
    await click('pattern-wizard-next', find('pattern-wizard-layer')!)
    expect(find('pattern-wizard-step', find('pattern-wizard-layer')!)?.textContent).toContain(
      '第 4 步',
    )

    await click('pattern-wizard-next', find('pattern-wizard-layer')!)
    expect(find('pattern-wizard-status', root)?.textContent).toContain('没有创建知识集合')
    expect(find('pattern-wizard-layer')).toBeNull()
  })

  it('keeps batch-menu selections in the demo status only', async () => {
    await mount()
    expect(find('pattern-dropdown-trigger', root)?.textContent).toContain('批量操作')
    await click('pattern-dropdown-trigger', root)
    const item = find('pattern-menu-rename')
    expect(item).toBeTruthy()
    item!.click()
    await nextTick()
    expect(find('pattern-dropdown-status', root)?.textContent).toContain('不执行重命名')
  })

  it('dismisses and replays semantic toasts', async () => {
    await mount()
    expect(find('pattern-toast-success', root)?.textContent).toContain('连接已验证并保存')
    expect(find('pattern-toast-error', root)?.textContent).toContain('验证失败')
    await click('pattern-toast-action', root)
    expect(find('pattern-toast-log', root)?.textContent).toContain('没有真实日志文件')

    const dismissId = find('pattern-toast-error', root)?.getAttribute('data-testid')
    expect(dismissId).toBe('pattern-toast-error')
    const dismissButton = find('pattern-toast-dismiss-2', root)
    expect(dismissButton).toBeTruthy()
    dismissButton!.click()
    await nextTick()
    expect(find('pattern-toast-error', root)).toBeNull()

    await click('pattern-toast-replay', root)
    expect(find('pattern-toast-error', root)).toBeTruthy()
  })

  it('returns to settings from the reference surface', async () => {
    await mount()
    await click('patterns-back', root)
    expect(navigate).toHaveBeenCalledWith('settings')
    await click('patterns-rail-code', root)
    expect(navigate).toHaveBeenCalledWith('chat')
  })
})
