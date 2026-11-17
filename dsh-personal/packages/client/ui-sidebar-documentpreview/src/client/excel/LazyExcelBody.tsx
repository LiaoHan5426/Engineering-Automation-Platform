/** Load the spreadsheet renderer only when a supported workbook is opened. */
import { defineAsyncComponent, defineComponent, h, Suspense, type VNodeChild } from 'vue'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { excelFormat, type ExcelFormat } from './format.ts'
import type { ExcelLimits } from './model.ts'
import { hostFileOf } from '../rpc.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'

/** Document input plus parser limits and localized copy. */
export type ExcelBodyProps = DocumentPreviewProps & PropsLocale<'sidebarExcel'> & { readonly limits: ExcelLimits }

/** Lazily loaded renderer input with the parser choice and main-bundle loading content. */
export type LoadedExcelBodyProps = ExcelBodyProps & { readonly format: ExcelFormat; readonly loading: VNodeChild }

const LoadedExcelBody = defineAsyncComponent(async () => (await import('./excel.tsx')).ExcelBody)

/**
 * Load the browser spreadsheet renderer for every registered format.
 * @param props - Complete file bytes and standard document seats.
 * @returns Localized loading state or Excel preview.
 */
export const LazyExcelBody = defineComponent((props: ExcelBodyProps) => () => {
  const format = excelFormat(hostFileOf(props.resourceAddress).path)
  const loading = h(LoadingIndicator, { label: props.t('loading') })
  return h(Suspense, null, { default: () => h(LoadedExcelBody, { ...props, format, loading }), fallback: () => loading })
}, { name: 'LazyExcelBody', inheritAttrs: false, props: ['addResource','setResources','resourceAddress','content','wrap','scrollportRef','useTabInfo','useSession','sessionId','useProjection','useAccess','useConversation','useInput','inputActions','useRemoteAccess','useSessions','useSessionRetainInfo','useSessionAccess','usePanelInfo','useContextMenu','useResource','useWorkspaces','t','limits'] })
