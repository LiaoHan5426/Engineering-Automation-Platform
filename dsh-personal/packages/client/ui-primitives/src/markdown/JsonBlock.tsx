import { h, defineComponent, shallowRef } from 'vue';
// JsonBlock: collapsible JSON block (conversation side; independent from the RPC panel's PayloadJson to avoid cross-panel coupling).
import css from './JsonBlock.module.css';
const MAX_CHARS = 20000;
export const JsonBlock = defineComponent((props: {
    label: string;
    payload: unknown;
    defaultOpen?: boolean;
    /** Footer appended when the body exceeds the char cap, given the full length (this package is cordis-free, so copy arrives via props). */
    truncatedLabel: (total: number) => string;
}) => {
    const open = shallowRef(props.defaultOpen ?? false);
    return () => {
        const { label, payload, truncatedLabel } = props;
        const body = (() => {
            if (!open.value)
                return '';
            let s: string;
            try {
                // lib typing hides stringify's undefined arm (undefined/function/symbol payloads).
                // oxlint-disable-next-line typescript/no-unnecessary-condition
                s = JSON.stringify(payload, null, 2) ?? String(payload);
            }
            catch {
                s = String(payload);
            }
            return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n${truncatedLabel(s.length)}` : s;
        })();
        return (h("div", { "class": css.root }, [h("button", { "type": "button", "class": css.toggle, "onClick": () => { open.value = (v => !v)(open.value); } }, [open.value ? '▾' : '▸', label]), open.value && h("pre", { "class": css.body }, [body])]));
    };
}, { "name": "JsonBlock", "props": ["label", "payload", "defaultOpen", "truncatedLabel"] });
