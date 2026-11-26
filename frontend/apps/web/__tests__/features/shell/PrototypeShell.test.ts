import { describe, expect, it } from 'vite-plus/test'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from '../../../src/App.vue'
import { createMessagePlugin } from '@eap/message'
import { i18n } from '../../../src/lib/i18n'

const render = () => renderToString(createSSRApp(App).use(i18n).use(createMessagePlugin()))

/**
 * The desktop shell is a 72px icon rail, a workspace sidebar, and the main surface.
 * The right column is the layout sidebar, not a docked inspector.
 */
describe('prototype desktop shell composition', () => {
  it('renders five icon-only activity entries with accessible names', async () => {
    const html = await render()
    const activity = html.slice(html.indexOf('class="activity-bar"'), html.indexOf('</nav>'))
    expect((activity.match(/<button/g) ?? []).length).toBe(5)
    for (const name of ['code · 编程', 'work · 办公', '场景', '专家', '设置']) {
      expect(activity).toContain(`aria-label="${name}"`)
      expect(activity).toContain(name)
    }
    // Labels stay in the DOM for assistive tech but are visually hidden, so the
    // rail does not grow into the old 64px text-button strip.
    expect((activity.match(/class="activity-label"/g) ?? []).length).toBe(5)
    expect(activity).not.toContain('activity-brand-button')
    expect(activity).not.toContain('activity-avatar-button')
  })

  it('does not dock a read-only inspector beside the work surface', async () => {
    const html = await render()
    expect(html).not.toContain('body--inspector')
    expect(html).not.toContain('data-testid="workspace-inspector"')
    expect(html).not.toContain('data-testid="toggle-workspace-inspector"')
    expect(html).not.toContain('检查器')
    // The SQL-only details inspector must not be mixed into the code landing page.
    expect(html).not.toContain('上下文详情')
  })

  it('does not mount a full-screen inspector backdrop on the desktop layout', async () => {
    const html = await render()
    expect(html).not.toContain('data-testid="workspace-inspector-backdrop"')
  })

  it('keeps one header row and the navigation head without an inspector title', async () => {
    const html = await render()
    expect(html).not.toContain('app--inspector')
    expect(html).not.toContain('data-testid="inspector-tab-bar"')
    expect(html).toContain('data-testid="sidebar-head"')
    expect(html).not.toContain('workspace-inspector__title')
    expect(html).not.toContain('只读上下文')
  })
})
