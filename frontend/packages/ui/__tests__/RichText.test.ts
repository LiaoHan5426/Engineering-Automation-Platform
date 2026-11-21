// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import RichText from '../src/rich-text/RichText.vue'

let app: App | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.innerHTML = ''
})

function mount(source: string) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(RichText, { source }) })
  app.mount(host)
  return host
}

it('renders emphasis, inline code and headings as real elements', async () => {
  const host = mount('## 结论\n\n状态为 **通过**，规则 `rule-1`。')
  await nextTick()
  expect(host.querySelector('[role="heading"]')?.textContent).toContain('结论')
  expect(host.querySelector('strong')?.textContent).toBe('通过')
  expect(host.querySelector('code')?.textContent).toBe('rule-1')
})

it('never turns model output into executable markup', async () => {
  const host = mount('<script>window.__pwned = 1</script>\n\n<img src=x onerror=alert(1)>')
  await nextTick()
  expect(host.querySelector('script')).toBeNull()
  expect(host.querySelector('img')).toBeNull()
  expect(host.textContent).toContain('<script>')
})

it('renders a table inside a horizontally scrollable wrapper', async () => {
  const host = mount('| 规则 | 级别 |\n| --- | --- |\n| 全表扫描 | 警告 |')
  await nextTick()
  expect(host.querySelector('.eap-rich-text__scroller table')).not.toBeNull()
  expect(host.querySelectorAll('tbody td')).toHaveLength(2)
})

it('copies the fenced block content and confirms on the button', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  const host = mount('```sql\nselect 1\n```')
  await nextTick()
  const button = host.querySelector<HTMLButtonElement>('[data-testid="rich-text-copy"]')!
  expect(button.textContent?.trim()).toBe('复制')
  button.click()
  // `copy` awaits the clipboard promise before flipping the label.
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
  expect(writeText).toHaveBeenCalledWith('select 1')
  expect(button.textContent?.trim()).toBe('已复制')
})

it('renders nothing for empty input', () => {
  const host = mount('')
  expect(host.querySelector('.eap-rich-text')?.children.length ?? 0).toBe(0)
})
