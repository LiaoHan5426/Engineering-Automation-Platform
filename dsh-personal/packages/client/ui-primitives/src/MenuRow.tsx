import { defineComponent, h, useId } from 'vue';
import type { PropType, HTMLAttributes, VNodeChild } from 'vue';
/** Package-internal row presentation shared by component, data, and child menu entries. */
import clsx from 'clsx';
import type { MenuEntry, MenuItemButtonProps, MenuLabel, MenuSeparator } from './Menu.tsx';
import { IconCheckOutlineRegular, IconChevronRightOutlineRegular } from './icons/index.tsx';
import { ShortcutKeys } from './ShortcutKeys.tsx';
import { Tooltip } from './Tooltip.tsx';
import css from './Menu.module.css';
export const MenuRow = defineComponent({ name: 'MenuRow', inheritAttrs: false, props: { icon: null, shortcut: Object as PropType<MenuItemButtonProps['shortcut']>, current: Boolean, disabled: Boolean, disabledReason: String, danger: Boolean, separatorBefore: Boolean, selected: Boolean, selection: { type: String, default: 'check' }, reserveIcon: Boolean, decorativeIcon: { type: Boolean, default: true }, wrapperProps: Object as PropType<HTMLAttributes> }, setup(props, { attrs, slots }) {
        const reasonId = useId();
        return () => {
            const { icon, shortcut, current, disabled, disabledReason, danger, separatorBefore, selected, selection, reserveIcon, decorativeIcon, wrapperProps } = props;
            const explained = disabled && disabledReason !== undefined;
            // Tooltip remains mounted when the explanation changes, preserving button focus.
            return h("div", { ...wrapperProps, "class": css.itemWrap }, [separatorBefore && h("div", { "class": css.separator, "role": "separator" }, undefined), h(Tooltip, { "label": disabledReason ?? '', "disabled": !explained, "side": "bottom", "delayMs": 500, "maxWidth": 300, "portal": true }, { default: () => [h("button", { ...attrs, "type": "button", "role": "menuitem", "class": clsx(css.item, selected && (selection === 'fill' ? css.selectedFill : css.selected), danger && css.danger), "disabled": disabled && !explained, "aria-disabled": explained || undefined, "aria-describedby": explained ? reasonId : undefined, "aria-keyshortcuts": shortcut?.aria, "aria-current": current === true ? 'page' : undefined, "onClick": explained ? undefined : attrs.onClick }, [(icon !== undefined || reserveIcon) && h("span", { "aria-hidden": decorativeIcon || undefined, "class": css.itemIcon }, [icon]), h("span", { "class": css.itemLabel }, [slots.default?.()]), shortcut !== undefined && h("span", { "aria-hidden": "true", "class": css.shortcut }, [h(ShortcutKeys, { "keys": shortcut.keys, "className": css.shortcutKeys ?? '' }, undefined)]), selected && selection === 'check' && h(IconCheckOutlineRegular, { "className": css.check ?? '' }, undefined), attrs['aria-haspopup'] === 'menu' && h(IconChevronRightOutlineRegular, { "aria-hidden": "true", "className": css.check ?? '' }, undefined)])] }), explained && h("span", { "id": reasonId, "hidden": true }, [disabledReason])]);
        };
    } });
/** Mark icon columns within each separator-delimited data group.
 * @param entries - entries in one menu area.
 * @param contextual - whether to align grouped context-menu icons.
 * @returns entries that reserve a leading icon column.
 */
export function menuIconColumns(entries: readonly MenuEntry[], contextual: boolean): ReadonlySet<MenuEntry> {
    const aligned = new Set<MenuEntry>();
    if (!contextual)
        return aligned;
    let group: MenuEntry[] = [];
    const finish = (): void => {
        if (group.some(entry => !('type' in entry) && entry.icon !== undefined)) {
            for (const entry of group)
                aligned.add(entry);
        }
        group = [];
    };
    for (const entry of entries) {
        if ('type' in entry && entry.type === 'separator')
            finish();
        else
            group.push(entry);
    }
    finish();
    return aligned;
}
/** Render a separator or group heading outside the keyboard walk.
 * @param entry - non-interactive menu entry.
 * @returns the corresponding element.
 */
export function renderMenuDecoration(entry: MenuSeparator | MenuLabel): VNodeChild {
    return entry.type === 'separator' ? h("div", { "key": entry.id, "class": css.separator, "role": "separator" }, undefined) : h("div", { "key": entry.id, "class": css.label, "role": "presentation" }, [entry.text]);
}
