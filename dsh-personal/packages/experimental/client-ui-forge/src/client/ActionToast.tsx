/** App-wide notice for forge panel actions, rendered outside the panel so it outlives it. */
import { defineComponent, h } from 'vue';
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales.ts';
import type { NoticeSource } from './source.ts';
/** Full-opacity hold of a notice that offers to undo its action, long enough to reach the action. */
const UNDO_HOLD_MS = 6000;
/** Full props of the `shell.overlay` entry. */
export type ActionToastProps = PropsLocale<typeof NS> & InjectFace<Omit<NoticeSource, 'report'>>;
/**
 * Render the current notice: a success notice with its undo action, or a failure warning.
 * @param props - notice hook, dismissal, and copy.
 * @returns the toast, or nothing while no notice shows.
 */
export const ActionToast = defineComponent((props: ActionToastProps) => {
    const notice = props.useNotice(current => current);
    return () => {
        if (notice.value === null)
            return null;
        const { undo } = notice.value;
        return (h(Toast, {
            "key": `forge-panel-${String(notice.value.seq)}`,
            "text": props.t(notice.value.key, notice.value.params),
            ...notice.value.tone === 'success' ? { tone: 'success' as const } : { icon: h(IconWarningOutlineRegular, {}) },
            ...undo === undefined
                ? {}
                : {
                    holdMs: UNDO_HOLD_MS,
                    actions: [{ label: props.t('toast.undo'), onClick: () => { props.dismiss(); undo(); } }],
                },
            "onDone": props.dismiss
        }));
    };
}, { name: 'ActionToast', inheritAttrs: false, props: ["useNotice", "dismiss", "t"] });
