import { h, type VNodeChild } from "vue";
/** The sidebar's Plugins entry icon; the sidebar owns the button, label, and selected state around it. */
import { IconPluginPinwheelOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
/**
 * Render the plugin glyph at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns the icon element.
 */
export function PluginsPanelIcon({ size }: PropsRuntime<"sidebar.panellist">): VNodeChild {
  return h(
    IconPluginPinwheelOutlineRegular,
    {
      size: size,
    },
  );
}

PluginsPanelIcon.inheritAttrs = false;
