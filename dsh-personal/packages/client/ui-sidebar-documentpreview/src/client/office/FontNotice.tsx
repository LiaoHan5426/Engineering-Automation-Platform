/** Toolbar warning and non-modal details for the current preview’s missing fonts. */
import { computed, defineComponent, Fragment, h, ref, shallowRef, Teleport, useId, watch } from 'vue';

import clsx from 'clsx';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { Button, IconCloseOutlineRegular, IconWarningTriangleOutlineRegular, Tooltip, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import common from '../TextPreview.module.css';
import css from './FontNotice.module.css';
/** Notice inputs supplied by the document owner and Office locale registration. */
export type FontNoticeProps = PropsLocale<'sidebarOffice'> & {
    readonly fonts: readonly string[];
};
/**
 * Show a warning while fonts are unavailable for the current preview.
 * @param props - missing font families and localized copy.
 * @returns a warning button and its anchored details, or nothing when fonts are available.
 */
export const FontNotice = defineComponent((props: FontNoticeProps) => {
    const expanded = ref(false);
    const open = computed(() => props.fonts.length > 0 && expanded.value);
    const anchor = shallowRef<HTMLSpanElement | null>(null);
    const panel = shallowRef<HTMLDivElement | null>(null);
    const id = useId();
    const anchorName = `--dsh-font-notice-${id.replaceAll(':', '')}`;
    useDismissOnOutsidePointer(anchor, () => open.value, () => { expanded.value = false }, panel);
    const closeDetails = (): void => {
        expanded.value = false;
        anchor.value?.querySelector('button')?.focus();
    };
    watch([open, panel], () => { if (open.value) panel.value?.focus() }, { flush: 'post' })
    return () => {
    const { fonts, t } = props
    if (fonts.length === 0)
        return null;
    const label = t('viewMissingFonts', { count: fonts.length });
    return h(Fragment, {}, [
        h(Tooltip, {
            "label": label,
            "side": "bottom",
            "delayMs": 500,
            "disabled": open.value
        }, {
            default: () => [
                h("span", {
                    "ref": anchor,
                    "style": { anchorName },
                    "class": css.anchor,
                    "data-office-font-warning": ""
                }, [
                    h("button", {
                        "type": "button",
                        "class": clsx(common.tool, css.warning),
                        "aria-label": label,
                        "aria-expanded": open.value,
                        "aria-controls": open.value ? id : undefined,
                        "aria-haspopup": "dialog",
                        "onClick": () => { expanded.value = !expanded.value; }
                    }, [
                        h(IconWarningTriangleOutlineRegular, {})
                    ])
                ])
            ]
        }),
        open.value && h(Teleport, { to: document.body }, [h("div", {
            "ref": panel,
            "id": id,
            "role": "dialog",
            "aria-labelledby": `${id}-title`,
            "aria-describedby": `${id}-description`,
            "tabindex": -1,
            "class": css.panel,
            "style": { positionAnchor: anchorName },
            "onKeydown": (event: KeyboardEvent) => { if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeDetails();
            } },
            "onFocusout": (event: FocusEvent) => {
                if (event.relatedTarget instanceof Node && event.currentTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)
                    && !anchor.value?.contains(event.relatedTarget))
                    expanded.value = false;
            }
        }, [
            h("div", {
                "class": css.panelHeader
            }, [
                h("h3", {
                    "id": `${id}-title`
                }, [
                    t('missingFontsTitle')
                ]),
                h(Button, {
                    "size": "sm",
                    "aria-label": t('closeDetails'),
                    "onClick": closeDetails,
                }, { icon: () => h(IconCloseOutlineRegular) })
            ]),
            h("p", {
                "id": `${id}-description`,
                "class": css.description
            }, [
                t('missingFontsDescription')
            ]),
            h("p", {
                "class": css.count
            }, [
                t('missingFontsCount', { count: fonts.length })
            ]),
            h("ul", {
                "class": css.fonts
            }, [
                fonts.map(font => h("li", {
                    "key": font
                }, [
                    font
                ]))
            ])
        ])])
    ]);
 }
}, { name: 'FontNotice', inheritAttrs: false, props: ["t","fonts"] })
