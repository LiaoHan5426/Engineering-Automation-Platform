import { defineComponent, computed } from "vue";
/** Legacy external Session contributions shared by the row, header, and More trigger. */
import type { PropsRenderSlots, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
type Props = Pick<PropsRuntime<"contextMenu.content">, "target" | "dismiss"> &
  PropsRenderSlots<"sidebar.workspaces.session.menu.item">;
/** @param props - captured Session and the existing extension position. @returns legacy component contributions. */
export const SessionMenu = defineComponent(
  (props: Props) => {
    const hookContext = computed<readonly [boolean, (open: boolean) => void]>(() => [
      true,
      (open) => {
        if (!open) props.dismiss();
      },
    ]);
    return () => {
      if (props.target.kind !== "session") return null;
      return props.renderSlot("sidebar.workspaces.session.menu.item", props.target.value, {
        hookContext: hookContext.value,
      });
    };
  },
  { props: ["target", "dismiss", "renderSlot", "__renders"] },
);
