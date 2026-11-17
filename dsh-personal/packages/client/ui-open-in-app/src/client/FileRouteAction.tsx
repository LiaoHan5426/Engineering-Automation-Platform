import { h, defineComponent } from 'vue'
/** Adapt authorized delivery and changed-file routes to the shared opening control. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-deliverables/client'
import { parseNativeFileApplications } from '@deepseek-ai/dsh-native-command/types'
import type { SessionWorkspacePathApplication } from '@deepseek-ai/dsh-api-session-controller/types'
import { useFileApplications } from './file-applications.ts'
import { OpenTargetButton, type OpenTargetReporter } from './OpenTargetButton.tsx'
import type { NS } from './locales.ts'
async function queryRoute(
  url: string,
  signal: AbortSignal,
): Promise<readonly SessionWorkspacePathApplication[] | null> {
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return null
    return parseNativeFileApplications(await response.json())
  } catch (_error) {
    // Unavailable routes and malformed responses leave file reveal as the fallback.
    return null
  }
}
/**
 * Render file actions without bypassing the owning Session's authorization route.
 * @param props - authenticated route, desktop availability, the native gesture
 * callback, and the announcement seat its settled outcome is reported to.
 * @returns the shared compact control, or null without a desktop.
 */
export const FileRouteAction = defineComponent(
  (
    props: Pick<
      PropsRuntime<'deliverables.file.actions'>,
      'actionUrl' | 'available' | 'pending' | 'onAction'
    > &
      PropsLocale<typeof NS> &
      InjectFace<OpenTargetReporter>,
  ) => {
    const association = useFileApplications(
      () => props.actionUrl,
      () => queryRoute,
      () => props.available,
    )
    return () => {
      if (!props.available) return null
      return h(
        OpenTargetButton,
        {
          key: props.actionUrl,
          kind: 'file',
          applications: association.value.apps,
          defaultId: association.value.apps.find(app => app.default)?.id,
          failed: association.value.failed,
          loading: association.value.loading,
          busy: props.pending,
          refresh: association.value.refresh,
          t: props.t,
          report: props.report,
          execute: operation =>
            props.onAction(
              operation.kind === 'reveal' ? 'reveal' : 'open',
              operation.kind === 'application' ? operation.id : undefined,
            ),
        },
        undefined,
      )
    }
  },
  {
    name: 'FileRouteAction',
    inheritAttrs: false,
    props: ['actionUrl', 'available', 'pending', 'onAction', 't', 'report'],
  },
)
