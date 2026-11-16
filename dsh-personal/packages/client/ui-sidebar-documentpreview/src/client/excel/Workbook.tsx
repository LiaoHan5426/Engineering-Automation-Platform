/** One engine realm per mounted workbook; input cells never share mutable engine state. */
import { defineComponent, h, onScopeDispose, shallowRef, watch } from 'vue'
import type { Sheet } from '@fortune-sheet/core'
import { css, scripts } from 'luckysheet-preview:assets'

interface WorkbookEngine {
  create(options: Record<string, unknown>): void
  destroy(): void
  resize(): void
}
declare global { interface Window { luckysheet?: WorkbookEngine } }
interface WorkbookProps {
  readonly sheets: readonly Sheet[]
  readonly language: string
  readonly label: string
}

/** Display a parsed workbook in its own same-origin realm and release all engine resources on removal. */
export const Workbook = defineComponent((props: WorkbookProps) => {
  const frame = shallowRef<HTMLIFrameElement | null>(null)
  const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('')
  const documentSource = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'"></head><body><div id="workbook" style="position:absolute;inset:0"></div></body></html>`
  let dispose = () => {}
  const initialize = () => {
    dispose()
    const element = frame.value
    const doc = element?.contentDocument
    const realm = element?.contentWindow
    if (element === null || doc == null || realm == null) return
    const style = doc.createElement('style')
    style.textContent = `html,body{margin:0;width:100%;height:100%;overflow:hidden}${css}`
    doc.head.append(style)
    for (const source of scripts) {
      const script = doc.createElement('script')
      script.nonce = nonce
      script.textContent = source
      doc.head.append(script)
    }
    const engine = realm.luckysheet
    if (engine === undefined) throw new Error('Spreadsheet engine did not initialize')
    engine.create({
      container: 'workbook', data: structuredClone(props.sheets), lang: props.language,
      allowEdit: false, allowCopy: true, forceCalculation: false,
      showtoolbar: false, showinfobar: false, showstatisticBar: false, showsheetbar: true,
      sheetFormulaBar: true, enableAddRow: false, enableAddBackTop: false,
      showsheetbarConfig: { add: false, menu: false, sheet: true },
      cellRightClickConfig: { copy: true, copyAs: false, paste: false, insertRow: false, insertColumn: false, deleteRow: false, deleteColumn: false, deleteCell: false, hideRow: false, hideColumn: false, clear: false, matrix: false, sort: false, filter: false, chart: false, image: false, link: false, data: false, cellFormat: false },
    })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => engine.resize())
    observer?.observe(element)
    dispose = () => { observer?.disconnect(); engine.destroy(); doc.documentElement.replaceChildren() }
  }
  watch(() => [props.sheets, props.language], () => {
    dispose()
    dispose = () => {}
    // A fresh document also drops realm-owned listeners, timers, clipboard state, and storage adapters.
    if (frame.value !== null) frame.value.srcdoc = documentSource
  })
  onScopeDispose(() => dispose())
  return () => h('iframe', { ref: frame, srcdoc: documentSource, title: props.label, onLoad: initialize, style: { border: '0', width: '100%', height: '100%', display: 'block' } })
}, { name: 'Workbook', props: ["sheets","language","label"], inheritAttrs: false })
