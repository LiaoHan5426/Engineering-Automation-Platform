/** File navigation feedback belongs to the individual inline reference that requested it. */
import { defineComponent, h, Fragment, shallowRef } from 'vue'
import type { UserTextNodeProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal, ReferenceChip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NS } from './locales.ts'
import type {} from './user-text-rules.ts'

/** Session-authorized synchronous navigation; document reading belongs to the preview host. */
export interface FileReferenceInjected {
  /** Open or reveal a file using the originating Session's authority. @param path - decoded reference path. @throws On navigation failure, retained in the reference's retry dialog. */
  readonly openFile: (path: string) => void
  /** Resolve a reference from the live workspace root. @param path - Reference path. @returns Host path. */
  readonly resolveFilePath: (path: string) => string
}
type FileReferenceProps = UserTextNodeProps<'file'> & InjectFace<FileReferenceInjected> & PropsLocale<typeof NS>

/** Render a file chip with a local retry/close dialog for synchronous navigation failures. */
export const FileReference = defineComponent((props: FileReferenceProps) => {
  const menu = props.useContextMenu()
  const failedPath = shallowRef<string | null>(null)
  const close = () => { failedPath.value = null }
  const open = () => {
    const path = props.node.data.path
    try { props.openFile(path) } catch { failedPath.value = path; return }
    failedPath.value = null
  }
  return () => {
    const { path, label } = props.node.data
    return h(Fragment, null, [
      h(ReferenceChip, {
        appearance: 'file', label, title: props.raw,
        contextMenuProps: menu.getTriggerProps(props.interactive ? () => ({ kind: 'file', value: { sessionId: props.sessionId, path: props.resolveFilePath(path) } }) : undefined),
        ...(props.interactive ? { onActivate: open } : {}),
      }),
      props.interactive && failedPath.value === path ? h(Modal, {
        open: true, onClose: close, closeLabel: props.t('fileOpen.close'), title: props.t('fileOpen.title'),
        description: props.t('fileOpen.failed', { path }),
      }, { footer: () => [
        h(Button, { variant: 'outline', onClick: close }, () => props.t('fileOpen.close')),
        h(Button, { variant: 'primary', onClick: open }, () => props.t('fileOpen.retry')),
      ] }) : null,
    ])
  }
}, { props: ['node', 'raw', 'interactive', 'openFile', 'resolveFilePath', 'sessionId', 'useContextMenu', 't'] })

/** Directories remain noninteractive even when the containing text allows navigation. */
export const FolderReference = defineComponent((props: UserTextNodeProps<'folder'>) => () =>
  h(ReferenceChip, { appearance: 'folder', label: props.node.data.label, title: props.raw }),
{ props: ['node', 'raw', 'interactive'] })
