/** Read-only spreadsheet surface backed by browser-parsed workbook data. */
import { computed, defineComponent, h, ref, shallowRef, watch } from 'vue'
import { Button, IconWarningTriangleOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ExcelFormat } from './format.ts'
import type { ExcelPreview } from './model.ts'
import type { LoadedExcelBodyProps } from './LazyExcelBody.tsx'
import { parseExcel } from './parse.ts'
import { Workbook } from './Workbook.tsx'
import css from './ExcelBody.module.css'

type State = { data: Uint8Array<ArrayBuffer>; format: ExcelFormat } & ({ value: ExcelPreview } | { error: string })

/**
 * Display stored spreadsheet values and formats without editing or recalculation.
 * @param props - Complete workbook bytes, limits, and locale.
 * @returns An isolated spreadsheet surface with cancellable loading.
 */
export const ExcelBody = defineComponent((props: LoadedExcelBodyProps) => {
  const data = computed(() => props.content.kind === 'bytes' ? props.content.data : undefined)
  const state = shallowRef<State>()
  const attempt = ref(0)
  watch(() => [data.value, props.format, props.limits, attempt.value], (_next, _previous, onCleanup) => {
    const bytes = data.value
    if (bytes === undefined) return
    const controller = new AbortController()
    state.value = undefined
    void parseExcel(bytes, props.format, props.limits, controller.signal).then(
      value => { if (!controller.signal.aborted) state.value = { data: bytes, format: props.format, value } },
      (error: unknown) => { if (!controller.signal.aborted) state.value = { data: bytes, format: props.format, error: error instanceof Error ? error.message : 'invalid' } },
    )
    onCleanup(() => controller.abort())
  }, { immediate: true })
  return () => {
    const current = state.value
    if (data.value === undefined) return h('p', { class: css.status, role: 'alert' }, props.t('invalid'))
    if (current?.data !== data.value || current.format !== props.format) return props.loading
    if ('error' in current) return h('div', { class: css.status, role: 'alert' }, [
      h('span', props.t(current.error === 'tooLarge' || current.error === 'timeout' || current.error === 'encoding' ? current.error : 'invalid')),
      h(Button, { size: 'sm', onClick: () => { attempt.value++ } }, { default: () => props.t('retry') }),
    ])
    const hasFormulas = current.value.sheets.some(sheet => sheet.celldata?.some(cell => cell.v?.f !== undefined))
    return h('section', { class: css.body, 'data-excel-preview': '', 'aria-label': props.t('title') }, [
      current.value.unsupportedFeatures.length > 0 ? h('div', { class: css.notice, role: 'note', 'data-excel-unsupported-notice': '' }, [
        h(IconWarningTriangleOutlineRegular, { size: 16 }),
        h('span', props.t('unsupportedNotice', { features: current.value.unsupportedFeatures.map(feature => props.t(feature)).join(props.t('featureSeparator')) })),
      ]) : null,
      h('div', { class: `${css.workbook} ${hasFormulas ? css.withFormulaWarning : ''}` }, [
        hasFormulas ? h(Tooltip, { portal: true, openOnClick: true, label: props.t('formulaWarning'), side: 'bottom', delayMs: 500 }, { default: () => h('button', { type: 'button', class: css.formulaWarning, 'aria-label': props.t('formulaWarning'), 'data-excel-formula-warning': '' }, [h(IconWarningTriangleOutlineRegular, { size: 14 })]) }) : null,
        h(Workbook, { key: `${attempt.value}:${props.t('language')}`, sheets: current.value.sheets, language: props.t('language'), label: props.t('title') }),
      ]),
    ])
  }
}, { name: 'ExcelBody', props: ["addResource","setResources","resourceAddress","content","wrap","scrollportRef","useTabInfo","useSession","sessionId","useProjection","useAccess","useConversation","useInput","inputActions","useRemoteAccess","useSessions","useSessionRetainInfo","useSessionAccess","usePanelInfo","useContextMenu","useResource","useWorkspaces","t","limits","format","loading"], inheritAttrs: false })
