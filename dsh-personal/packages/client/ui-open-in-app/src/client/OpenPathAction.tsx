/** File association adapter for the shared file/directory opening control. */
import { h, defineComponent, watch, type VNodeChild } from 'vue'
import type { SessionWorkspacePathApplication } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import type { OpenInAppPathAction } from './open-path.ts'
import type { OpenInAppOutcome } from './outcome.ts'
import { useFileApplications } from './file-applications.ts'
import { OpenTargetButton, type OpenTargetReporter } from './OpenTargetButton.tsx'
import type { NS } from './locales.ts'
/** Desktop availability and the gesture carrier injected into both path controls. */
export interface OpenPathInjected extends OpenTargetReporter {
  hooks: {
    openInAppDesktop: ObservableSnapshot<boolean | null>
  }
  loadDesktop: () => Promise<void>
  openPath: (
    path: string,
    action: OpenInAppPathAction,
    application?: string,
  ) => Promise<OpenInAppOutcome>
  applications: (
    path: string,
    signal: AbortSignal,
  ) => Promise<readonly SessionWorkspacePathApplication[] | null>
}
/** Full props of the document-header contribution. */
export type OpenPathActionProps = PropsRuntime<'sidebar.right.tab.document.actions'> &
  PropsLocale<typeof NS> &
  InjectFace<OpenPathInjected>
/** File inputs shared by the document header and its unpreviewable state. */
type FileOpenTargetProps = Pick<
  OpenPathActionProps,
  | 'absolutePath'
  | 'useOpenInAppDesktop'
  | 'loadDesktop'
  | 'openPath'
  | 'applications'
  | 'report'
  | 't'
> & {
  empty?: boolean
}
/**
 * Resolve file associations and adapt operations without embedding platform behavior in the control.
 * @param props - verified file path, desktop query, native operations, and display variant.
 * @returns the shared opening control, or null without a desktop.
 */
export const FileOpenTarget = defineComponent(
  (props: FileOpenTargetProps) => {
    const desktop = props.useOpenInAppDesktop(value => value)
    const association = useFileApplications(
      () => props.absolutePath,
      () => props.applications,
      () => desktop.value === true,
    )
    watch(
      [desktop, () => props.loadDesktop],
      () => {
        if (desktop.value === null) void props.loadDesktop()
      },
      { immediate: true },
    )
    return () => {
      if (desktop.value !== true) return null
      const { apps } = association.value
      return h(
        OpenTargetButton,
        {
          key: props.absolutePath,
          kind: 'file',
          applications: apps,
          defaultId: apps.find(app => app.default)?.id,
          loading: association.value.loading,
          failed: association.value.failed,
          prominent: props.empty === true,
          t: props.t,
          refresh: association.value.refresh,
          report: props.report,
          execute: operation =>
            props.openPath(
              props.absolutePath,
              operation.kind === 'reveal' ? 'reveal' : 'open',
              operation.kind === 'application' ? operation.id : undefined,
            ),
        },
        undefined,
      )
    }
  },
  {
    name: 'FileOpenTarget',
    inheritAttrs: false,
    props: [
      'absolutePath',
      'useOpenInAppDesktop',
      'loadDesktop',
      'openPath',
      'applications',
      'report',
      't',
      'empty',
    ],
  },
)
/**
 * Render the file adapter in the document header.
 * @param props - document owner inputs and injected opening capabilities.
 * @returns the shared split button.
 */
export function OpenPathAction(props: OpenPathActionProps): VNodeChild {
  return h(FileOpenTarget, { ...props }, undefined)
}
