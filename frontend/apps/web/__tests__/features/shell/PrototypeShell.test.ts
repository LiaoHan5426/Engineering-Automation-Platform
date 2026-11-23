import { describe, expect, it } from 'vite-plus/test'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from '../../../src/App.vue'
import { i18n } from '../../../src/lib/i18n'
import { INSPECTOR_TABS } from '../../../src/features/shell/inspectorTabs'

const render = () => renderToString(createSSRApp(App).use(i18n))

/**
 * Ardot boards 01–18 / 07–18: the desktop shell is a 72px icon rail, a 288px
 * workspace sidebar, the main surface and a docked 380px read-only inspector.
 * These assertions cover the composition root, not the inspector component alone.
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

  it('docks the read-only inspector as the third body column on desktop', async () => {
    const html = await render()
    expect(html).toContain('body--inspector')
    expect(html).toContain('data-testid="workspace-inspector"')
    expect(html).toContain('id="workspace-inspector-panel"')
    expect(html).toContain('data-testid="toggle-workspace-inspector"')
    // The legacy `.inspector-toggle` class is display:none on desktop; the
    // prototype toggle needs its own visible class or the entry disappears.
    expect(html).toContain('workspace-inspector-toggle')
    expect(html).toContain('aria-controls="workspace-inspector-panel"')
    for (const tab of INSPECTOR_TABS.code) {
      expect(html).toContain(`data-testid="inspector-tab-${tab}"`)
    }
    // The SQL-only details inspector must not be mixed into the code landing page.
    expect(html).not.toContain('上下文详情')
  })

  it('does not mount a full-screen inspector backdrop on the desktop layout', async () => {
    const html = await render()
    expect(html).not.toContain('data-testid="workspace-inspector-backdrop"')
  })

  it('aligns the inspector tabs with the 56px top bar instead of a second title row', async () => {
    const html = await render()
    // The composition root must flag the docked layout so CSS can start the top
    // bar at 360px and end it before the 380px inspector tab strip.
    expect(html).toContain('app--inspector')
    expect(html).toContain('data-testid="inspector-tab-bar"')
    expect(html).toContain('data-testid="sidebar-head"')
    // Ardot boards 01/05/10/12 keep one 56px header row across the shell.
    // A separate "检查器 / 只读上下文" title row is not in the design.
    expect(html).not.toContain('workspace-inspector__title')
    expect(html).not.toContain('只读上下文')
  })
})
