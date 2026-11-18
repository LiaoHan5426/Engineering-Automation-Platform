/** Dialog that names the new branch of a requested worktree, from the New Session option or after a failed attempt. */
import { defineComponent, h, Fragment, shallowRef, useId, } from 'vue';
import clsx from 'clsx';
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { branchLabel, branchNameProblem } from '../branch-name.ts';
import type { NS } from './locales.ts';
import css from './WorktreeNameDialog.module.css';
/**
 * Outcome of a worktree request: accepted; refused for its branch name, which the dialog shows; or failed otherwise,
 * which the request reports itself.
 */
export type WorktreeRequestResult = 'accepted' | 'invalid-name' | 'branch-exists' | 'failed';
/** Props of the naming dialog. */
export interface WorktreeNameDialogProps extends PropsLocale<typeof NS> {
    /** `name` names the branch of the open request; `retry` renames it after a failed attempt, then tries again. */
    readonly mode: 'name' | 'retry';
    /** Text the field starts with: the chosen name, or the prefix of generated names. */
    readonly initial: string;
    /** Prefix of generated names; a field that holds only the prefix names no branch yet. */
    readonly prefix: string;
    /** Base of the request, or null for HEAD. */
    readonly from: string | null;
    /** Whether the request already names its branch, which offers a return to generated names. */
    readonly named: boolean;
    /**
     * Request the worktree on `name`, or on generated names for null; in `retry` mode the caller also tries again
     * once the request is accepted.
     */
    readonly submit: (name: string | null) => Promise<WorktreeRequestResult>;
    /** Close the dialog without a request. */
    readonly close: () => void;
}
/**
 * Render the dialog: one branch name field checked against Git's branch-name rules while it is typed, and checked by
 * the Host when it is confirmed. A refused name keeps the dialog open with the reason under the field; an accepted
 * request closes it.
 * @param props - mode, starting text, prefix, base, the request, and copy.
 * @returns the dialog.
 */
export const WorktreeNameDialog = defineComponent((props: WorktreeNameDialogProps) => {
    const { initial } = props;
    const value = shallowRef(initial);
    const setValue = (nextValue: string): void => { value.value = nextValue; };
    const refusal = shallowRef<{
        readonly name: string;
        readonly text: string;
    } | null>(null);
    const setRefusal = (value: typeof refusal.value): void => { refusal.value = value; };
    const busy = shallowRef(false);
    const setBusy = (value: typeof busy.value): void => { busy.value = value; };
    const fieldId = useId();
    const messageId = useId();
    return () => {
        const { mode, prefix, from, named, submit, close, t } = props;
        const blank = value.value === prefix;
        const problem = blank ? null : branchNameProblem(value.value);
        const error = problem !== null ? t(`branchName.${problem}`) : refusal.value?.name === value.value ? refusal.value.text : null;
        const retry = mode === 'retry';
        const send = (name: string | null): void => {
            setBusy(true);
            void submit(name).then((result) => {
                setBusy(false);
                if (result === 'accepted')
                    close();
                else if (name !== null && result === 'branch-exists')
                    setRefusal({ name, text: t('branchName.exists', { name }) });
                else if (name !== null && result === 'invalid-name')
                    setRefusal({ name, text: t('branchName.invalid') });
            });
        };
        const confirmable = !busy.value && error === null && !blank;
        const base = from === null ? null : branchLabel(from);
        const hint = blank && prefix !== '' ? t('nameDialog.prefixOnly') : base === null ? t('nameDialog.hintHead') : t('nameDialog.hint', { branch: base });
        return (h(Modal, { "open": true, "onClose": close, "title": t(retry ? 'nameDialog.retryTitle' : 'nameDialog.title'), "closeLabel": t('nameDialog.close') }, { footer: () => h(Fragment, {}, [named && !retry && (h(Button, { "variant": "outline", "className": css.auto ?? '', "disabled": busy.value, "onClick": () => { send(null); } }, { default: () => [t('nameDialog.auto')] })), h(Button, { "variant": "outline", "onClick": close }, { default: () => [t('nameDialog.cancel')] }), h(Button, { "variant": "primary", "disabled": !confirmable, "onClick": () => { send(value.value); } }, { default: () => [t(retry ? 'nameDialog.retry' : 'nameDialog.confirm')] })]), default: () => [h("div", { "class": css.form, "data-forge-worktree-name": "" }, [h("label", { "class": css.label, "for": fieldId }, [t('nameDialog.field')]), h(Input, { "id": fieldId, "data-modal-autofocus": true, "className": clsx(css.field, error !== null && css.invalid), "value": value.value, "spellCheck": false, "autoCapitalize": "off", "autoComplete": "off", "aria-invalid": error !== null, "aria-describedby": messageId, "onChange": (event: Event) => { setValue((event.target as HTMLInputElement).value); }, "onInput": (event: Event) => { setValue((event.target as HTMLInputElement).value); }, "onKeydown": (event: KeyboardEvent) => {
                            if (event.key !== 'Enter' || event.isComposing)
                                return;
                            event.preventDefault();
                            if (confirmable)
                                send(value.value);
                        } }, {}), h("p", { "id": messageId, "class": clsx(css.message, error !== null && css.error), "role": error === null ? undefined : 'alert' }, [error ?? hint])])] }));
    };
}, { props: ["mode", "initial", "prefix", "from", "named", "submit", "close", "t"], inheritAttrs: false });
