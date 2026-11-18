/** Settings navigation into the Plugins page. */
import { defineComponent, onMounted } from 'vue'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
/** Navigation provided by the manager. */
export interface PluginsSettingsLinkInjected { readonly openPlugins: () => void }
/** Props derived from the settings entry. */
export type PluginsSettingsLinkProps = PropsRuntime<'settings.section'> & InjectFace<PluginsSettingsLinkInjected>
/** Selecting this entry leaves Settings and opens Plugins. */
export const PluginsSettingsLink = defineComponent((props: PluginsSettingsLinkProps) => {
  onMounted(() => { props.close(); props.openPlugins() })
  return () => null
}, { props: ['close', 'openPlugins'] })
