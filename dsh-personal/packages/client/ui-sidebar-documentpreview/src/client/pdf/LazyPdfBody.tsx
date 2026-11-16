/** Load the PDF renderer only after a PDF body is mounted. */
import { defineAsyncComponent, defineComponent, h, Suspense } from 'vue'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import type { PdfBodyProps } from './pdf.tsx'

const LoadedPdfBody = defineAsyncComponent(() => import('./pdf.tsx').then(module => module.PdfBody))

/** Mount the package-local PDF renderer with its localized loading view. */
export const LazyPdfBody = defineComponent((props: PdfBodyProps) => () => {
  const loading = h(LoadingIndicator, { label: props.t('loading') })
  return h(Suspense, null, { default: () => h(LoadedPdfBody, { ...props, loading }), fallback: () => loading })
}, { name: 'LazyPdfBody', inheritAttrs: false, props: ["addResource","setResources","resourceAddress","content","wrap","scrollportRef","useTabInfo","useSession","sessionId","useProjection","useAccess","useConversation","useInput","inputActions","useRemoteAccess","useSessions","useSessionRetainInfo","useSessionAccess","usePanelInfo","useContextMenu","useResource","useWorkspaces","t","useStore","actions","retainTab","ZoomViewport","zoomSurfaceClass"] })
