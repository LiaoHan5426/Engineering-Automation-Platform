/** PDF page presentation; binary content and tab information come from the document owner. */
import { computed, defineComponent, h, onScopeDispose, ref, shallowRef, watch, type Component, type CSSProperties, type VNodeChild } from 'vue';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { DocumentPreviewProps } from '../document/contract.ts';
import type { PdfStore, PdfView } from './store.ts';
import { renderPdfPage, type PdfDocument } from './document.ts';
import { openPdf } from './runtime.ts';
import { PdfWorkerFailure } from './errors.ts';
import { pdfTextRenderer } from './text.ts';
import type { ZoomViewportProps } from '../zoom/ZoomViewport.tsx';
import type { ZoomLabels, ZoomPreference } from '../zoom/types.ts';
import type {} from './locales.ts';
import css from './PdfBody.module.css';
/** A record's viewing preferences survive body unmounts and leave with the tab. */
export interface PdfBodyInjected {
    /**
     * Retain viewing preferences until the tab record ends.
     * @param tabId - owning tab.
     * @param signal - tab-record lifetime, not body visibility.
     */
    readonly retainTab: (tabId: TabId, signal: AbortSignal) => void;
    /** Main-bundle viewport reused by the lazy PDF body. */
    readonly ZoomViewport: Component<ZoomViewportProps>;
    /** Main-bundle class implementing fit-width and fixed-size surfaces. */
    readonly zoomSurfaceClass: string;
}
/** Standard document props plus the PDF entry's locale, viewing store, and lifetime callback. */
export type PdfBodyProps = DocumentPreviewProps & PropsLocale<'sidebarPdf'> & PropsStore<PdfStore> & PdfBodyInjected;
type LoadState = {
    readonly kind: 'loaded';
    readonly data: Uint8Array<ArrayBuffer>;
    readonly document: PdfDocument;
} | {
    readonly kind: 'failed';
    readonly data: Uint8Array<ArrayBuffer>;
    readonly error: unknown;
};
const DEFAULT_PDF_VIEW: PdfView = { page: 1 };
const FIT_WIDTH: ZoomPreference = { kind: 'fit-width' };
/**
 * Present a PDF with tab-local viewing preferences and component-owned rendering resources.
 * @param props - complete bytes, framework-owned tab/store/locale seats, and main-bundle loading content.
 * @returns the PDF reader.
 */
export const PdfBody = defineComponent((props: PdfBodyProps & {
    readonly loading: VNodeChild;
}) => {
    const info = props.useTabInfo()
    const tabId = info.value.tab.id
    const view = props.useStore(state => state.byTab[tabId] ?? DEFAULT_PDF_VIEW)
    const data = computed(() => props.content.kind === 'bytes' ? props.content.data : undefined)
    const load = shallowRef<LoadState>()
    const attempt = ref(0)
    const pageWidth = ref<number>()
    const renderZoom = ref(1)
    const setPageWidth = (width: number): void => { pageWidth.value = width }
    const setRenderZoom = (zoom: number): void => { renderZoom.value = zoom }
    const pageVisible = (page: number): void => { props.actions.page(info.value.tab.id, page) }
    const setPreference = (value: ZoomPreference): void => { props.actions.zoom(info.value.tab.id, value) }
    watch(() => [props.retainTab, info.value.tab.id, info.value.tab.signal] as const, () => {
      props.retainTab(info.value.tab.id, info.value.tab.signal)
    }, { immediate: true })
    watch([data, () => info.value.tab.signal, attempt], ([data, tabSignal], _previous, onCleanup) => {
      if (data === undefined || tabSignal.aborted) return
      const lifetime = new AbortController()
      const signal = AbortSignal.any([lifetime.signal, tabSignal])
      load.value = undefined
      const session = openPdf(data, signal, error => { if (!signal.aborted) load.value = { kind: 'failed', data, error } })
      void session.document.then(
        document => { if (!signal.aborted) load.value = { kind: 'loaded', data, document } },
        (error: unknown) => { if (!signal.aborted) load.value = { kind: 'failed', data, error } },
      )
      onCleanup(() => { lifetime.abort(); void session.dispose() })
    }, { immediate: true })
    return () => {
    const { tab } = info.value
    const { t, ZoomViewport, zoomSurfaceClass } = props
    const currentData = data.value
    const currentLoad = load.value
    const currentView = view.value
    const preference = currentView.zoom ?? FIT_WIDTH
    const labels: ZoomLabels = {
      controls: t('zoomControls'), menu: t('zoomMenu'), out: t('zoomOut'), into: t('zoomIn'),
      fitWidth: t('zoomFitWidth'), value: percent => t('zoomValue', { percent }),
    }
    if (currentData === undefined)
        return h("p", {
            "class": css.status,
            "role": "alert"
        }, [
            t('unsupported')
        ]);
    if (currentLoad?.data !== currentData)
        return props.loading;
    if (currentLoad.kind === 'failed') {
        return h("div", {
            "class": css.status,
            "role": "alert"
        }, [
            h("span", {}, [
                failureText(currentLoad.error, t)
            ]),
            h(Button, {
                "size": "sm",
                "onClick": () => { attempt.value++; }
            }, {
                default: () => [
                    t('retry')
                ]
            })
        ]);
    }
    const pages = h("section", {
        "class": css.body,
        "data-pdf-preview": ""
    }, [
        Array.from({ length: currentLoad.document.numPages }, (_, index) => (h(PdfPage, {
            "key": index,
            "document": currentLoad.document,
            "page": index + 1,
            "requested": index === 0 || currentView.page === index + 1,
            "onVisible": pageVisible,
            "signal": tab.signal,
            "onWidth": index === 0 ? setPageWidth : undefined,
            "zoom": renderZoom.value,
            "zoomSurfaceClass": zoomSurfaceClass,
            "t": t
        })))
    ]);
    return h(ZoomViewport, {
        "preference": preference,
        intrinsicWidth: pageWidth.value,
        "horizontalInset": 24,
        "labels": labels,
        "signal": tab.signal,
        "scrollportRef": props.scrollportRef,
        "onPreference": setPreference,
        "onRenderZoom": setRenderZoom,
        children: [
            pages
        ]
    });
 }
}, { name: 'PdfBody', inheritAttrs: false, props: ["addResource","setResources","resourceAddress","content","wrap","scrollportRef","useTabInfo","useSession","sessionId","useProjection","useAccess","useConversation","useInput","inputActions","useRemoteAccess","useSessions","useSessionRetainInfo","useSessionAccess","usePanelInfo","useContextMenu","useResource","useWorkspaces","t","useStore","actions","retainTab","ZoomViewport","zoomSurfaceClass","loading"] })

const PdfPage = defineComponent((props: {
    readonly document: PdfDocument;
    readonly page: number;
    readonly requested: boolean;
    readonly onVisible: (page: number) => void;
    readonly signal: AbortSignal;
    readonly onWidth: ((width: number) => void) | undefined;
    readonly zoom: number;
    readonly zoomSurfaceClass: string;
} & PropsLocale<'sidebarPdf'>) => {
    const host = shallowRef<HTMLDivElement | null>(null);
    const canvas = shallowRef<HTMLCanvasElement | null>(null);
    const text = shallowRef<HTMLDivElement | null>(null);
    const width = ref<number>();
    const requested = ref(props.requested);
    const visible = ref(props.requested);
    const renderedZoom = { value: undefined as number | undefined };
    const pendingRender = { value: Promise.resolve() };
    const textTask = { value: undefined as ReturnType<ReturnType<typeof pdfTextRenderer>> | undefined };
    const state = ref<'loading' | 'ready'>('loading');
    const failure = shallowRef<{ readonly error: unknown }>();
    const attempt = ref(0);
    watch([() => props.page, () => props.onVisible, state, host, canvas], (_, _previous, onCleanup) => {
        const { page, onVisible } = props
        // A zoomed canvas can remain visible after its narrower page wrapper has
        // scrolled out horizontally. Observe the displayed page once it is ready.
        const node = state.value === 'ready' ? canvas.value : host.value;
        if (typeof IntersectionObserver === 'undefined') {
            requested.value = true;
            visible.value = true;
            return;
        }
        if (node === null) return;
        let disposed = false;
        const observer = new IntersectionObserver((entries) => {
            if (disposed)
                return;
            const intersects = entries.some(entry => entry.isIntersecting);
            visible.value = intersects;
            if (!intersects)
                return;
            requested.value = true;
            onVisible(page);
        }, { rootMargin: '100% 0px' });
        observer.observe(node);
        onCleanup(() => { disposed = true; observer.disconnect() });
    }, { flush: 'post', immediate: true });
    onScopeDispose(() => { textTask.value?.cancel() });
    watch([() => props.document, () => props.page, requested, visible, () => props.zoom, () => props.signal, attempt, () => props.onWidth, canvas, text], (_, _previous, onCleanup) => {
        const { document, page, zoom, signal, onWidth } = props
        if (!requested.value || canvas.value === null)
            return;
        failure.value = undefined;
        if (renderedZoom.value !== undefined && (!visible.value || renderedZoom.value === zoom))
            return;
        const node = canvas.value as HTMLCanvasElement;
        const lifetime = new AbortController();
        const renderSignal = AbortSignal.any([lifetime.signal, signal]);
        let newText: typeof textTask.value;
        // PDF.js shares a page proxy across renders; its cancelled task must finish
        // cleanup before another render starts. The displayed bitmap stays intact.
        pendingRender.value = pendingRender.value.then(async () => {
            renderSignal.throwIfAborted();
            const buffer = node.ownerDocument.createElement('canvas');
            try {
                const size = await renderPdfPage(document, page, buffer, renderSignal, window.devicePixelRatio * zoom, textTask.value === undefined ? (pdfPage, viewport) => {
                    newText = pdfTextRenderer(text.value as HTMLDivElement)(pdfPage, viewport);
                    return newText;
                } : undefined);
                renderSignal.throwIfAborted();
                const context = node.getContext('2d');
                if (context === null)
                    throw new Error('PDF canvas has no 2D context');
                node.width = buffer.width;
                node.height = buffer.height;
                node.style.setProperty('--pdf-page-width', `${size.width}px`);
                node.style.setProperty('--pdf-page-height', `${size.height}px`);
                context.drawImage(buffer, 0, 0);
                textTask.value ??= newText;
                newText = undefined;
                renderedZoom.value = zoom;
                width.value = size.width;
                onWidth?.(size.width);
                state.value = 'ready';
            }
            finally {
                buffer.width = buffer.height = 0;
                newText?.cancel();
            }
        }).catch((error: unknown) => { if (!renderSignal.aborted)
            failure.value = { error }; });
        onCleanup(() => { lifetime.abort(); newText?.cancel() });
    }, { flush: 'post', immediate: true });
    return () => {
    const { page, t, zoomSurfaceClass } = props
    return h("div", {
        "ref": host,
        "class": css.page,
        "data-pdf-page": page
    }, [
        failure.value === undefined && state.value !== 'ready' && (requested.value
            ? h("div", {
                "class": css.placeholder,
                "role": "status",
                "aria-label": t('rendering')
            }) : h("div", {
            "class": css.placeholder
        })),
        failure.value !== undefined && h("div", {
            "class": css.status,
            "role": "alert"
        }, [
            h("span", {}, [
                failureText(failure.value.error, t)
            ]),
            h(Button, {
                "size": "sm",
                "onClick": () => { attempt.value++; }
            }, {
                default: () => [
                    t('retry')
                ]
            })
        ]),
        h("div", {
            "class": `${css.surface} ${zoomSurfaceClass}`,
            "data-document-zoom-surface": "",
            "style": { '--document-zoom-width': `${width.value ?? 0}px` } as CSSProperties,
            "hidden": state.value !== 'ready'
        }, [
            h("canvas", {
                "ref": canvas,
                "class": css.canvas,
                "role": "img",
                "aria-label": t('pageImage', { page })
            }),
            h("div", {
                "ref": text,
                "class": css.text,
                "data-pdf-text": ""
            })
        ])
    ]);
 }
}, { name: 'PdfPage', inheritAttrs: false, props: ["document","page","requested","onVisible","signal","onWidth","zoom","zoomSurfaceClass","t"] })

function failureText(error: unknown, t: PropsLocale<'sidebarPdf'>['t']): string {
    if (error instanceof PdfWorkerFailure)
        return t('workerFailed');
    if (error instanceof Error && error.name === 'PasswordException')
        return t('password');
    return t('failed', { message: error instanceof Error ? error.message : String(error) });
}
