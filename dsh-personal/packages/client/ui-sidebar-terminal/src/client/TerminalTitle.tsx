import { h, Fragment, ref, shallowRef, defineComponent, watchEffect } from 'vue';
/** Live terminal names in docked and floating tab chrome. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { TerminalIcon } from './TerminalIcon.tsx';
import type { TerminalInjected } from './face.ts';
import css from './TerminalTitle.module.css';
/**
 * Render the terminal name, editable in place on double-click.
 * @param props - sidebar occurrence, terminal model and localized copy.
 * @returns the terminal icon and current name or its editor.
 */
export const TerminalTitle = defineComponent((props: Pick<PropsRuntime<'sidebar.right.pane.tab.title'>, 'useTabInfo'> & PropsLocale<'sidebarTerminal'> & InjectFace<TerminalInjected>) => {
    const info = props.useTabInfo();
    const key = info.value.tab.id;
    const titleRef = props.useTerminal(key, state => state?.info?.title ?? state?.title);
    const agent = props.useTerminal(key, state => state?.info?.origin === 'agent' && state.info.control === 'agent');
    const sandbox = props.useTerminal(key, state => state?.info?.origin === 'agent' ? state.info.sandboxMode : undefined);
    const editing = ref(false), input = shallowRef<HTMLInputElement | null>(null), label = shallowRef<HTMLSpanElement | null>(null);
    let cancelled = false;
    watchEffect(cleanup => {
        if (editing.value) {
            input.value?.focus();
            input.value?.select();
            return;
        }
        const chip = label.value?.closest('[data-dockkit-tab], [data-dockkit-float-grip]');
        const rename = (event: Event) => { event.stopPropagation(); cancelled = false; editing.value = true; };
        chip?.addEventListener('dblclick', rename);
        cleanup(() => chip?.removeEventListener('dblclick', rename));
    }, { flush: 'post' });
    return () => {
        const { t, view } = props, tab = info.value.tab;
        const title = titleRef.value ?? tab.title, agentControl = agent.value, sandboxMode = sandbox.value;
        const sandboxHint = sandboxMode === 'read-only' ? t('badge.readOnlyHint') : sandboxMode === 'workspace-write' ? t('badge.workspaceWriteHint') : undefined;
        return h(Fragment, null, [
            h(TerminalIcon, null),
            agentControl
                ? h("span", { "class": css.badge, "title": sandboxHint === undefined ? t('badge.agentHint') : `${t('badge.agentHint')} ${sandboxHint}` }, [
                    h(Tag, { "tone": "info" }, { default: () => [
                            t('badge.agent')
                        ] })
                ]) : sandboxHint !== undefined && h("span", { "class": css.badge, "title": sandboxHint }, [
                h(Tag, { "tone": "neutral" }, { default: () => [
                        t('badge.sandbox')
                    ] })
            ]),
            editing.value ? h("input", { "ref": input, "class": css.name, "defaultValue": title, "maxLength": 120, "aria-label": t('rename'), "onPointerdown": (event: KeyboardEvent) => { event.stopPropagation(); }, "onClick": (event: MouseEvent) => { event.stopPropagation(); }, "onDblclick": (event: KeyboardEvent) => { event.stopPropagation(); }, "onBlur": (event: FocusEvent) => {
                    editing.value = false;
                    const next = (event.currentTarget as HTMLInputElement).value.trim();
                    if (!cancelled && next !== '' && next !== title)
                        void view(tab.id).rename(next);
                }, "onKeydown": (event: KeyboardEvent) => {
                    event.stopPropagation();
                    // oxlint-disable-next-line typescript/no-deprecated -- Some IMEs report composition only through keyCode 229.
                    if (event.isComposing || event.keyCode === 229)
                        return;
                    if (event.key === 'Escape') {
                        cancelled = true;
                        (event.currentTarget as HTMLInputElement).blur();
                    }
                    else if (event.key === 'Enter')
                        (event.currentTarget as HTMLInputElement).blur();
                } }) : h("span", { "ref": label, "class": css.title }, [
                title
            ])
        ]);
    };
}, { props: ['useTabInfo', 'useTerminal', 'view', 't'], inheritAttrs: false });
