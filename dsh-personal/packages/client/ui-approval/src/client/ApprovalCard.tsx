/** Shared approval presentation; each caller retains its decision policy and answer channel. */
import { defineComponent, h, onBeforeUnmount, shallowRef } from 'vue';
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from './contract/slots.ts';
import css from './ApprovalPanel.module.css';
import { ApprovalWarning } from './ApprovalWarning.tsx';
/**
 * Render one decision with caller-owned actions and an optional persistent choice.
 * @param props Request identity, copy, actions and correlated detail.
 * @returns The shared approval card, reset for each request.
 */
export function ApprovalCard(props: FactoryComponentPropsOf<'conversation.approval.card'>) {
    return h(ApprovalFlow, { ...props, key: props.requestKey });
}
const ApprovalFlow = defineComponent((props: FactoryComponentPropsOf<'conversation.approval.card'>) => {
    const answered = shallowRef(false);
    let waiting = false;
    let active = true;
    let composing = false;
    let compositionEnded = false;
    onBeforeUnmount(() => { active = false; });
    const answer = (send: () => Promise<void>): void => {
        if (waiting || !props.canAnswer())
            return;
        waiting = true;
        answered.value = true;
        void send().catch(() => {
            if (!active || !props.canAnswer())
                return;
            waiting = false;
            answered.value = false;
        });
    };
    const keydown = (event: KeyboardEvent): void => {
        const element = event.target as Element;
        if (!(event.currentTarget instanceof HTMLDivElement) || event.defaultPrevented || !event.currentTarget.contains(document.activeElement)
            || element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null)
            return;
        if (event.key !== 'Enter' && event.key !== 'Escape')
            return;
        if (event.key === 'Enter' && element.closest('button, a[href], [role="button"]') !== null)
            return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return;
        event.preventDefault();
        event.stopPropagation();
        // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
        if (event.repeat || composing || compositionEnded || event.isComposing || event.keyCode === 229)
            return;
        answer(event.key === 'Enter' ? props.onAllow : props.onReject);
    };
    return () => {
        const { requestKey, title, description, subject, warning, allowLabel, onAllow, onReject, onAlways, t } = props;
        const detail = props.callId === undefined ? null : props.renderSlot('conversation.approval.detail', { callId: props.callId });
        return (h("div", { "class": css.root, "data-approval-key": requestKey, "aria-busy": answered.value, "onKeydown": keydown, "onKeyupCapture": () => { compositionEnded = false; }, "onCompositionstartCapture": () => { composing = true; }, "onCompositionendCapture": () => { composing = false; compositionEnded = true; } }, [h("div", { "class": subject === undefined ? css.card : `${css.card} ${css.withSubject}` }, [h("div", { "class": css.strip }, [h(StateDot, { "state": answered.value ? 'ongoing' : 'warning' }, undefined), t('waiting')]), h("div", { "class": css.body, "data-approval-scroll": "", "tabIndex": 0, "role": "group", "aria-label": t('detail.aria') }, [subject !== undefined && h("div", { "class": css.subject }, [subject.icon !== undefined && h("img", { "src": subject.icon, "alt": "", "width": 40, "height": 40, "draggable": false }, undefined), h("strong", null, [subject.name])]), h("div", { "class": css.heading }, [h("div", { "class": css.headline }, [title]), warning !== undefined && h(ApprovalWarning, { "warning": warning }, undefined)]), description !== undefined && h("p", { "class": css.description }, [description]), detail !== null && h("div", { "class": css.command }, [detail])]), h("div", { "class": css.actionRow }, [h(Button, { "variant": "outline", "className": css.reject ?? "", "disabled": answered.value, "onClick": () => { answer(onReject); } }, { default: () => [t('reject')] }), h(Button, { "variant": onAlways === undefined ? 'primary' : 'outline', "disabled": answered.value, "onClick": () => { answer(onAllow); } }, { default: () => [allowLabel ?? t('allowOnce')] }), onAlways !== undefined && h(Button, { "variant": "primary", "disabled": answered.value, "onClick": () => { answer(onAlways); } }, { default: () => [t('allowAlways')] })])])]));
    };
}, { name: 'ApprovalFlow', inheritAttrs: false, props: ['requestKey', 'title', 'description', 'subject', 'warning', 'allowLabel', 'canAnswer', 'onAllow', 'onReject', 'onAlways', 't', 'callId', 'renderSlot'] });
