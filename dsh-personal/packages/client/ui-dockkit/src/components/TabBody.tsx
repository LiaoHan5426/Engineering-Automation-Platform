/**
 * A tab's body from the embedder's renderer, shared by every layout. A layout
 * re-renders for its own previews (a float gesture or return, a divider or tab
 * drag) on every frame; the body is memoized on the renderer and the tab
 * record, so such a frame leaves it untouched.
 */
import { defineComponent } from "vue";
import type { TabRenderer } from "../contract/adapter.ts";
import type { TabRecord } from "../contract/types.ts";
/** One tab's body, re-rendered only when `renderTab` or `tab` is a new object. */
export const TabBody = defineComponent(
  (props: { readonly tab: TabRecord; readonly renderTab: TabRenderer }) => {
    return () => props.renderTab(props.tab);
  },
  { props: ["tab", "renderTab"] },
);
