/** Office presents retained conversion results and font notices around the shared PDF view. */
import { computed, defineComponent, h, watch } from 'vue';
import type { PropsLocale, PropsRenderSlots, PropsStore, SlotHookFactory } from '@deepseek-ai/dsh-client-ui-slots';
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
import { Button, FileTypeIcon, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { DocumentBodyOwner, DocumentPreviewProps } from '../document/contract.ts';
import { hostFileOf } from '../rpc.ts';
import { LoadingIndicator } from '../LoadingIndicator.tsx';
import type { OfficeLoadInjected } from './face.ts';
import type { OfficeStore } from './store.ts';
import common from '../TextPreview.module.css';
import css from './OfficeBody.module.css';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** PDF presentation supplied with Office-owned converted bytes. */
        'sidebar.right.tab.document.office.pdf': {
            kind: 'keyed';
            scope: 'session';
            owner: DocumentBodyOwner;
            hookContext: UseSidebarRightTabInfo;
            inject: {
                hooks: {
                    tabInfo: SlotHookFactory<'sidebar.right.tab.document', UseSidebarRightTabInfo>;
                };
            };
        };
    }
}
/** Office loading callbacks supplied by the registration's services. */
export interface OfficeBodyInjected extends OfficeLoadInjected {
    /** @param tab - owning tab. @param signal - tab lifetime, including hidden bodies. */
    readonly retainTab: (tab: TabId, signal: AbortSignal) => void;
}
/** Office body inputs and its private PDF child. */
export type OfficeBodyProps = DocumentPreviewProps & PropsStore<OfficeStore> & OfficeBodyInjected & PropsLocale<'sidebarOffice'> & PropsRenderSlots<'sidebar.right.tab.document.office.pdf'>;
/**
 * Load one Office revision and preserve its result while its tab remains open.
 * @param props - renderer loading request, tab state, conversion callbacks, and PDF slot.
 * @returns conversion status or the PDF scrollport.
 */
export const OfficeBody = defineComponent((props: OfficeBodyProps) => {
    const info = props.useTabInfo()
    const request = computed(() => props.content.kind === 'renderer' ? props.content : undefined)
    const revision = computed(() => request.value?.revision)
    const tabId = info.value.tab.id
    const held = props.useStore(state => state.byTab[tabId])
    const view = computed(() => held.value?.revision === revision.value ? held.value : undefined)
    const settled = computed(() => view.value?.file !== undefined || view.value?.failure !== undefined)
    watch(() => [props.retainTab, info.value.tab.id, info.value.tab.signal] as const, () => {
      props.retainTab(info.value.tab.id, info.value.tab.signal)
    }, { immediate: true })
    watch(() => [revision.value, props.resourceAddress, info.value.tab.id, info.value.tab.signal, props.load, settled.value] as const,
      (_, _previous, onCleanup) => {
        const { tab } = info.value
        const current = request.value
        if (current === undefined || settled.value || tab.signal.aborted) return
        const controller = new AbortController()
        const signal = AbortSignal.any([controller.signal, tab.signal])
        props.load(tab.id, current.revision, hostFileOf(props.resourceAddress), signal, current.loaded, current.failed)
        onCleanup(() => { controller.abort() })
      }, { immediate: true })
    return () => {
    const { resourceAddress, t } = props
    const currentRequest = request.value
    const currentView = view.value
    const file = currentView?.file;
    if (currentRequest === undefined)
        return null;
    if (currentView?.failure !== undefined) {
        const { name } = pathPartsOf(resourceAddress);
        return h("div", {
            "class": common.empty,
            "data-textpreview-failed": currentView.failure.code
        }, [
            h(FileTypeIcon, {
                "kind": classifyFileType(name),
                "size": 36
            }),
            h("p", {
                "class": common.emptyLine
            }, [
                currentView.failure.message
            ]),
            h(Button, {
                "size": "sm",
                "onClick": currentRequest.reload
            }, {
                default: () => [
                    t('retry')
                ]
            })
        ]);
    }
    if (file === undefined)
        return h(LoadingIndicator, {
            "label": t('loading')
        });
    return h("div", {
        "class": css.body
    }, [
        props.renderSlot('sidebar.right.tab.document.office.pdf', {
            resourceAddress, content: { kind: 'bytes', data: file.data }, wrap: props.wrap, scrollportRef: props.scrollportRef,
            addResource: props.addResource, setResources: props.setResources,
        }, { entryKey: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/office', hookContext: props.useTabInfo })
    ]);
 }
}, { name: 'OfficeBody', inheritAttrs: false, props: ["addResource","setResources","resourceAddress","content","wrap","scrollportRef","useTabInfo","useSession","sessionId","useProjection","useAccess","useConversation","useInput","inputActions","useRemoteAccess","useSessions","useSessionRetainInfo","useSessionAccess","usePanelInfo","useContextMenu","useResource","useWorkspaces","useStore","actions","retainTab","load","t","renderSlot","__renders","SessionProvider"] })
