/** Cancellable branch search shared by the branch menus. */
import { h, shallowRef, watch, type ShallowRef, type VNodeChild } from 'vue';
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { NS } from './locales.ts';
const SEARCH_DELAY_MS = 150;
/** Reactive query, listing and input element of a branch menu. */
export interface BranchSearch<T> {
    readonly query: ShallowRef<string>;
    readonly setQuery: (query: string) => void;
    readonly listing: ShallowRef<RemoteResult<T> | null>;
    readonly retry: () => void;
    readonly reset: () => void;
    readonly field: ShallowRef<HTMLInputElement | null>;
}
/** Read on opening or retry; debounce typing and cancel obsolete reads.
 * @param shown - reactive menu visibility.
 * @param list - cancellable branch listing.
 * @returns reactive search state, actions and focus element.
 */
export function useBranchSearch<T>(shown: () => boolean, list: (query: string, signal: AbortSignal) => Promise<RemoteResult<T>>): BranchSearch<T> {
    const query = shallowRef('');
    const attempt = shallowRef(0);
    const listing = shallowRef<RemoteResult<T> | null>(null);
    const field = shallowRef<HTMLInputElement | null>(null);
    watch([shown, query, attempt], ([open, text], _previous, onCleanup) => {
        if (!open)
            return;
        const controller = new AbortController();
        const timer = setTimeout(() => { void list(text, controller.signal).then(result => { if (!controller.signal.aborted)
            listing.value = result; }); }, text === '' ? 0 : SEARCH_DELAY_MS);
        onCleanup(() => { clearTimeout(timer); controller.abort(); });
    }, { immediate: true });
    watch(shown, (open, _previous, onCleanup) => {
        if (!open || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches))
            return;
        const frame = requestAnimationFrame(() => { field.value?.focus(); });
        onCleanup(() => { cancelAnimationFrame(frame); });
    }, { immediate: true, flush: 'post' });
    return { query, listing, field, setQuery: value => { query.value = value; }, retry: () => { attempt.value++; }, reset: () => { query.value = ''; } };
}
/** Render loading, retry, or empty feedback for a branch menu.
 * @param props - listing state, retry action, class and localized copy.
 * @returns status row, or null when rows are available.
 */
export function branchSearchStatus({ listing, empty, retry, className, t }: {
    readonly listing: RemoteResult<unknown> | null;
    readonly empty: boolean;
    readonly retry: () => void;
    readonly className: string | undefined;
} & PropsLocale<typeof NS>): VNodeChild {
    if (listing === null)
        return h('div', { class: className, role: 'status' }, [h(StateDot, { state: 'ongoing' }), t('diff.base.loading')]);
    if (!listing.ok)
        return h('div', { class: className, role: 'status' }, [h('span', t('toast.branchesFailed')), h(Button, { size: 'sm', variant: 'outline', onClick: retry }, { default: () => t('retry') })]);
    return empty ? h('div', { class: className }, t('diff.base.empty')) : null;
}
