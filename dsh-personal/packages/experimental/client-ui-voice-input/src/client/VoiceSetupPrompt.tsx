/** Activation guidance after the Host inspects local recognition resources. */
import { defineComponent, h, computed, watchEffect } from 'vue'
import { VoiceSetupDialog } from './VoiceSetupDialog.tsx'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { VoiceInputInjected } from './VoiceInput.tsx'
import type { NS } from './locales.ts'
/** Registration shares for the bundle's activation guidance. */
export type VoiceSetupPromptProps = PropsRuntime<'plugins.bundle.activation'> &
  PropsLocale<typeof NS> &
  Pick<InjectFace<VoiceInputInjected>, 'useSpeechReadiness'>
/**
 * Offer navigation to installation without starting a download.
 * @param props - activation navigation and the shared Host readiness observer.
 * @returns the shared modal only when the selected local provider needs preparation.
 */
export const VoiceSetupPrompt = defineComponent(
  (props: VoiceSetupPromptProps) => {
    const readiness = props.useSpeechReadiness(value => value)
    const provider = computed(() =>
      readiness.value.catalog?.providers.find(
        item => item.id === readiness.value.catalog?.selection.providerId,
      ),
    )
    const phase = computed(() =>
      readiness.value.connected ? provider.value?.preparation.phase : undefined,
    )
    const needsSetup = computed(
      () => phase.value === 'unprepared' && provider.value?.location === 'host-local',
    )
    watchEffect(() => {
      if (phase.value !== undefined && phase.value !== 'checking' && !needsSetup.value)
        props.onDismiss()
    })
    return () =>
      h(
        VoiceSetupDialog,
        {
          open: needsSetup.value,
          needsInstallation: true,
          onDismiss: props.onDismiss,
          onOpenDetails: props.onOpenDetails,
          t: props.t,
        },
        undefined,
      )
  },
  {
    props: ['useSpeechReadiness', 'onDismiss', 'onOpenDetails', 't', 'packageName'],
    inheritAttrs: false,
  },
)
