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
      style.textContent = `html,body{margin:0;width:100%;height:100%;overflow:hidden}${css}
.luckysheet{border:0!important;width:100%!important;height:100%!important}
.luckysheet-stat-area{display:block!important;height:0!important;background:none}
.luckysheet-sta-c{height:0;border:0;background:none}
.luckysheet-zoom-content{display:flex!important;position:absolute;bottom:0;right:0;height:31px}
.luckysheet-zoom-content .luckysheet-zoom-minus,.luckysheet-zoom-content .luckysheet-zoom-plus{top:5px}
.luckysheet-zoom-content .luckysheet-zoom-slider{top:5px;height:22px}
.luckysheet-sheet-area{display:flex;align-items:center;box-sizing:border-box;padding:0 220px 0 0}
.luckysheet-sheet-area div.luckysheet-sheet-container{max-width:none!important;min-width:0;flex:1 1 auto}
#luckysheet-sheets-leftscroll,#luckysheet-sheets-rightscroll{flex:none}
.luckysheet-freezebar-handle,.luckysheet-freezebar-drop,.luckysheet-sheets-item-menu{display:none!important}`;
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
        fullscreenmode: false,
        forceCalculation: false,
        showtoolbar: false,
        showinfobar: false,
        // Keep the engine's statistics height at zero; the iframe stylesheet places zoom in the tab row.
        showstatisticBar: false,
        showstatisticBarConfig: { count: false, view: false, zoom: false },
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
          event.key === "F2" ||
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
      let active = true;
      const editor = doc.getElementById("luckysheet-rich-text-editor");
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
        // The engine removes its focused clipboard input without restoring non-fullscreen focus.
        queueMicrotask(() => {
          if (
            active &&
            frame.value === element &&
            element.contentDocument === doc &&
            doc.hasFocus() &&
            doc.activeElement === doc.body &&
            !source.isConnected &&
            editor?.isConnected === true
          ) {
            editor.focus({ preventScroll: true });
          }
        });
      };
      const wheel = (event: WheelEvent) => {
        if (event.ctrlKey || event.metaKey || event.deltaMode !== 0 || !event.cancelable) return;
        const path = event.composedPath();
        const tabs = doc.querySelector<HTMLElement>("#luckysheet-sheet-container-c");
        const grid = doc.querySelector<HTMLElement>("#luckysheet-grid-window-1");
        if (tabs !== null && path.includes(tabs)) {
          if (event.deltaX === 0 && event.deltaY === 0) return;
          tabs.scrollLeft += event.deltaX || event.deltaY;
        } else if (grid !== null && path.includes(grid)) {
          const x = doc.querySelector<HTMLElement>("#luckysheet-scrollbar-x");
          const y = doc.querySelector<HTMLElement>("#luckysheet-scrollbar-y");
          if (x === null || y === null || (event.deltaX === 0 && event.deltaY === 0)) return;
          // These scrollports notify the engine's renderer through its native scroll listeners.
          x.scrollLeft += event.deltaX;
          y.scrollTop += event.deltaY;
        } else return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const rejectSheetEdit = (event: MouseEvent) => {
        const tabs = doc.getElementById("luckysheet-sheet-container-c");
        if (tabs === null || !event.composedPath().includes(tabs)) return;
        // The native click listener still selects sheets; mousedown also starts editable tab dragging.
        event.stopImmediatePropagation();
        if (event.type === "contextmenu" || event.button !== 0) event.preventDefault();
      };
      const scrollSheets = (event: MouseEvent) => {
        if (!active || frame.value !== element || element.contentDocument !== doc) return;
        const path = event.composedPath();
        const left = doc.getElementById("luckysheet-sheets-leftscroll");
        const right = doc.getElementById("luckysheet-sheets-rightscroll");
        const direction =
          left !== null && path.includes(left)
            ? -1
            : right !== null && path.includes(right)
              ? 1
              : 0;
        const tabs = doc.getElementById("luckysheet-sheet-container-c");
        if (direction === 0 || tabs === null) return;
        tabs.scrollLeft += direction * 150;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      doc.addEventListener("click", scrollSheets, true);
      doc.addEventListener("mousedown", rejectSheetEdit, true);
      doc.addEventListener("contextmenu", rejectSheetEdit, true);
      doc.addEventListener("wheel", wheel, { capture: true, passive: false });
      doc.addEventListener("copy", copy, true);
      const observer =
        typeof ResizeObserver === "undefined"
          ? undefined
          : new ResizeObserver(() => {
              if (
                !active ||
                frame.value !== element ||
                element.contentDocument !== doc ||
                !element.isConnected
              )
                return;
              engine.resize();
              if (!active || frame.value !== element || element.contentDocument !== doc) return;
              const port = doc.getElementById("luckysheet-sheet-container-c");
              const selected = port?.querySelector(".luckysheet-sheets-item-active");
              if (port == null || selected == null || !port.isConnected || !selected.isConnected)
                return;
              const viewport = port.getBoundingClientRect();
              const tab = selected.getBoundingClientRect();
              if (viewport.width <= 0 || tab.width <= 0) return;
              if (tab.right > viewport.right) port.scrollLeft += tab.right - viewport.right;
              else if (tab.width <= viewport.width && tab.left < viewport.left)
                port.scrollLeft += tab.left - viewport.left;
            });
      observer?.observe(element);
      dispose = () => {
        active = false;
        observer?.disconnect();
        doc.removeEventListener("click", scrollSheets, true);
        doc.removeEventListener("wheel", wheel, true);
        doc.removeEventListener("mousedown", rejectSheetEdit, true);
        doc.removeEventListener("contextmenu", rejectSheetEdit, true);
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
