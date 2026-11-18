import { defineComponent, h } from 'vue'
import { IconFolderCloseRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { abbreviateHomePath, pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import type {} from '@deepseek-ai/dsh-working-directory/types'
import type { ProjectRowProps } from './slots.ts'
import css from './ProjectRow.module.css'
const ROOT = /^(?:[/\\]|[A-Za-z]:[/\\])$/
/** Working folder with setup-owned subscriptions, falling back to its creation directory then workspace. */
export const ProjectRow = defineComponent((p: ProjectRowProps) => {
  const { getTriggerProps } = p.useContextMenu()
  const current = p.useProjection('workingDirectory')
  const createdIn = p.useSessions(s => s.byId[p.sessionId]?.cwd)
  const workspace = p.useWorkspaces(s => s.items.find(item => item.sessionIds.includes(p.sessionId))?.path)
  const home = p.useHost(f => f.home)
  return () => {
    const path = current.value ?? createdIn.value ?? workspace.value
    if (path === undefined) return null
    const shown = abbreviateHomePath(path, home.value)
    const { directory, name } = pathPartsOf(shown)
    const parent = ROOT.test(directory) ? directory : directory.replace(/[/\\]+$/, '')
    const target = { kind: 'directory', value: { sessionId: p.sessionId, path } } as const
    return h('div', { ...getTriggerProps(target), 'data-session-panel-row': '', 'data-session-panel-project': '' }, [
      h('span', { 'data-row-part': 'body' }, [h('span', { 'data-row-part': 'icon', 'aria-hidden': 'true' }, [h(IconFolderCloseRegular, { size: 16 })]), h('span', { 'data-row-part': 'content' }, [h(Tooltip, { label: p.t('project.label') + '\n' + shown, side: 'left', delayMs: 500 }, { default: () => h('span', { class: css.folder, tabindex: 0 }, [h('span', { class: css.name }, name), parent !== '' ? h('span', { class: css.parent }, parent) : null]) })])]),
      h('span', { 'data-row-part': 'menu' }, [p.renderFactorySlot('contextMenu.button', { target, label: p.t('project.actions') })]),
    ])
  }
}, { props: ['sessionId', 'useProjection', 'useWorkspaces', 'useSessions', 'useHost', 'useContextMenu', 'renderFactorySlot', 't'] })
