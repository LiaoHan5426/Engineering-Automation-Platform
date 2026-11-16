/** Live Browser tab title from the Browser store. */
import { defineComponent, h, Fragment } from "vue";
import { IconGlobeOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsRuntime, PropsStore } from "@deepseek-ai/dsh-client-ui-slots";
import { currentBrowserTarget } from "../browser/BrowserPersistence.ts";
import type { BrowserStore } from "../browser/store.ts";
import css from "./Browser.module.css";
/** Browser title props assembled by the Sidebar title seat. */
export type BrowserTitleProps = PropsRuntime<"sidebar.right.pane.tab.title"> &
  PropsStore<BrowserStore>;
/** Browser icon and current host name. */
export const BrowserTitle = defineComponent(
  (props: BrowserTitleProps) => {
    const info = props.useTabInfo();
    const entry = props.useStore((state) => currentBrowserTarget(state.byTab[info.value.tab.id]));
    return () =>
      h(Fragment, null, [
        h(IconGlobeOutlineRegular, { className: css.titleIcon ?? "" }),
        entry.value?.title ?? info.value.tab.title,
      ]);
  },
  { props: ["useTabInfo", "useStore", "sessionId"] },
);
