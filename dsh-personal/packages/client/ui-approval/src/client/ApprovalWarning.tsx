/** Formatted hover notice that keeps the pending approval unanswered. */
import { defineComponent, Fragment, h, shallowRef, Teleport, useId, watch } from 'vue';
import { Button, IconWarningOutlineRegular, MenuSurface, Tag, isBehindModal, observeComposition, useDismissOnOutsidePointer, usePointerGrace, } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ApprovalCardInput } from './contract/slots.ts';
import css from './ApprovalPanel.module.css';
/**
 * Present caller-owned risks on hover, keyboard focus, or touch activation.
 * @param props Localized warning content.
 * @returns The warning tag and its readable, nonmodal hover card.
 */
export const ApprovalWarning = defineComponent((props: {
    warning: NonNullable<ApprovalCardInput['warning']>;
}) => {
    const open = shallowRef(false);
    const setOpen = (next: boolean) => { open.value = next; };
    const anchor = shallowRef<HTMLButtonElement | null>(null);
    const panel = shallowRef<HTMLDivElement | null>(null);
    const id = useId();
    const titleId = useId();
    const anchorName = `--dsh-approval-warning-${id.replaceAll(':', '')}`;
    useDismissOnOutsidePointer(anchor, () => open.value, setOpen, panel);
    const { arm: armClose, cancel: cancelClose } = usePointerGrace(() => {
        if (anchor.value?.matches(':focus-visible')
            || (panel.value?.contains(document.activeElement) && document.activeElement?.matches(':focus-visible')))
            return;
        setOpen(false);
    });
    const show = () => {
        if (isBehindModal(anchor.value))
            return;
        cancelClose();
        setOpen(true);
    };
    const enter = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || !window.matchMedia('(any-hover: hover)').matches)
            return;
        show();
    };
    const leave = (event: PointerEvent) => {
        if (event.pointerType !== 'touch')
            armClose();
    };
    const blur = (event: FocusEvent) => {
        const next = event.relatedTarget;
        if (next instanceof Node && (anchor.value?.contains(next) || panel.value?.contains(next)))
            return;
        cancelClose();
        setOpen(false);
    };
    watch(open, (visible, _previous, onCleanup) => {
        if (!visible)
            return;
        const composition = observeComposition(document);
        const close = () => { cancelClose(); setOpen(false); };
        const focusOutside = (event: Event) => {
            if (event.target instanceof Node && !anchor.value?.contains(event.target) && !panel.value?.contains(event.target))
                close();
        };
        const visibilityChanged = () => { if (document.visibilityState === 'hidden')
            close(); };
        const dismiss = (event: KeyboardEvent) => {
            if (composition.guards(event) || isBehindModal(anchor.value) || event.defaultPrevented
                || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.key !== 'Escape')
                return;
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat)
                return;
            cancelClose();
            if (panel.value?.contains(document.activeElement))
                anchor.value?.focus();
            setOpen(false);
        };
        document.addEventListener('keydown', dismiss, true);
        document.addEventListener('focusin', focusOutside);
        document.addEventListener('visibilitychange', visibilityChanged);
        window.addEventListener('blur', close);
        onCleanup(() => {
            document.removeEventListener('keydown', dismiss, true);
            document.removeEventListener('focusin', focusOutside);
            document.removeEventListener('visibilitychange', visibilityChanged);
            window.removeEventListener('blur', close);
            composition.dispose();
        });
    }, { flush: 'post' });
    return () => {
        const { warning } = props;
        return h(Fragment, null, [h(Button, { "elementRef": element => { anchor.value = element; }, "size": "sm", "className": css.warningTrigger ?? "", "style": { anchorName }, "aria-haspopup": "dialog", "aria-expanded": open.value, "aria-controls": open.value ? id : undefined, "onClick": show, "onPointerenter": enter, "onPointerleave": leave, "onFocus": (event: FocusEvent) => { if (event.currentTarget instanceof HTMLElement && event.currentTarget.matches(':focus-visible'))
                    show(); }, "onBlur": blur }, { default: () => [h(Tag, { "tone": "warning", "className": css.warningTag ?? "" }, { default: () => [h(IconWarningOutlineRegular, { "size": 12 }, undefined), warning.label] })] }), open.value && h(Teleport, { to: document.body }, [
                h(MenuSurface, { "elementRef": element => { panel.value = element; }, "id": id, "role": "dialog", "aria-labelledby": titleId, "tabIndex": -1, "className": css.warningPopover ?? "", "style": { positionAnchor: anchorName }, "onPointerenter": enter, "onPointerleave": leave, "onFocus": cancelClose, "onBlur": blur }, { default: () => [h("h3", { "id": titleId, "class": css.warningTitle }, [warning.title]), warning.detail.split('\n\n').map(paragraph => h("p", { "key": paragraph }, [paragraph]))] }),
            ])]);
    };
}, { name: 'ApprovalWarning', inheritAttrs: false, props: ['warning'] });
