/**
 * The text preview's body: a file's content, or the reason it is not showing.
 *
 * Two sources meet here. The standard `useResource` hook gives the file's
 * metadata — its version — and this type's
 * own store holds the content it read through its face. Metadata changes reload
 * the current preview while automatic refresh is enabled. A failed metadata frame — the file gone, its
 * workspace unknown — takes the same bar's place over the pages already loaded,
 * with the same reload. The type's controls, viewer choice, wrap and reload, sit at the end of
 * the path row; the Sidebar's strip carries none of them.
 *
 * Every state renders inside `PreviewFrame`, which places the workspace
 * navigator and its header toggle from the files Factories, in docked and
 * floating panes. Both render empty when unregistered and stay mounted across
 * loading states. A document layer handling Escape calls `preventDefault()` to
 * keep the navigator from also closing.
 */
import { computed, defineComponent, Fragment, h, ref, shallowRef, watch } from 'vue'

import clsx from 'clsx'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTypeIcon, IconNowrapFillRegular, IconPauseOutlineRegular, IconPlayOutlineRegular, IconRefreshOutlineRegular, IconWrapFillRegular, Menu, Tooltip, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { TextInjected } from './face.ts'
import { emptyFailureRecourse, failureLine } from './failure-line.ts'
import { LoadingIndicator } from './LoadingIndicator.tsx'
import { PreviewFrame } from './PreviewFrame.tsx'
import { hostFileOf } from './rpc.ts'
import type { TextStore } from './store.ts'
import type { DocumentContent } from './document/contract.ts'
import { binaryDocumentPath, matchingDocumentPreviews } from './document/registry.ts'
import type { DocumentPreviewDefinition } from './document/registry.ts'
import { unviewableBinaryPath } from './document/unviewable.ts'
import { PLAIN_BODY_ID } from './text/index.ts'
import { clearLineMark, loadedPages, lastLineLoaded, markLine, scrollToLine } from './text/lines.ts'
import css from './TextPreview.module.css'
export { linesOf, loadedPages, lastLineLoaded, scrollToLine } from './text/lines.ts'
export type { LoadedPage } from './text/lines.ts'
/** Private registration inputs; the framework binds the registry source to useDocumentPreviews. */
export interface TextPreviewInjected extends TextInjected {
  readonly hooks: {
    readonly documentPreviews: ObservableSnapshot<readonly DocumentPreviewDefinition[]>
  }
}
/** The body's composed props: the tab, its navigation, the shared store and face, and copy. */
export type TextPreviewProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsRenderSlots<'sidebar.right.tab.document' | 'sidebar.right.tab.document.action' | 'sidebar.right.tab.document.actions' | 'sidebar.right.tab.document.unpreviewable'> & PropsRenderFactories & PropsStore<TextStore> & InjectFace<TextPreviewInjected> & PropsLocale<'sidebarDocumentPreview'>
/**
 * The text type's body, registered under `sidebar.right.pane.tab` as `text`.
 * @param props - composed slot props.
 * @returns the content read so far with its controls, or a progress line.
 */
export const TextPreview = defineComponent((props: TextPreviewProps) => {
  const info = props.useTabInfo()
  const tab = computed(() => info.value.tab)
  const panel = computed(() => info.value.panel)
  const { getTriggerProps } = props.useContextMenu()
  const navigation = computed(() => tab.value.navigation)
  const signal = computed(() => tab.value.signal)
  const meta = props.useResource<'file'>(computed(() => tab.value.contentId))
  const canRead = computed(() => meta.value !== undefined && meta.value.status !== 'none')
  const file = computed(() => hostFileOf(tab.value.contentId))
  const tabId = tab.value.id
  const state = props.useStore(s => s.byTab[tabId])
  const definitions = props.useDocumentPreviews(value => value)
  const unviewable = computed(() => unviewableBinaryPath(file.value.path))
  const candidates = computed(() => {
    const matched = matchingDocumentPreviews(definitions.value, file.value.path)
    if (matched.length > 0 && binaryDocumentPath(definitions.value, file.value.path))
      return matched
    if (matched.length === 0 && unviewable.value)
      return matched
    const fallback = definitions.value.find(definition => definition.id === PLAIN_BODY_ID)
    return fallback === undefined ? matched : [...matched, fallback]
  })
  const selected = computed(() => candidates.value.find(candidate => candidate.id === state.value?.rendererId) ?? candidates.value[0])
  const mode = computed(() => selected.value?.loading)
  const contentRendererId = computed(() => mode.value === 'renderer' ? selected.value?.id : undefined)
  const current = computed(() => (state.value?.mode ?? 'text-pages') === mode.value && state.value?.contentRendererId === contentRendererId.value ? state.value : undefined)
  const add = (address: string) => {
    props.addResource(tab.value.id, address, signal.value)
  }
  const set = (addresses: readonly string[]) => {
    props.setResources(tab.value.id, [tab.value.contentId, ...addresses], signal.value)
  }
  watch(() => [set, selected.value?.id], () => {
    set([])
  }, { immediate: true, flush: 'post' })
  const bodyRef = shallowRef<HTMLDivElement | null>(null)
  const scrollportRef = shallowRef<HTMLElement | null>(null)
  const storedScrollTopRef = shallowRef(0)
  const menuOpen = ref(false)
  const absolutePath = computed(() => meta.value?.value?.absolutePath ?? current.value?.complete?.absolutePath)
  const displayPath = computed(() => absolutePath.value ?? file.value.path)
  // Contributions that hand the file to the Host wait for its Host path.
  const fileOwner = computed(() => absolutePath.value === undefined ? undefined : { absolutePath: absolutePath.value })
  // Every tab of this type is a `file` resource address, so its params are the
  // `file` type's; the union is narrowed on the one field read, not validated.
  const line = computed(() => navigation.value.params !== undefined && 'line' in navigation.value.params ? navigation.value.params.line : undefined)
  const pages = computed(() => current.value?.pages)
  const loaded = computed(() => loadedPages(pages.value ?? {}))
  const loadedThrough = computed(() => lastLineLoaded(loaded.value))
  const hasContent = computed(() => mode.value === 'renderer' ? current.value?.version !== undefined : loaded.value.length > 0 || current.value?.complete !== undefined)
  watch(() => state.value?.scrollTop, (value) => { storedScrollTopRef.value = value ?? 0 }, { immediate: true, flush: 'sync' })
  const bindBody = (body: HTMLDivElement | null): void => {
    const previous = bodyRef.value
    bodyRef.value = body
    if (scrollportRef.value === null || scrollportRef.value === previous)
      scrollportRef.value = body
  }
  const bindScrollport = (scrollport: HTMLElement | null): void => {
    const next = scrollport ?? bodyRef.value
    scrollportRef.value = next
    if (next !== null)
      next.scrollTop = storedScrollTopRef.value
  }
  // First mount reads the first page; a body coming back to a tab with content
  // reads nothing, because the store outlives the body.
  const started = computed(() => current.value !== undefined)
  watch(() => [started.value, tab.value.id, file.value, signal.value, props.loadPage, props.loadAll,
    props.prepareRenderer, canRead.value, mode.value, selected.value, meta.value?.value?.version], () => {
    if (started.value || !canRead.value || mode.value === undefined || selected.value === undefined)
      return
    if (mode.value === 'text-pages')
      props.loadPage(tab.value.id, file.value, 1, signal.value, meta.value?.value?.version)
    else if (mode.value === 'bytes-complete')
      props.loadAll(tab.value.id, file.value, signal.value, meta.value?.value?.version)
    else
      props.prepareRenderer(tab.value.id, signal.value, selected.value.id, meta.value?.value?.version)
  }, { immediate: true, flush: 'post' })
  watch(() => [scrollportRef.value, hasContent.value, selected.value?.id, pages.value, current.value?.revision], () => {
    const body = scrollportRef.value
    if (!hasContent.value || body === null || state.value === undefined)
      return
    if (mode.value === 'text-pages' && line.value !== undefined && current.value?.revision !== navigation.value.revision)
      return
    body.scrollTop = Math.max(body.scrollTop, state.value.scrollTop)
    if (mode.value === 'text-pages' && body.scrollTop + 1 < state.value.scrollTop && current.value !== undefined
            && !current.value.eof && !current.value.loading && current.value.failure === undefined && canRead.value) {
      props.loadPage(tab.value.id, file.value, loadedThrough.value + 1, signal.value, meta.value?.value?.version)
    }
  }, { immediate: true, flush: 'post' })
  watch(() => [
    scrollportRef.value,
    navigation.value.revision,
    line.value,
    loadedThrough.value,
    current.value?.eof, current.value?.loading, current.value?.failure,
    started.value,
    selected.value?.id,
    mode.value,
    file.value,
    canRead.value,
    meta.value?.value?.version,
  ], () => {
    const body = scrollportRef.value
    if (current.value === undefined || body === null || current.value.revision === navigation.value.revision)
      return
    if (line.value === undefined || mode.value !== 'text-pages' || selected.value?.sourceLines !== true) {
      props.actions.navigated(tab.value.id, navigation.value.revision)
      return
    }
    if (line.value > loadedThrough.value && !current.value.eof) {
      if (!current.value.loading && current.value.failure === undefined && canRead.value) {
        props.loadPage(tab.value.id, file.value, loadedThrough.value + 1, signal.value, meta.value?.value?.version)
      }
      return
    }
    const row = scrollToLine(body, line.value)
    if (row === undefined && line.value <= loadedThrough.value)
      return
    if (row !== undefined)
      markLine(body, row, line.value)
    props.actions.navigated(tab.value.id, navigation.value.revision)
    // Recorded here as well as by the scroll event, so the store holds the
    // landing before any later navigation reads it.
    props.actions.scrolled(tab.value.id, body.scrollTop)
  }, { immediate: true, flush: 'post' })
  const rendererReload = (): void => {
    if (canRead.value && selected.value !== undefined)
      props.prepareRenderer(tab.value.id, signal.value, selected.value.id, meta.value?.value?.version, true)
  }
  const observedVersion = computed(() => meta.value?.value?.version)
  const changed = computed(() => (current.value?.version !== undefined && observedVersion.value !== undefined
        && observedVersion.value !== current.value.version && observedVersion.value !== current.value.observedVersion)
        || state.value?.resourcesDirty === true)
  const reload = (): void => {
    if (!canRead.value)
      return
    if (mode.value === 'text-pages')
      props.reloadPages(tab.value.id, file.value, signal.value, observedVersion.value)
    else if (mode.value === 'bytes-complete')
      props.reloadAll(tab.value.id, file.value, signal.value, observedVersion.value)
    else
      rendererReload()
  }
  watch(() => [tab.value.actions, reload], (_, _previous, onCleanup) => {
    onCleanup(tab.value.actions.bindCommands({ refresh: reload }))
  }, { immediate: true, flush: 'post' })
  watch(() => [state.value?.autoRefresh, changed.value, current.value?.loading, meta.value?.status, reload], () => {
    if (state.value?.autoRefresh && changed.value && current.value !== undefined && !current.value.loading && meta.value?.status === 'live')
      reload()
  }, { immediate: true, flush: 'post' })
  const content = computed((): DocumentContent | undefined => {
    if (mode.value === 'renderer') {
      if (current.value === undefined)
        return undefined
      const revision = current.value.loadRevision
      return { kind: 'renderer', revision, reload: rendererReload,
        failed: () => { props.actions.rendererFailed(tab.value.id, revision) },
        loaded: (version) => { props.actions.rendered(tab.value.id, revision, version) } }
    }
    if (mode.value === 'bytes-complete') {
      return current.value?.complete === undefined ? undefined : {
        kind: 'bytes', data: current.value.complete.data,
      }
    }
    if (current.value === undefined || loaded.value.length === 0)
      return undefined
    return { kind: 'text', pages: loaded.value, text: loaded.value.filter(page => page.lines > 0).map(page => page.text).join('\n'), eof: current.value.eof }
  })
  return () => {
    const stateSnapshot = state.value
    const frame = {
      path: displayPath.value,
      pathTrigger: getTriggerProps({ kind: 'file', value: { sessionId: props.sessionId, path: displayPath.value, paneId: panel.value.id, ...(line.value === undefined ? {} : { line: line.value }) } }),
      useTabInfo: props.useTabInfo,
      renderFactorySlot: props.renderFactorySlot,
    }
    const handoff = fileOwner.value !== undefined && props.renderSlot('sidebar.right.tab.document.actions', fileOwner.value)
    // A known binary suffix with no matching renderer never reads: no plain-text
    // fallback, no viewer control, only the path, the unsupported line, and the
    // contributions that hand the file to the Host.
    if (selected.value === undefined && unviewable.value) {
      const { name: unsupportedName } = pathPartsOf(displayPath.value)
      return (h(PreviewFrame, {
        ...frame,
        'handoff': handoff,
        'data-textpreview-state': 'unsupported',
        'data-textpreview-url': tab.value.contentId,
        children: [
          h('div', {
            'class': css.body,
            'data-textpreview-body': '',
          }, [
            h('div', {
              'class': css.empty,
              'data-textpreview-unsupported': '',
            }, [
              h(FileTypeIcon, {
                'kind': classifyFileType(unsupportedName),
                'size': 36,
                'className': css.emptyIcon,
              }),
              h('p', {
                'class': css.emptyLine,
              }, [
                props.t('unsupportedFile'),
              ]),
              fileOwner.value !== undefined && props.renderSlot('sidebar.right.tab.document.unpreviewable', fileOwner.value),
            ]),
          ]),
        ],
      }))
    }
    if (stateSnapshot === undefined || selected.value === undefined) {
      return (h(PreviewFrame, {
        ...frame,
        'handoff': handoff,
        'data-textpreview-state': 'loading',
        children: [
          h('div', {
            'class': css.status,
          }, [
            meta.value?.status === 'none'
              ? h('p', {
                'class': css.statusLine,
              }, [
                props.t('resourceUnavailable'),
              ]) : h(LoadingIndicator, {
                'label': props.t('loading'),
              }),
          ]),
        ],
      }))
    }
    const next = loadedThrough.value + 1
    const { name } = pathPartsOf(displayPath.value)
    const loadNext = (): void => {
      if (!canRead.value || current.value?.loading || current.value?.eof)
        return
      props.loadPage(tab.value.id, file.value, next, signal.value, meta.value?.value?.version)
    }
    return (h(PreviewFrame, {
      ...frame,
      'data-textpreview-state': 'text',
      'data-textpreview-url': tab.value.contentId,
      'data-document-preview': selected.value.id,
      'banner': meta.value?.failure !== undefined && hasContent.value
        ? (h('p', {
          'class': css.changed,
          'data-textpreview-meta-failed': meta.value.failure.code,
        }, [
          h('span', {}, [
            failureLine(props.t, meta.value.failure),
          ]),
          h('button', {
            'type': 'button',
            'class': css.action,
            'data-textpreview-reload-now': '',
            'onClick': reload,
          }, [
            props.t('reloadNow'),
          ]),
        ]))
        : changed.value && (h('p', {
          'class': css.changed,
          'data-textpreview-changed': '',
        }, [
          h('span', {}, [
            props.t('changed'),
          ]),
          h('button', {
            'type': 'button',
            'class': css.action,
            'data-textpreview-reload-now': '',
            'onClick': reload,
          }, [
            props.t('reloadNow'),
          ]),
        ])),
      'tools': (h(Fragment, {}, [
        candidates.value.length > 1
                    && (h(Menu, {
                      'open': menuOpen.value,
                      'items': candidates.value.map(candidate => ({ id: candidate.id, label: candidate.title() })),
                      'selectedId': selected.value.id,
                      'onSelect': (id: string) => { props.actions.selected(tab.value.id, id); menuOpen.value = false },
                      'onClose': () => { menuOpen.value = false },
                      'align': 'end',
                      'portal': true,
                      'dense': true,
                    }, { anchor: () => h('button', {
                      type: 'button', class: clsx(css.tool, css.viewerTool),
                      'aria-label': props.t('openWith'), title: selected.value?.title(),
                      'data-document-viewer-menu': '', onClick: () => { menuOpen.value = !menuOpen.value },
                    }, selected.value?.title()) })),
        selected.value.wrap === true && (h(Tooltip, {
          'label': props.t(stateSnapshot.wrap ? 'wrap.disable' : 'wrap.enable'),
          'side': 'bottom',
          'delayMs': 500,
        }, {
          default: () => [
            h('button', {
              'type': 'button',
              'class': css.tool,
              'aria-pressed': stateSnapshot.wrap,
              'aria-label': props.t('wrap.aria'),
              'data-textpreview-tool': 'wrap',
              'onClick': () => {
                props.actions.toggledWrap(tab.value.id)
                // Wrapping reflows the lines under a line mark without resizing its scrollport.
                const body = scrollportRef.value
                /* v8 ignore next -- callback refs bind the scrollport during commit, before user input. */
                if (body !== null)
                  clearLineMark(body)
              },
            }, [
              stateSnapshot.wrap ? h(IconNowrapFillRegular, {}) : h(IconWrapFillRegular, {}),
            ]),
          ],
        })),
        content.value !== undefined && props.renderSlot('sidebar.right.tab.document.action', { content: content.value }, { entryKey: selected.value.id, hookContext: props.useTabInfo }),
        h('span', {
          'hidden': true,
        }, [
          h(Tooltip, {
            'label': props.t(stateSnapshot.autoRefresh ? 'autoRefresh.disable' : 'autoRefresh.enable'),
            'side': 'bottom',
            'delayMs': 500,
          }, {
            default: () => [
              h('button', {
                'type': 'button',
                'class': css.tool,
                'aria-label': props.t('autoRefresh'),
                'aria-pressed': stateSnapshot.autoRefresh,
                'data-textpreview-tool': 'auto-refresh',
                'onClick': () => { props.actions.toggledAutoRefresh(tab.value.id) },
              }, [
                stateSnapshot.autoRefresh ? h(IconPauseOutlineRegular, {}) : h(IconPlayOutlineRegular, {}),
              ]),
            ],
          }),
        ]),
        h(Tooltip, {
          'label': props.t('reload'),
          ...(tab.value.refreshShortcut?.keys === undefined ? {} : { shortcutKeys: tab.value.refreshShortcut.keys }),
          'side': 'bottom',
          'delayMs': 500,
        }, {
          default: () => [
            h('button', {
              'type': 'button',
              'class': css.tool,
              'aria-label': props.t('reload'),
              'data-textpreview-tool': 'reload',
              'aria-keyshortcuts': tab.value.refreshShortcut?.aria,
              'onClick': reload,
            }, [
              h(IconRefreshOutlineRegular, {}),
            ]),
          ],
        }),
      ])),
      'handoff': handoff,
      children: [
        h('div', {
          'ref': (element) => { bindBody(element instanceof HTMLDivElement ? element : null) },
          'class': clsx(css.body, stateSnapshot.wrap && css.wrap),
          'data-textpreview-body': '',
          'data-textpreview-wrap': stateSnapshot.wrap ? '' : undefined,
          'onScrollCapture': (event: Event) => {
            const body = scrollportRef.value
            /* v8 ignore next -- callback refs bind the scrollport during commit, before user input. */
            if (body === null)
              return
            if (event.target !== body)
              return
            // Shorter or emptied content pins the body to its end below the remembered
            // offset; that clamp is layout, not the reader, so the offset survives it.
            const clamped = body.scrollTop >= body.scrollHeight - body.clientHeight - 1
                            && body.scrollTop < stateSnapshot.scrollTop
            if (!clamped)
              props.actions.scrolled(tab.value.id, body.scrollTop)
            if (mode.value === 'text-pages' && current.value?.failure === undefined && body.clientHeight > 0
                            && body.scrollTop + body.clientHeight >= body.scrollHeight - 1)
              loadNext()
          },
        }, [
          mode.value !== 'renderer' && !hasContent.value && current.value?.failure === undefined && (h(LoadingIndicator, {
            'label': props.t('loading'),
          })),
          content.value !== undefined && props.renderSlot('sidebar.right.tab.document', {
            resourceAddress: tab.value.contentId,
            content: content.value,
            wrap: stateSnapshot.wrap, scrollportRef: bindScrollport,
            addResource: add, setResources: set,
          }, {
            entryKey: selected.value.id, hookContext: props.useTabInfo,
            fallback: h('p', {
              'class': css.statusLine,
            }, [
              props.t('rendererUnavailable', { name: selected.value.title() }),
            ]),
          }),
          current.value?.failure !== undefined && (hasContent.value ? (h('p', {
            'class': css.statusLine,
            'data-textpreview-failed': current.value.failure.code,
          }, [
            h('span', {}, [
              failureLine(props.t, current.value.failure),
            ]),
            h('button', {
              'type': 'button',
              'class': css.action,
              'data-textpreview-retry': '',
              'onClick': loadNext,
            }, [
              props.t('retry'),
            ]),
          ]))
            : (h('div', {
              'class': css.empty,
              'data-textpreview-failed': current.value.failure.code,
            }, [
              h(FileTypeIcon, {
                'kind': classifyFileType(name),
                'size': 36,
                'className': css.emptyIcon,
              }),
              h('p', {
                'class': css.emptyLine,
              }, [
                failureLine(props.t, current.value.failure),
              ]),
              emptyFailureRecourse(current.value.failure) === 'open' && fileOwner.value !== undefined
                                && props.renderSlot('sidebar.right.tab.document.unpreviewable', fileOwner.value),
              emptyFailureRecourse(current.value.failure) === 'retry' && (h('button', {
                'type': 'button',
                'class': css.retry,
                'data-textpreview-retry': '',
                'onClick': reload,
              }, [
                h(IconRefreshOutlineRegular, {
                  'size': 14,
                }),
                props.t('retry'),
              ])),
            ]))),
          mode.value === 'text-pages' && current.value !== undefined && loaded.value.length > 0 && !current.value.eof && current.value.failure === undefined && (h('button', {
            'type': 'button',
            'class': css.more,
            'disabled': current.value.loading,
            'data-textpreview-more': '',
            'onClick': loadNext,
          }, [
            current.value.loading ? h(LoadingIndicator, {
              'inline': true,
              'label': props.t('loading'),
            }) : props.t('loadMore'),
          ])),
        ]),
      ],
    }))
  }
}, { name: 'TextPreview', inheritAttrs: false, props: ['useTabInfo','useSession','sessionId','useProjection','useAccess','useConversation','useInput','inputActions','useRemoteAccess','useSessions','useSessionRetainInfo','useSessionAccess','usePanelInfo','useContextMenu','useResource','useWorkspaces','renderSlot','__renders','SessionProvider','renderFactorySlot','useStore','actions','addResource','setResources','loadPage','reloadPages','loadAll','reloadAll','prepareRenderer','useDocumentPreviews','t'] })
