/** Complete image bytes rendered in a shared zoom viewport. */
import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client';
import { computed, defineComponent, h, ref, shallowRef, watch, type CSSProperties } from 'vue';
import { DraggableImage } from '@deepseek-ai/dsh-client-ui-primitives';
import { bindImagePan } from './pan.ts';
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import type { DocumentPreviewProps } from '../document/contract.ts';
import { LoadingIndicator } from '../LoadingIndicator.tsx';
import { hostFileOf } from '../rpc.ts';
import { ZoomViewport, zoomSurfaceClass } from '../zoom/ZoomViewport.tsx';
import { DEFAULT_ZOOM, type ZoomInjected, type ZoomStore } from '../zoom/store.ts';
import type { ZoomLabels, ZoomPreference } from '../zoom/types.ts';
import type {} from './locales.ts';
import css from './ImageBody.module.css';
const IMAGE_MEDIA_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
} as const;
type ImageMediaType = typeof IMAGE_MEDIA_TYPES[keyof typeof IMAGE_MEDIA_TYPES];
/** Image-only operations injected alongside the shared zoom lifecycle. */
export interface ImageBodyInjected extends ZoomInjected {
    readonly fileDrag: import('@deepseek-ai/dsh-client-ui-primitives').FileDragActions;
}
/** Standard document props plus the image renderer's dictionary. */
export type ImageBodyProps = DocumentPreviewProps & PropsLocale<'sidebarImage'> & PropsStore<ZoomStore> & ImageBodyInjected;
type ImageSource = {
    readonly kind: 'ready';
    readonly data: Uint8Array<ArrayBuffer>;
    readonly mediaType: ImageMediaType;
    readonly url: string;
    readonly file: File;
} | {
    readonly kind: 'failed';
    readonly data: Uint8Array<ArrayBuffer>;
    readonly mediaType: ImageMediaType;
};
/**
 * Resolve a supported filename to the media type assigned to its Blob.
 * @param path - decoded workspace file path.
 * @returns the image media type, or undefined for an unregistered suffix.
 */
export function imageMediaType(path: string): ImageMediaType | undefined {
    const normalized = path.replaceAll('\\', '/');
    const name = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
    const extension = name.slice(name.lastIndexOf('.') + 1) as keyof typeof IMAGE_MEDIA_TYPES;
    return IMAGE_MEDIA_TYPES[extension];
}
/**
 * Present complete image bytes with fit-width and fixed-scale viewing.
 * @param props - document bytes, resource identity, and locale.
 * @returns a rounded image fitted or scaled at its intrinsic aspect ratio.
 */
export const ImageBody = defineComponent((props: ImageBodyProps) => {
    const { getTriggerProps } = props.useContextMenu()
    const info = props.useTabInfo()
    const tabId = info.value.tab.id
    const preference = props.useStore(state => state.byTab[tabId] ?? DEFAULT_ZOOM)
    const path = computed(() => hostFileOf(props.resourceAddress).path)
    const mediaType = computed(() => imageMediaType(path.value))
    const data = computed(() => props.content.kind === 'bytes' ? props.content.data : undefined)
    const source = shallowRef<ImageSource>()
    const setPreference = (value: ZoomPreference): void => { props.actions.zoom(info.value.tab.id, value) }
    watch(() => [props.retainTab, info.value.tab.id, info.value.tab.signal] as const, () => {
      props.retainTab(info.value.tab.id, info.value.tab.signal)
    }, { immediate: true })
    watch([data, mediaType, path], ([data, mediaType, path], _previous, onCleanup) => {
      if (data === undefined || mediaType === undefined) return
      let url: string | undefined
      try {
        const file = new File([data], pathPartsOf(path).name, { type: mediaType })
        url = URL.createObjectURL(file)
        source.value = { kind: 'ready', data, mediaType, url, file }
      } catch (error) {
        // Blob failures produce a localized failure view for this revision.
        source.value = { kind: 'failed', data, mediaType }
      }
      onCleanup(() => { if (url !== undefined) URL.revokeObjectURL(url) })
    }, { immediate: true })
    return () => {
    const { resourceAddress, t } = props
    const { tab } = info.value
    const currentSource = source.value
    const currentData = data.value
    const currentMediaType = mediaType.value
    const currentPath = path.value
    if (currentData === undefined || currentMediaType === undefined) {
        return h("p", {
            "class": css.status,
            "role": "alert"
        }, [
            t('unsupported')
        ]);
    }
    if (currentSource?.data !== currentData || currentSource.mediaType !== currentMediaType) {
        return h(LoadingIndicator, {
            "label": t('loading')
        });
    }
    if (currentSource.kind === 'failed')
        return h("p", {
            "class": css.status,
            "role": "alert"
        }, [
            t('failed')
        ]);
    const { name } = pathPartsOf(currentPath);
    const labels: ZoomLabels = {
        controls: t('zoomControls'), menu: t('zoomMenu'), out: t('zoomOut'), into: t('zoomIn'),
        fitWidth: t('zoomFitWidth'), value: percent => t('zoomValue', { percent }),
    };
    return h(LoadedImage, {
        "fileDrag": props.fileDrag,
        "contextMenuProps": getTriggerProps({ kind: 'image', value: { sessionId: props.sessionId, path: currentPath, url: currentSource.url, mediaType: currentMediaType } }),
        "resourceAddress": resourceAddress,
        "key": currentSource.url,
        "url": currentSource.url,
        "name": name,
        "file": currentSource.file,
        "preference": preference.value,
        "onPreference": setPreference,
        "labels": labels,
        "signal": tab.signal,
        "scrollportRef": props.scrollportRef,
        "t": t
    });
 }
}, { name: 'ImageBody', inheritAttrs: false, props: ["addResource","setResources","resourceAddress","content","wrap","scrollportRef","useTabInfo","useSession","sessionId","useProjection","useAccess","useConversation","useInput","inputActions","useRemoteAccess","useSessions","useSessionRetainInfo","useSessionAccess","usePanelInfo","useContextMenu","useResource","useWorkspaces","t","useStore","actions","fileDrag","retainTab"] })

/** SVG stays in the browser's static image mode because its bytes only reach an img Blob URL. */
const LoadedImage = defineComponent((props: {
    readonly contextMenuProps: ContextMenuTriggerProps;
    readonly fileDrag: ImageBodyInjected['fileDrag'];
    readonly url: string;
    readonly name: string;
    readonly file: File;
    readonly resourceAddress: string;
    readonly preference: ZoomPreference;
    readonly onPreference: (preference: ZoomPreference) => void;
    readonly labels: ZoomLabels;
    readonly signal: AbortSignal;
    readonly scrollportRef: ImageBodyProps['scrollportRef'];
    readonly t: ImageBodyProps['t'];
}) => {
    const image = shallowRef<HTMLImageElement | null>(null)
    watch(image, (image, _previous, onCleanup) => {
      if (image !== null) onCleanup(bindImagePan(image))
    }, { flush: 'post' })
    const attachImage = (node: HTMLImageElement | null): void => { image.value = node }
    const state = ref<'loading' | 'ready' | 'failed'>('loading')
    const width = ref<number>()
    return () => {
    const { url, name, file, resourceAddress, preference, onPreference, labels, signal, scrollportRef, t, fileDrag, contextMenuProps } = props
    return h(ZoomViewport, {
        "preference": preference,
        intrinsicWidth: width.value,
        "horizontalInset": 24,
        "labels": labels,
        "signal": signal,
        "scrollportRef": scrollportRef,
        "onPreference": onPreference,
        children: [
            h("div", {
                "class": css.frame,
                "data-image-preview": ""
            }, [
                state.value === 'loading' && h(LoadingIndicator, {
                    "label": t('loading')
                }),
                state.value === 'failed' && h("p", {
                    "class": css.status,
                    "role": "alert"
                }, [
                    t('failed')
                ]),
                h("div", {
                    "class": `${css.surface} ${zoomSurfaceClass}`,
                    "data-document-zoom-surface": "",
                    "style": { '--document-zoom-width': `${width.value ?? 0}px` } as CSSProperties,
                    "hidden": state.value !== 'ready'
                }, [
                    h(DraggableImage, {
                        "fileDrag": fileDrag,
                        ...contextMenuProps,
                        "resourceAddress": resourceAddress,
                        "elementRef": attachImage,
                        "className": css.image,
                        "src": url,
                        "alt": t('preview', { name }),
                        "decoding": "async",
                        "name": name,
                        "original": file,
                        "referrerPolicy": "no-referrer",
                        "onLoad": (event: Event) => { if (event.currentTarget instanceof HTMLImageElement) width.value = event.currentTarget.naturalWidth; state.value = 'ready'; },
                        "onError": () => { state.value = 'failed'; }
                    })
                ])
            ])
        ]
    });
 }
}, { name: 'LoadedImage', inheritAttrs: false, props: ["contextMenuProps","fileDrag","url","name","file","resourceAddress","preference","onPreference","labels","signal","scrollportRef","t"] })
