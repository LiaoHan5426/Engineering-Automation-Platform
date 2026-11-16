/** Chip title of the forge tab: the change request glyph and the localized tab name. */
import { h, Fragment, type VNodeChild } from 'vue';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { ChangeRequestGlyph } from './glyphs.tsx';
import type { NS } from './locales.ts';
import css from './ForgeTab.module.css';
/**
 * Render the tab chip title in the current UI language.
 * @param props - forge panel copy.
 * @returns the glyph followed by the tab name.
 */
export function ForgeTabTitle({ t }: PropsLocale<typeof NS>): VNodeChild {
    return (h(Fragment, null, [h("span", {
            "class": css.titleIcon
        }, [h(ChangeRequestGlyph, {
                "tone": "open",
                "tinted": false,
                "size": 16
            })]), h("span", {
            "class": css.titleText
        }, [t('tab.title')])]));
}
