/** One engine realm per mounted workbook; input cells never share mutable engine state. */
import { defineComponent, h, onScopeDispose, shallowRef, watch } from "vue";
import type { Sheet } from "@fortune-sheet/core";
import { css, scripts } from "luckysheet-preview:assets";

interface WorkbookEngine {
  create(options: Record<string, unknown>): void;
  destroy(): void;
  resize(): void;
  getRangeHtml(): string;
}
declare global {
  interface Window {
    luckysheet?: WorkbookEngine;
  }
}
interface WorkbookProps {
  readonly sheets: readonly Sheet[];
  readonly language: string;
  readonly label: string;
}

/** Display a parsed workbook in its own same-origin realm and release all engine resources on removal. */
export const Workbook = defineComponent(
  (props: WorkbookProps) => {
    const frame = shallowRef<HTMLIFrameElement | null>(null);
    const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
      value.toString(16).padStart(8, "0"),
    ).join("");
    const documentSource = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'"></head><body><div id="workbook" style="position:absolute;inset:0"></div></body></html>`;
    let dispose = () => {};
    const initialize = () => {
      dispose();
      const element = frame.value;
      const doc = element?.contentDocument;
      const realm = element?.contentWindow;
      if (element === null || doc == null || realm == null) return;
      const style = doc.createElement("style");
      style.textContent = `html,body{margin:0;width:100%;height:100%;overflow:hidden}${css}`;
      doc.head.append(style);
      for (const source of scripts) {
        const script = doc.createElement("script");
        script.nonce = nonce;
        script.textContent = source;
        doc.head.append(script);
      }
      const engine = realm.luckysheet;
      if (engine === undefined) throw new Error("Spreadsheet engine did not initialize");
      engine.create({
        container: "workbook",
        data: structuredClone(props.sheets),
        lang: props.language,
        allowEdit: false,
        allowCopy: true,
        forceCalculation: false,
        showtoolbar: false,
        showinfobar: false,
        showstatisticBar: false,
        showsheetbar: true,
        sheetFormulaBar: true,
        enableAddRow: false,
        enableAddBackTop: false,
        showsheetbarConfig: { add: false, menu: false, sheet: true },
        cellRightClickConfig: {
          copy: true,
          copyAs: false,
          paste: false,
          insertRow: false,
          insertColumn: false,
          deleteRow: false,
          deleteColumn: false,
          deleteCell: false,
          hideRow: false,
          hideColumn: false,
          clear: false,
          matrix: false,
          sort: false,
          filter: false,
          chart: false,
          image: false,
          link: false,
          data: false,
          cellFormat: false,
        },
      });
      // The engine's allowEdit flag does not make its formula bar or hidden editor readonly.
      // Disable their native editing surface before focus and retain selection/copy/navigation.
      const controls = [
        ...doc.querySelectorAll<HTMLElement>(
          "#luckysheet-functionbox-cell, #luckysheet-rich-text-editor",
        ),
      ];
      const rejectEdit = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const rejectEditKey = (event: KeyboardEvent) => {
        if (
          event.key === "Backspace" ||
          event.key === "Delete" ||
          event.key === "Enter" ||
          (event.key.length === 1 && !event.ctrlKey && !event.metaKey) ||
          ((event.ctrlKey || event.metaKey) && /[vx]/iu.test(event.key))
        )
          rejectEdit(event);
      };
      for (const control of controls) {
        control.contentEditable = "false";
        control.setAttribute("aria-readonly", "true");
        control.addEventListener("keydown", rejectEditKey, true);
        for (const type of ["beforeinput", "paste", "drop", "cut"])
          control.addEventListener(type, rejectEdit, true);
      }
      const bar = doc.querySelector<HTMLElement>("#luckysheet-functionbox-cell");
      if (bar !== null) {
        bar.tabIndex = 0;
        bar.setAttribute("role", "textbox");
        bar.style.whiteSpace = "pre";
        bar.style.overflowX = "auto";
      }
      // Luckysheet copies its table through a temporary input; publish the table and plain cells
      // as separate native clipboard formats instead of exposing HTML as plain text.
      const copy = (event: ClipboardEvent) => {
        const source = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          "input:focus, textarea:focus",
        );
        if (
          source === null ||
          !source.value.startsWith('<table data-type="luckysheet_copy_action_table">') ||
          event.clipboardData === null
        )
          return;
        const html = engine.getRangeHtml();
        // Cell contents were escaped by the pinned pre-sink asset transform.
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const text =
          [...parsed.querySelectorAll("tr")]
            .map((row) =>
              [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "").join("\t"),
            )
            .join("\n") + "\n";
        event.clipboardData.setData("text/html", html);
        event.clipboardData.setData("text/plain", text);
        event.preventDefault();
      };
      doc.addEventListener("copy", copy, true);
      const observer =
        typeof ResizeObserver === "undefined"
          ? undefined
          : new ResizeObserver(() => engine.resize());
      observer?.observe(element);
      dispose = () => {
        observer?.disconnect();
        doc.removeEventListener("copy", copy, true);
        for (const control of controls) {
          control.removeEventListener("keydown", rejectEditKey, true);
          for (const type of ["beforeinput", "paste", "drop", "cut"])
            control.removeEventListener(type, rejectEdit, true);
        }
        engine.destroy();
        doc.documentElement.replaceChildren();
      };
    };
    watch(
      () => [props.sheets, props.language],
      () => {
        dispose();
        dispose = () => {};
        // A fresh document also drops realm-owned listeners, timers, clipboard state, and storage adapters.
        if (frame.value !== null) frame.value.srcdoc = documentSource;
      },
    );
    onScopeDispose(() => dispose());
    return () =>
      h("iframe", {
        ref: frame,
        srcdoc: documentSource,
        title: props.label,
        onLoad: initialize,
        style: { border: "0", width: "100%", height: "100%", display: "block" },
      });
  },
  { name: "Workbook", props: ["sheets", "language", "label"], inheritAttrs: false },
);
