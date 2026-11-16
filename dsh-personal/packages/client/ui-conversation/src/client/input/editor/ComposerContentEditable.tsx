/** Resident native Vue DOM host for the model-owned Lexical editor. */
import {
  defineComponent,
  h,
  shallowRef,
  useAttrs,
  watchPostEffect,
  type HTMLAttributes,
} from "vue";
import type { LexicalEditor } from "lexical";

/** Host props: the editor binding plus the div passthroughs the bar owns. */
export interface ComposerContentEditableProps extends HTMLAttributes {
  /** The model-owned editor; null renders the same div unbound and inert. */
  readonly editor: LexicalEditor | null;
  /** The only presentation write to the editor's editability gate. */
  readonly editable: boolean;
}

/** Bind the resident element after DOM commit and detach before rebinding or disposal. */
export const ComposerContentEditable = defineComponent(
  (props: ComposerContentEditableProps) => {
    const element = shallowRef<HTMLDivElement | null>(null);
    const attrs = useAttrs();
    watchPostEffect((onCleanup) => {
      const editor = props.editor;
      const host = element.value;
      if (editor === null || host === null) return;
      editor.setRootElement(host);
      onCleanup(() => {
        if (editor.getRootElement() === host) editor.setRootElement(null);
      });
    });
    watchPostEffect(() => {
      props.editor?.setEditable(props.editable);
      // Changing a focused editing host can force layout. Apply the DOM gate
      // after the sibling transcript has committed the accepted message echo.
      element.value?.setAttribute(
        "contenteditable",
        String(props.editor !== null && props.editable),
      );
    });
    return () =>
      h("div", {
        ref: element,
        role: "textbox",
        "aria-multiline": "true",
        "data-composer-input": "",
        ...attrs,
      });
  },
  { props: ["editor", "editable"], inheritAttrs: false },
);
