/** Account notices above the account launcher. */
import { defineComponent, h } from 'vue'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'
import type {} from './account-ui.ts'
import css from './AccountNotices.module.css'
/** Props derived from the notice registration. */
export type AccountNoticesProps = PropsRuntime<'settings.notice'> & PropsRenderSlots<'settings.launcher.notifications'> & InjectFace<AccountSectionInjected>
/** Show notices only for a signed-in account outside onboarding. */
export const AccountNotices = defineComponent((props: AccountNoticesProps) => {
  const selectedAccount = props.useAccount(state => state)
  return () => {
    const account = selectedAccount.value
    const active = account.view?.status === 'credential-stored' && !account.desktopOnboardingVisible && !account.onboarding
    return h('div', { class: css.root }, [props.renderSlot('settings.launcher.notifications', { active, openAccount: () => props.openSettings('account') })])
  }
}, { props: ['openSettings', 'useAccount', 'renderSlot'] })
