import type {
  ComposerAttachment,
  ComposerAttachmentsProps,
  ComposerImageAttachment,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  IconCloseFillRegular,
  IconRefreshOutlineRegular,
  IconWarningOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { AttachmentRail } from '../AttachmentRail.tsx'
import type { AttachmentRailItem } from '../AttachmentRail.tsx'
import { DropOverlay } from '../DropOverlay.tsx'
import { FileCard } from '../FileCard.tsx'
import { ImageLightbox } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  attachmentRailLabels,
  dropOverlayLabels,
  fileCardLabels,
  lightboxLabels,
} from './labels.ts'
import { installDocumentDropEvents } from './drop-events.ts'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ComposerAttachments.module.css'
import { h, Fragment, defineComponent, shallowRef, watch } from 'vue'
/** Rail item retaining its browser-owned attachment for callbacks. */
interface ComposerRailItem extends AttachmentRailItem {
  attachment: ComposerAttachment
}
/** File transfer lookup injected by this attachment implementation. */
export interface ComposerAttachmentsInjected {
  readonly readFileDrag: (transfer: DataTransfer) => File | undefined
}
/** The owner share and locale seat the attachment rail reads from its slot props. */
type ComposerAttachmentsInput = Pick<
  ComposerAttachmentsProps,
  | 'attachments'
  | 'canAcceptDrop'
  | 'onAddFiles'
  | 'onRemoveAttachment'
  | 'uploads'
  | 'onRetryFile'
  | 'uploadFailureText'
  | 'dropLimits'
  | 't'
>

/** Draft image previews, pending-file cards, drop target, and original-image preview. */
export const ComposerAttachments = defineComponent(
  (props: ComposerAttachmentsInput & InjectFace<ComposerAttachmentsInjected>) => {
    const preview = shallowRef<ComposerImageAttachment | null>(null),
      dragActive = shallowRef(false)
    const dragDepth = { current: 0 }
    const setPreview = (next: ComposerImageAttachment | null) => {
      preview.value = next
    }
    const closePreview = () => { setPreview(null) }
    watch([() => props.attachments, preview], () => {
      if (preview.value !== null && !props.attachments.some(a => a.id === preview.value?.id))
        setPreview(null)
    })
    watch(
      [() => props.canAcceptDrop, () => props.onAddFiles, () => props.readFileDrag],
      ([accept, add, read], _old, onCleanup) => {
        onCleanup(
          installDocumentDropEvents(
            accept,
            add,
            dragDepth,
            (active) => {
              dragActive.value = active
            },
            read,
          ),
        )
      },
      { immediate: true },
    )
    return () => {
      const {
        attachments,
        canAcceptDrop,
        onRemoveAttachment,
        uploads,
        onRetryFile,
        uploadFailureText,
        dropLimits,
        t,
      } = props
      const railItems: ComposerRailItem[] = attachments.map(attachment => ({
        id: attachment.id,
        attachment,
      }))
      return h(Fragment, undefined, [
        dragActive.value &&
          h(
            DropOverlay,
            { disabled: !canAcceptDrop, labels: dropOverlayLabels(t, canAcceptDrop, dropLimits) },
            undefined,
          ),
        railItems.length > 0 &&
          h('div', { class: css.rail }, [
            h(
              AttachmentRail<ComposerRailItem>,
              {
                items: railItems,
                labels: attachmentRailLabels(t),
                renderItem: (item) => {
                  const attachment = item.attachment
                  if (attachment.kind === 'file') {
                    const upload = uploads[attachment.id]
                    return h(
                      FileCard,
                      {
                        name: attachment.file.name || t('file.label'),
                        bytes: attachment.file.size,
                        state:
                          upload === undefined || upload.status === 'uploading'
                            ? 'uploading'
                            : upload.status === 'ready'
                              ? 'ready'
                              : 'error',
                        ...(upload?.status === 'uploading' &&
                        upload.total !== undefined &&
                        upload.total > 0
                          ? { progress: upload.loaded / upload.total }
                          : {}),
                        labels: fileCardLabels(t, attachment.file.name),
                        onRemove: () => {
                          onRemoveAttachment(attachment.id)
                        },
                        onRetry: () => {
                          onRetryFile(attachment.id)
                        },
                      },
                      undefined,
                    )
                  }
                  // An uploading image shows its progress; a failed upload turns the thumbnail into its retry
                  // control, except one the Host refused, which explains why and leaves removal as the way out.
                  // The refusal is the only explanation of its warning, so a tap or click also pins it.
                  const upload = uploads[attachment.id]
                  const name = attachment.file.name || t('image.pending')
                  const refusal =
                    upload?.status === 'error' && upload.reason !== undefined
                      ? uploadFailureText(upload.reason)
                      : undefined
                  return h('div', { class: css.imageItem }, [
                    refusal !== undefined
                      ? h(
                        Tooltip,
                        {
                          label: refusal,
                          side: 'top',
                          delayMs: 300,
                          portal: true,
                          openOnClick: true,
                        },
                        {
                          default: () => [
                            h(
                              'button',
                              {
                                type: 'button',
                                class: `${css.thumbnail} ${css.thumbnailFailed} ${css.thumbnailRefused}`,
                                'aria-label': refusal,
                              },
                              [
                                h('img', { src: attachment.previewUrl, alt: '' }, undefined),
                                h('span', { class: css.failureGlyph, 'aria-hidden': true }, [
                                  h(IconWarningOutlineRegular, { size: 16 }, undefined),
                                ]),
                              ],
                            ),
                          ],
                        },
                      )
                      : upload?.status === 'error'
                        ? h(
                          Tooltip,
                          {
                            label: t('file.uploadFailed'),
                            side: 'top',
                            delayMs: 300,
                            portal: true,
                          },
                          {
                            default: () => [
                              h(
                                'button',
                                {
                                  type: 'button',
                                  class: `${css.thumbnail} ${css.thumbnailFailed}`,
                                  'aria-label': t('file.retry', { name }),
                                  onClick: () => {
                                    onRetryFile(attachment.id)
                                  },
                                },
                                [
                                  h('img', { src: attachment.previewUrl, alt: '' }, undefined),
                                  h('span', { class: css.failureGlyph, 'aria-hidden': true }, [
                                    h(IconRefreshOutlineRegular, { size: 16 }, undefined),
                                  ]),
                                ],
                              ),
                            ],
                          },
                        )
                        : h(
                          'button',
                          {
                            type: 'button',
                            class: css.thumbnail,
                            title: t('image.openOriginal'),
                            'aria-busy': upload?.status === 'uploading',
                            onClick: () => {
                              setPreview(attachment)
                            },
                          },
                          [h('img', { src: attachment.previewUrl, alt: name }, undefined)],
                        ),
                    upload?.status === 'uploading' &&
                      h('span', { class: css.progressTrack, 'aria-hidden': true }, [
                        h(
                          'span',
                          {
                            class: css.progressBar,
                            style:
                              upload.total === undefined || upload.total <= 0
                                ? undefined
                                : {
                                  width: `${String(Math.min(1, upload.loaded / upload.total) * 100)}%`,
                                },
                          },
                          undefined,
                        ),
                      ]),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.remove,
                        'aria-label': t('image.remove', { name }),
                        onClick: () => {
                          onRemoveAttachment(attachment.id)
                        },
                      },
                      [h(IconCloseFillRegular, { size: 12 }, undefined)],
                    ),
                  ])
                },
              },
              undefined,
            ),
          ]),
        preview.value !== null &&
          h(
            ImageLightbox,
            {
              src: preview.value.previewUrl,
              alt: preview.value.file.name || t('image.original'),
              labels: lightboxLabels(t),
              onClose: closePreview,
            },
            undefined,
          ),
      ])
    }
  },
  {
    name: 'ComposerAttachments',
    inheritAttrs: false,
    props: [
      'attachments',
      'canAcceptDrop',
      'onAddFiles',
      'onRemoveAttachment',
      'uploads',
      'onRetryFile',
      'uploadFailureText',
      'dropLimits',
      't',
      'readFileDrag',
    ],
  },
)
