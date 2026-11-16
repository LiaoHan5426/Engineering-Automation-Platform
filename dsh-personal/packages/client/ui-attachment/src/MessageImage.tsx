import type { ContextMenuBindings } from "@deepseek-ai/dsh-client-ui-context-menu/client";
import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import {
  IconLoadingOutlineRegular,
  IconRefreshOutlineRegular,
  DraggableImage,
  ImageLightbox,
  type FileDragActions,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { MessageImageLabels } from "@deepseek-ai/dsh-client-ui-conversation/client";
import css from "./MessageImage.module.css";
import { h, Fragment, defineComponent, shallowRef, computed, watch } from "vue";
export type { MessageImageLabels } from "@deepseek-ai/dsh-client-ui-conversation/client";
/** Loads a Gateway-authorized durable image URL and may expose a cached URL synchronously. */
export type ImageLoader = ((attachment: ImageAttachmentRef) => Promise<string>) & {
  peek?: (attachment: ImageAttachmentRef) => string | undefined;
};
/** One gallery entry: a durable admitted reference, or a submission echo's local preview. */
export type MessageImageSpec =
  | {
      readonly attachment: ImageAttachmentRef;
      /** Presentation-only name for the thumbnail and lightbox; loading uses the original reference. */
      readonly label?: string;
    }
  | {
      readonly preview: {
        readonly url: string;
        readonly name?: string;
        readonly width?: number;
        readonly height?: number;
      };
    };
/** Display box for a lone image (DeepSeek Chat rule): long edge 240px with
 * the rendered aspect ratio clamped to [0.25, 4] — the overflow is cropped by
 * `object-fit: cover` — and never upscaled past the image's natural size. The
 * crop anchor keeps the top of very tall images and the left of very wide
 * ones, where the informative content usually starts. */
function singleFit(dimensions: { readonly width: number; readonly height: number }): {
  width: number;
  height: number;
  objectPosition: string;
} {
  const natural = dimensions.width / dimensions.height;
  const ratio = Math.min(4, Math.max(0.25, natural));
  const box =
    ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 };
  const scale = Math.min(1, dimensions.width / box.width, dimensions.height / box.height);
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? "center top" : natural > 4 ? "left center" : "center",
  };
}
/** Intrinsic dimensions of one gallery entry; a preview's stay unknown until its intake probe resolved. */
function dimensionsOf(image: MessageImageSpec):
  | {
      readonly width: number;
      readonly height: number;
    }
  | undefined {
  if ("attachment" in image) return image.attachment;
  return image.preview.width !== undefined && image.preview.height !== undefined
    ? { width: image.preview.width, height: image.preview.height }
    : undefined;
}

/**
 * Compact history renderer with retryable loading and click-to-open original
 * preview. A lone image renders at its `singleFit` size; an image among
 * several renders as a fixed 64px square tile. The preview arm displays its
 * local URL directly — no loader round-trip, no failure/retry surface.
 * List thumbnails use status icons with localized tooltips and accessible names.
 *
 * @param props.image - the durable reference to load, or the local preview to display.
 * @param props.load - Gateway-authorized URL loader for the durable arm.
 * @param props.variant - lone image, cropped gallery tile, or uncropped list thumbnail.
 * @param props.labels - resolved strings (tooltip, loading, retry, lightbox).
 * @returns the bounded thumbnail button, or the retry control on failure.
 */
export const MessageImage = defineComponent(
  (props: {
    image: MessageImageSpec;
    load: ImageLoader;
    variant: "single" | "tile" | "thumbnail";
    fileDrag: FileDragActions;
    labels: MessageImageLabels;
    getTriggerProps: ContextMenuBindings["getTriggerProps"];
  }) => {
    const attachment = computed(() =>
      "attachment" in props.image ? props.image.attachment : undefined,
    );
    const loaded = shallowRef<string | null>(
      attachment.value === undefined ? null : (props.load.peek?.(attachment.value) ?? null),
    );
    const error = shallowRef(false),
      open = shallowRef(false),
      attempt = shallowRef(0);
    const request = () => {
      attempt.value++;
    };
    const close = () => {
      open.value = false;
    };
    watch(
      [attachment, () => props.load, attempt],
      ([item, load], _old, onCleanup) => {
        if (item === undefined) return;
        let live = true;
        error.value = false;
        loaded.value = load.peek?.(item) ?? null;
        void load(item)
          .then((url) => {
            if (live) loaded.value = url;
          })
          .catch(() => {
            if (live) error.value = true;
          });
        onCleanup(() => {
          live = false;
        });
      },
      { immediate: true },
    );
    return () => {
      const { image, variant, labels, fileDrag, getTriggerProps } = props;
      const preview = "preview" in image ? image.preview : undefined;
      const item = attachment.value;
      const dimensions = dimensionsOf(image);
      const fit =
        variant !== "single"
          ? undefined
          : dimensions === undefined
            ? { width: 240, height: 240, objectPosition: "center" }
            : singleFit(dimensions);
      const src = preview?.url ?? loaded.value;
      const label =
        ("attachment" in image ? image.label : undefined) ??
        preview?.name ??
        item?.name ??
        labels.image;
      const contextMenuProps = getTriggerProps(
        src === null
          ? undefined
          : {
              kind: "image",
              value: {
                url: src,
                name: label,
                ...(item === undefined ? {} : { mediaType: item.mediaType }),
              },
            },
      );
      const loadingThumbnail = variant === "thumbnail" && src === null;
      if (error.value)
        return h(
          "button",
          {
            type: "button",
            class: css.error,
            "data-variant": variant,
            title: variant === "thumbnail" ? labels.loadFailed : undefined,
            "aria-label": variant === "thumbnail" ? labels.loadFailed : undefined,
            onClick: request,
          },
          [
            variant === "thumbnail"
              ? h("span", { "aria-hidden": "true" }, [
                  h(IconRefreshOutlineRegular, undefined, undefined),
                ])
              : labels.loadFailed,
          ],
        );
      return h(Fragment, undefined, [
        h(
          "button",
          {
            type: "button",
            class: css.frame,
            "data-variant": variant,
            style:
              fit === undefined
                ? undefined
                : { width: fit.width + "px", height: fit.height + "px" },
            title: loadingThumbnail ? labels.loading : labels.open,
            "aria-label": loadingThumbnail ? labels.loading : labels.openNamed(label),
            "aria-busy": loadingThumbnail || undefined,
            ...contextMenuProps,
            onClick: () => {
              if (src !== null) open.value = true;
            },
          },
          [
            src === null
              ? h("span", { class: css.loading, "aria-hidden": loadingThumbnail || undefined }, [
                  loadingThumbnail
                    ? h(IconLoadingOutlineRegular, { className: css.spinner ?? "" }, undefined)
                    : labels.loading,
                ])
              : h(
                  DraggableImage,
                  {
                    fileDrag: fileDrag,
                    src: src,
                    alt: label,
                    name: preview?.name ?? item?.name ?? "image",
                    style: fit === undefined ? undefined : { objectPosition: fit.objectPosition },
                  },
                  undefined,
                ),
          ],
        ),
        open.value &&
          src !== null &&
          h(
            ImageLightbox,
            {
              src: src,
              alt: label,
              labels: labels.lightbox,
              onClose: close,
              contextMenuProps: contextMenuProps,
            },
            undefined,
          ),
      ]);
    };
  },
  {
    name: "MessageImage",
    inheritAttrs: false,
    props: ["image", "load", "variant", "labels", "fileDrag", "getTriggerProps"],
  },
);

/** Wrapping image group shared by user and assistant history: a lone image
 * renders large unless its owner requests compact tiles or contained list thumbnails. */
export function ImageGallery({
  images,
  load,
  align,
  compact = false,
  thumbnail = false,
  labels,
  fileDrag,
  getTriggerProps,
}: {
  images: readonly MessageImageSpec[];
  load: ImageLoader;
  align: "start" | "end";
  compact?: boolean;
  thumbnail?: boolean;
  fileDrag: FileDragActions;
  labels: MessageImageLabels;
  getTriggerProps: ContextMenuBindings["getTriggerProps"];
}) {
  if (images.length === 0) return null;
  const variant = thumbnail ? "thumbnail" : compact || images.length > 1 ? "tile" : "single";
  return h("div", { class: css.gallery, "data-align": align }, [
    images.map((image, index) =>
      h(
        MessageImage,
        {
          key: `${"attachment" in image ? image.attachment.attachmentId : image.preview.url}:${index}`,
          image: image,
          load: load,
          variant: variant,
          fileDrag: fileDrag,
          labels: labels,
          getTriggerProps: getTriggerProps,
        },
        undefined,
      ),
    ),
  ]);
}
