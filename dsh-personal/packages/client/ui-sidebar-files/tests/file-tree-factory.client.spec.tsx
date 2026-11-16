// @vitest-environment jsdom
/** Real Factory composition, local Component identity, locale, and missing-definition fallback. */
import { h as vueH, Fragment, defineComponent, ref } from 'vue';
import { act } from '../../../test-support/client-runtime/src/vue-test.ts';
import { fireEvent } from '@testing-library/dom';
import { expect, it, onTestFinished, vi } from 'vitest';
import { makeTranslate, SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime';
import type { FactoryLocalComponentPropsOf, PropsRenderFactories, PropsRuntime, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import { FileTree } from '../src/client/FileTree.tsx';
import type { FileTreeInput } from '../src/client/FileTree.tsx';
import { en } from '../src/client/locales.ts';
const CounterAccessory = defineComponent((props: FactoryLocalComponentPropsOf<'sidebar.files.tree', 'accessory'>) => {
 const count = ref(0)
 return () => vueH('button', { onClick: () => { count.value++ } }, `${props.entry.path}: ${count.value}`)
}, { props: ['entry'], inheritAttrs: false })
function EmptyAccessory() { return null; }
it('composes independent local accessories and preserves their state across input updates', async () => {
    const runtime = await SlotTestRuntime.create();
    onTestFinished(() => runtime.dispose());
    const revision = { revision: 0 };
    runtime.slots.installLocale({
        getSnapshot: () => revision, subscribe: () => () => { }, bind: () => makeTranslate(en),
    });
    const unregister = runtime.slots.registerFactory({
        name: 'sidebar.files.tree', scope: 'root', locale: 'sidebarFiles', slots: { accessory: { scope: 'root' } },
    }, FileTree);
    const onOpen = vi.fn();
    let input: FileTreeInput = {
        root: 'pr', entries: [{ path: 'pr/a', name: 'a' }], expanded: [], onToggle: vi.fn(), onOpen,
    };
    let rerender = () => { };
    await runtime.root.declare({}, defineComponent((props: PropsRenderFactories & PropsRuntime<'root'> & PropsRenderSlots<never>) => {
        const revision = ref(0);
        rerender = () => { revision.value++ };
        return () => { revision.value; const { renderFactorySlot } = props; return vueH(Fragment, null, [
            vueH("section", {
                "data-case": "custom"
            }, [
                renderFactorySlot('sidebar.files.tree', input, { slots: { accessory: CounterAccessory }, fallback: vueH("p", {}, [
                        "Unavailable"
                    ]) })
            ]),
            vueH("section", {
                "data-case": "default"
            }, [
                renderFactorySlot('sidebar.files.tree', input)
            ]),
            vueH("section", {
                "data-case": "empty"
            }, [
                renderFactorySlot('sidebar.files.tree', input, { slots: { accessory: EmptyAccessory } })
            ])
        ]); };
    }, { props: ['renderFactorySlot'], inheritAttrs: false }));
    const view = runtime.renderRoot();
    await fireEvent.click(view.getByRole('button', { name: 'pr/a: 0' }));
    expect(view.getByRole('button', { name: 'pr/a: 1' })).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();
    for (const variant of ['default', 'empty']) {
        expect(view.container.querySelector(`[data-case="${variant}"] [data-files-path] button`)?.nextElementSibling?.matches(':empty')).toBe(true);
    }
    input = { ...input, entries: [{ path: 'pr/a', name: 'renamed' }] };
    await act(async () => { await rerender(); });
    expect(view.getByRole('button', { name: 'pr/a: 1' })).toBeTruthy();
    input = { ...input, entries: [] };
    await act(async () => { await rerender(); });
    expect(view.getAllByText(en.empty)).toHaveLength(3);
    await act(async () => { unregister(); });
    expect(view.getByText('Unavailable')).toBeTruthy();
    expect(view.container.querySelector('[data-case="default"]')?.textContent).toBe('');
});
