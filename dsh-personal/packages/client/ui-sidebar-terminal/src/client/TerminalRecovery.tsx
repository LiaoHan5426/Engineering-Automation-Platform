import { h, ref, defineComponent, watch } from 'vue';
/** A Session header lifetime restores retained Host terminals without saving sidebar layout. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** The plugin coordinates once-per-page recovery; the component only owns an error notice. */
export interface TerminalRecoveryInjected {
    /** @returns after retained terminals have been opened as sidebar tabs. */
    readonly restore: () => Promise<void>;
}
/**
 * Restore terminals when a Session is displayed, with a retry action on lookup failure.
 * @param props - Session header lifetime, restoration callback and localized copy.
 * @returns nothing on success, or an unobtrusive retry control.
 */
export const TerminalRecovery = defineComponent((props: PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'sidebarTerminal'> & TerminalRecoveryInjected) => {
    const error = ref<string>(), attempt = ref(0);
    watch([() => props.restore, attempt], (_value, _old, cleanup) => {
        let active = true;
        cleanup(() => { active = false; });
        void props.restore().then(() => {
            if (active)
                error.value = undefined;
        }, (reason: unknown) => {
            if (active)
                error.value = reason instanceof Error ? reason.message : String(reason);
        });
    }, { immediate: true });
    return () => error.value === undefined ? null : h('button', { type: 'button', title: props.t('recoveryFailed', { message: error.value }), onClick: () => { error.value = undefined; attempt.value++; } }, props.t('retryRecovery'));
}, { props: ['restore', 't'], inheritAttrs: false });
