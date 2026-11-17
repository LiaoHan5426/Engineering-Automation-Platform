import clsx from 'clsx'
import { defineComponent, h, Fragment, shallowRef, computed, watch, onScopeDispose, useId, type CSSProperties, type VNode, type VNodeChild } from 'vue'
import { IconCheckOutlineRegular, IconCopyOutlineRegular, IconWrapLinesOutlineRegular } from './icons/index.tsx'
import { Menu } from './Menu.tsx'
import type { MenuEntry } from './Menu.tsx'
import css from './JsonTree.module.css'
const OBJECT_PREVIEW_LIMIT = 4
const ARRAY_PREVIEW_LIMIT = 5
const PREVIEW_DEPTH_LIMIT = 2
/**
 * Display copy for the tree's copy affordance; the owner passes localized
 * labels (this package is cordis-free, so copy arrives via props).
 */
export interface JsonTreeLabels {
  /** Menu item: copy the raw primitive value. */
  copyValue: string
  /** Menu item: copy the value as compact JSON (primitive rows). */
  copyJson: string
  /** Menu item: copy the property path. */
  copyPath: string
  /** Menu item: copy the value as pretty-printed JSON. */
  copyPrettyJson: string
  /** Menu item: copy the value as compact JSON (object rows). */
  copyCompactJson: string
  /** Copy-button state label after a successful copy. */
  copied: string
  /** Copy-button state label after a failed copy. */
  copyFailed: string
  /** Expander aria label while expanded.value. */
  collapseNode: string
  /** Expander aria label while collapsed. */
  expandNode: string
  /** Copy-button tooltip, given the current action label. */
  copyButtonTitle: (action: string) => string
}
function valueCopyMenuItems(labels: JsonTreeLabels): readonly MenuEntry[] {
  return [
    { id: 'value', label: labels.copyValue },
    { id: 'json', label: labels.copyJson },
    { id: 'path', label: labels.copyPath },
  ]
}
function objectCopyMenuItems(labels: JsonTreeLabels): readonly MenuEntry[] {
  return [
    { id: 'prettyJson', label: labels.copyPrettyJson },
    { id: 'json', label: labels.copyCompactJson },
    { id: 'path', label: labels.copyPath },
  ]
}
type JsonPath = readonly (number | string)[]
interface RowTarget {
  path: JsonPath
  value: unknown
}
type CopyMode = 'json' | 'path' | 'prettyJson' | 'value'
interface CopySnapshot {
  id: string
  target: RowTarget
  state: 'idle' | 'copied' | 'failed'
  menuOpen: boolean
}
/** Notify only the old and new row actions; JSON values do not subscribe to hover state. */
function createCopyStore() {
  let current: CopySnapshot | undefined
  const listeners = new Map<string, Set<() => void>>()
  return {
    get: () => current,
    set(next: CopySnapshot | undefined) {
      const previous = current?.id
      current = next
      for (const id of new Set([previous, next?.id])) {
        if (id === undefined)
          continue
        for (const listener of listeners.get(id) ?? [])
          listener()
      }
    },
    subscribe(id: string, listener: () => void) {
      let row = listeners.get(id)
      if (row === undefined)
        listeners.set(id, row = new Set())
      row.add(listener)
      return () => {
        row.delete(listener)
        if (row.size === 0)
          listeners.delete(id)
      }
    },
  }
}
const JsonCopyAction = defineComponent((props: {
  store: ReturnType<typeof createCopyStore>
  target: RowTarget
  persistent: boolean
  labels: JsonTreeLabels
  onCopy: (target: RowTarget, mode: CopyMode) => Promise<void>
  onClose: () => void
}) => {
  ;
  const snapshot = shallowRef<CopySnapshot | undefined>()
  watch([() => props.store, () => pathId(props.target.path)], (_, __, onCleanup) => {
    const id = pathId(props.target.path)
    const update = () => { const current = props.store.get(); snapshot.value = current?.id === id ? current : undefined }
    update()
    onCleanup(props.store.subscribe(id, update))
  }, { immediate: true })
  const buttonRef = shallowRef<HTMLButtonElement | null>(null)
  return () => {
    const { store, target, persistent, labels, onCopy, onClose } = props
    const id = pathId(target.path)
    const state = snapshot.value?.state ?? 'idle'
    const object = typeof target.value === 'object' && target.value !== null
    const copyTitle = state === 'copied'
      ? labels.copied
      : state === 'failed'
        ? labels.copyFailed
        : object ? labels.copyPrettyJson : labels.copyValue
    return (h('span', { 'class': css.copySlot }, [(persistent || snapshot.value !== undefined) && (h(Menu, { 'open': snapshot.value?.menuOpen === true, 'compact': true, 'portal': true, 'align': 'end',
      'items': object ? objectCopyMenuItems(labels) : valueCopyMenuItems(labels), 'onSelect': (mode) => {
        void onCopy(target, mode as CopyMode)
      }, 'onClose': onClose, 'anchorRef': buttonRef }, { anchor: () => (h('button', { 'ref': buttonRef, 'type': 'button', 'class': css.actionButton, 'data-json-copy-button': true, 'data-state': state, 'aria-label': copyTitle, 'title': labels.copyButtonTitle(copyTitle), 'onClick': () => void onCopy(target, object ? 'prettyJson' : 'value'), 'onContextmenu': (event) => {
      event.preventDefault()
      event.stopPropagation()
      store.set({ id, target, state, menuOpen: true })
    } }, [state === 'copied'
      ? h(IconCheckOutlineRegular, { 'size': 12 }, undefined) : h(IconCopyOutlineRegular, { 'size': 12 }, undefined)])) }))]))
  }
}, { props: ['store', 'target', 'persistent', 'labels', 'onCopy', 'onClose'] })
function isExpandableValue(value: unknown): value is object | unknown[] {
  return typeof value === 'object' && value !== null && !(value instanceof Date)
}
function entriesOf(value: object | unknown[]): readonly (readonly [
  string,
  unknown,
])[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item] as const)
  }
  return Object.keys(value).map(key => [
    key,
    (value as Record<string, unknown>)[key],
  ] as const)
}
function bracketOf(value: object | unknown[]): readonly [
  string,
  string,
] {
  return Array.isArray(value) ? ['[', ']'] : ['{', '}']
}
function previewPrimitive(value: unknown): VNodeChild {
  if (value === null)
    return h('span', { 'class': css.keywordValue }, ['null'])
  if (typeof value === 'string') {
    return h('span', { 'class': css.stringValue }, [JSON.stringify(value)])
  }
  if (typeof value === 'number') {
    return h('span', { 'class': css.numberValue }, [String(value)])
  }
  if (typeof value === 'boolean') {
    return h('span', { 'class': css.keywordValue }, [String(value)])
  }
  if (typeof value === 'bigint') {
    return h('span', { 'class': css.otherValue }, [value.toString()])
  }
  if (typeof value === 'undefined') {
    return h('span', { 'class': css.otherValue }, ['undefined'])
  }
  if (typeof value === 'symbol') {
    return h('span', { 'class': css.otherValue }, [value.description ?? 'Symbol'])
  }
  if (typeof value === 'function') {
    return h('span', { 'class': css.otherValue }, [value.name || 'Function'])
  }
  return null
}
function previewValue(value: unknown, depth: number): VNodeChild {
  if (!isExpandableValue(value))
    return previewPrimitive(value)
  const array = Array.isArray(value)
  const entries = entriesOf(value)
  const limit = array ? ARRAY_PREVIEW_LIMIT : OBJECT_PREVIEW_LIMIT
  const visible = entries.slice(0, limit)
  const [open, close] = bracketOf(value)
  return (h(Fragment, null, [h('span', { 'class': css.punctuation }, [open]), depth >= PREVIEW_DEPTH_LIMIT
    ? h('span', { 'class': css.previewEllipsis }, ['\u2026']) : visible.map(([key, item], index) => (h('span', { 'key': key }, [index > 0 && h('span', { 'class': css.punctuation }, [', ']), !array && (h(Fragment, null, [h('span', { 'class': css.previewProperty }, [key]), h('span', { 'class': css.punctuation }, [': '])])), previewValue(item, depth + 1)]))), depth < PREVIEW_DEPTH_LIMIT && entries.length > limit && (h('span', { 'class': css.previewEllipsis }, [', \u2026'])), h('span', { 'class': css.punctuation }, [close])]))
}
function primitiveValue(value: unknown): VNodeChild {
  if (value === null)
    return h('span', { 'class': css.keywordValue }, ['null'])
  if (typeof value === 'string') {
    return h('span', { 'class': css.stringValue }, [JSON.stringify(value)])
  }
  if (typeof value === 'boolean') {
    return h('span', { 'class': css.keywordValue }, [String(value)])
  }
  if (typeof value === 'number') {
    return h('span', { 'class': css.numberValue }, [String(value)])
  }
  if (typeof value === 'bigint') {
    return h('span', { 'class': css.numberValue }, [`${value.toString()}n`])
  }
  if (value instanceof Date) {
    return h('span', { 'class': css.otherValue }, [value.toISOString()])
  }
  if (typeof value === 'function') {
    return h('span', { 'class': css.otherValue }, ['function() ', '{ }'])
  }
  if (typeof value === 'undefined') {
    return h('span', { 'class': css.otherValue }, ['undefined'])
  }
  return h('span', { 'class': css.otherValue }, [(value as symbol).toString()])
}
function fieldText(field: string): string {
  return field === '' ? '""' : field
}
function pathId(path: JsonPath): string {
  return path.map(part => (typeof part === 'number' ? `n${String(part)}` : `s${String(part.length)}:${part}`)).join('/')
}
function claimFocus(button: HTMLElement): void {
  button.focus()
}
function moveFocus(button: HTMLElement, direction: -1 | 1): void {
  const tree = button.closest<HTMLElement>('[role="tree"]')
  /* v8 ignore next -- JsonTree attaches expander handlers only beneath its owning role=tree. */
  if (tree === null)
    return
  const expanders = Array.from(tree.querySelectorAll<HTMLElement>('[data-json-expander]'))
  const current = expanders.indexOf(button)
  /* v8 ignore next -- the current expander is a member of the queried non-empty set. */
  if (current < 0 || expanders.length === 0)
    return
  const next = (current + direction + expanders.length) % expanders.length
  const nextExpander = expanders[next]
  /* v8 ignore next -- modulo over the non-empty expander set always resolves a member. */
  if (nextExpander !== undefined)
    claimFocus(nextExpander)
}
function NodeField({ field, expandable, onToggle }: {
  field: string | undefined
  expandable: boolean
  onToggle: () => void
}) {
  if (field === undefined)
    return null
  return (h('span', { 'class': clsx(css.label, expandable && css.clickableLabel), 'onClick': expandable ? onToggle : undefined }, [fieldText(field), ':']))
}
interface JsonTreeNodeProps {
  collapsedStringLines: number
  stringWrapping: JsonTreeProps['stringWrapping']
  field?: string
  initialExpanded: boolean
  labels: JsonTreeLabels
  lastElement: boolean
  onClaimTabStop: (id: string) => void
  onRowHover: (row: HTMLElement, target: RowTarget) => void
  path: JsonPath
  renderCopy: ((target: RowTarget, persistent?: boolean) => VNodeChild) | undefined
  tabStopId: string | null
  value: unknown
}
const JsonString = defineComponent((props: {
  collapsedStringLines: number
  stringWrapping: JsonTreeProps['stringWrapping']
  field: string | undefined
  labels: JsonTreeLabels
  lastElement: boolean
  renderCopy: ((persistent?: boolean) => VNodeChild) | undefined
  value: string
}) => {
  const contentsId = useId()
  const contentRef = shallowRef<HTMLSpanElement | null>(null)
  const rawRef = shallowRef<HTMLPreElement | null>(null)
  const expanded = shallowRef(false)
  const wrapped = shallowRef(false)
  const truncated = shallowRef(false)
  watch([() => props.collapsedStringLines, () => expanded.value, () => props.field, () => props.lastElement, () =>
    props.value, contentRef, rawRef], (_, __, onCleanup) => {
    const dispose = (() => {
      const { collapsedStringLines } = props
      if (expanded.value)
        return
      const content = contentRef.value
      if (content === null)
        return
      const measure = () => {
        const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight)
        truncated.value = content.scrollHeight > lineHeight * collapsedStringLines
      }
      measure()
      if (typeof ResizeObserver === 'undefined')
        return
      const observer = new ResizeObserver(measure)
      observer.observe(content)
      return () => { observer.disconnect() }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  watch([() => expanded.value, () => props.value, contentRef, rawRef], (_, __, onCleanup) => {
    const dispose = (() => {
      if (!expanded.value)
        return
      const raw = rawRef.value
      if (raw === null)
        return
      // Keep raw text within the window and clipping ancestors outside the tree.
      // Capture scrolling because an ancestor can move the string without resizing it.
      const clips: HTMLElement[] = []
      const tree = raw.closest<HTMLElement>(`.${css.root}`) as HTMLElement
      for (let parent = tree.parentElement; parent !== null; parent = parent.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY))
          clips.push(parent)
      }
      const measure = () => {
        let top = 0
        let bottom = window.innerHeight
        for (const clip of clips) {
          const rect = clip.getBoundingClientRect()
          const style = getComputedStyle(clip)
          top = Math.max(top, rect.top + clip.clientTop)
          bottom = Math.min(bottom, rect.top + clip.clientTop + clip.clientHeight
                        - Number.parseFloat(style.paddingBottom))
        }
        const available = bottom - Math.max(top, raw.getBoundingClientRect().top)
        raw.style.maxHeight = `${Math.max(16, available - 4)}px`
      }
      measure()
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
      observer?.observe(raw)
      for (const clip of clips)
        observer?.observe(clip)
      window.addEventListener('resize', measure)
      window.addEventListener('scroll', measure, true)
      return () => {
        observer?.disconnect()
        window.removeEventListener('resize', measure)
        window.removeEventListener('scroll', measure, true)
      }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  return () => {
    const { stringWrapping, field, labels, lastElement, renderCopy, value } = props
    if (expanded.value) {
      const fieldId = `${contentsId}-field`
      return (h('div', { 'class': css.stringField, 'data-expanded': true }, [field !== undefined && h('span', { 'id': fieldId, 'class': css.label }, [fieldText(field), ':']), h('pre', { 'ref': rawRef, 'id': contentsId, 'class': css.stringRaw, 'data-wrap': wrapped.value, 'tabIndex': 0, 'aria-labelledby': field === undefined ? undefined : fieldId }, [value]), !lastElement && h('span', { 'class': css.punctuation }, [',']), h('div', { 'class': css.stringActions }, [stringWrapping !== undefined && (h('button', { 'type': 'button', 'class': css.actionButton, 'aria-label': stringWrapping.label, 'title': stringWrapping.label, 'aria-pressed': wrapped.value, 'aria-controls': contentsId, 'onClick': () => {
        const next = !wrapped.value
        wrapped.value = next
        stringWrapping.setDefault(next)
      } }, [h(IconWrapLinesOutlineRegular, { 'size': 12 }, undefined)])), h('button', { 'type': 'button', 'class': css.actionButton, 'aria-label': labels.collapseNode, 'title': labels.collapseNode, 'aria-expanded': true, 'aria-controls': contentsId, 'onClick': () => { expanded.value = false } }, [h('svg', { 'width': '12', 'height': '12', 'viewBox': '0 0 16 16', 'fill': 'none', 'stroke': 'currentColor', 'aria-hidden': 'true' }, [h('path', { 'd': 'M9.5 1.5V6.5H14.5M1.5 9.5H6.5V14.5' }, undefined)])]), renderCopy?.(true)])]))
    }
    return (h(Fragment, null, [renderCopy?.(), h('span', { 'class': css.stringField, 'data-expanded': expanded.value }, [h('span', { 'ref': contentRef, 'id': contentsId, 'class': css.stringText }, [truncated.value && (h('span', { 'class': css.stringToggleSlot }, [h('button', { 'type': 'button', 'class': css.stringToggle, 'aria-label': labels.expandNode, 'aria-expanded': false, 'aria-controls': contentsId, 'onClick': () => {
      wrapped.value = stringWrapping?.getDefault() ?? false
      expanded.value = true
    } }, [h('span', { 'aria-hidden': 'true' }, ['\u2026']), labels.expandNode])])), field !== undefined && h('span', { 'class': css.label }, [fieldText(field), ':']), primitiveValue(value), !lastElement && h('span', { 'class': css.punctuation }, [','])])])]))
  }
}, { props: ['collapsedStringLines', 'stringWrapping', 'field', 'labels', 'lastElement', 'renderCopy', 'value'] })
const JsonTreeNode = defineComponent((props: JsonTreeNodeProps) => {
  const contentsId = useId()
  const expanderRef = shallowRef<HTMLSpanElement | null>(null)
  const expanded = shallowRef(props.initialExpanded)
  return (): VNode => {
    const { collapsedStringLines, stringWrapping, field, labels, lastElement, onClaimTabStop, onRowHover, path,
      renderCopy, tabStopId, value } = props
    const nodeId = pathId(path)
    const container = isExpandableValue(value)
    const entries = container ? entriesOf(value) : []
    const expandable = entries.length > 0
    const toggle = () => {
      expanded.value = !expanded.value
      claimFocus(expanderRef.value as HTMLSpanElement)
    }
    const onExpanderKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        expanded.value = event.key === 'ArrowRight'
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        if (event.currentTarget instanceof HTMLElement) moveFocus(event.currentTarget, event.key === 'ArrowUp' ? -1 : 1)
      }
    }
    const row = (children: VNodeChild, ariaExpanded?: boolean) => (h('div', { 'class': css.row, 'role': 'treeitem', 'aria-expanded': ariaExpanded, 'onMouseover': (event) => {
      event.stopPropagation()
      if (event.currentTarget instanceof HTMLElement) onRowHover(event.currentTarget, { path, value })
    } }, [typeof value !== 'string' && renderCopy?.({ path, value }), children]))
    if (typeof value === 'string') {
      return row(h(JsonString, { 'collapsedStringLines': collapsedStringLines, 'stringWrapping': stringWrapping, 'field': field, 'value': value, 'labels': labels, 'lastElement': lastElement, 'renderCopy': renderCopy === undefined ? undefined : persistent => renderCopy({ path, value }, persistent) }, undefined))
    }
    if (!container) {
      return row((h(Fragment, null, [h(NodeField, { 'field': field, 'expandable': false, 'onToggle': toggle }, undefined), primitiveValue(value), !lastElement && h('span', { 'class': css.punctuation }, [','])])))
    }
    const [open, close] = bracketOf(value)
    if (!expandable) {
      return row((h(Fragment, null, [h(NodeField, { 'field': field, 'expandable': false, 'onToggle': toggle }, undefined), h('span', { 'class': css.punctuation }, [open]), h('span', { 'class': css.punctuation }, [close]), !lastElement && h('span', { 'class': css.punctuation }, [','])])))
    }
    return row((h(Fragment, null, [h('span', { 'ref': expanderRef, 'class': clsx(css.expander, expanded.value ? css.collapseIcon : css.expandIcon), 'data-json-expander': true, 'role': 'button', 'aria-label': expanded.value ? labels.collapseNode : labels.expandNode, 'aria-expanded': expanded.value, 'aria-controls': expanded.value ? contentsId : undefined, 'tabIndex': tabStopId === nodeId ? 0 : -1, 'onFocus': () => { onClaimTabStop(nodeId) }, 'onClick': toggle, 'onKeydown': onExpanderKeyDown }, undefined), h('span', { 'class': css.summary }, [h(NodeField, { 'field': field, 'expandable': true, 'onToggle': toggle }, undefined), h('span', { 'class': css.preview }, [previewValue(value, 0)]), !lastElement && h('span', { 'class': css.punctuation }, [','])]), expanded.value && (h('ul', { 'id': contentsId, 'role': 'group', 'class': css.children }, [entries.map(([key, item], index) => (h(JsonTreeNode, { 'key': key, 'collapsedStringLines': collapsedStringLines, 'stringWrapping': stringWrapping, 'field': key, 'value': item, 'path': [...path, Array.isArray(value) ? index : key], 'labels': labels, 'lastElement': index === entries.length - 1, 'initialExpanded': false, 'tabStopId': tabStopId, 'onClaimTabStop': onClaimTabStop, 'onRowHover': onRowHover, 'renderCopy': renderCopy }, undefined)))]))])), expanded.value)
  }
}, { props: ['collapsedStringLines', 'stringWrapping', 'field', 'initialExpanded', 'labels', 'lastElement', 'onClaimTabStop', 'onRowHover', 'path', 'renderCopy', 'tabStopId', 'value'] })
function formattedPath(path: JsonPath): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === 'number')
      return `${result}[${String(part)}]`
    return /^[A-Za-z_$][\w$]*$/.test(part)
      ? `${result}.${part}`
      : `${result}[${JSON.stringify(part)}]`
  }, '$')
}
function copyText(target: RowTarget, mode: CopyMode): string {
  if (mode === 'path')
    return formattedPath(target.path)
  if (mode === 'prettyJson')
    return JSON.stringify(target.value, null, 2)
  if (mode === 'json')
    return JSON.stringify(target.value)
  if (typeof target.value === 'string')
    return target.value
  if (typeof target.value === 'undefined')
    return 'undefined'
  if (typeof target.value === 'bigint')
    return target.value.toString()
  if (typeof target.value === 'symbol')
    return target.value.description ?? 'Symbol'
  if (typeof target.value === 'function')
    return target.value.name || 'Function'
  return JSON.stringify(target.value)
}
/** Props for the read-only, token-themed JSON tree. */
export interface JsonTreeProps {
  /** Parsed JSON object or array. */
  data: object | unknown[]
  /** Accessible label for the tree. */
  label: string
  /** Optional positioning class owned by the caller. */
  className?: string | undefined
  /** Maximum visible lines per collapsed string; defaults to 3. */
  collapsedStringLines?: number
  /** Optional wrap toggle; each expansion reads the shared default without changing other open strings. */
  stringWrapping?: {
    /** Localized label for the wrapping toggle. */
    label: string
    /** Read the wrapping preference when a string is expanded. @returns Whether to wrap long lines. */
    getDefault: () => boolean
    /** Remember a user toggle for future expansions. @param wrapped - Whether to wrap long lines. */
    setDefault: (wrapped: boolean) => void
  } | undefined
  /** Whether JSON rows expose copy actions. */
  copyable?: boolean
  /** Whether the top-level object or array is always expanded. */
  expandTopLevel?: boolean
  /** Localized display copy supplied by the owning render site. */
  labels: JsonTreeLabels
}
/**
 * Render parsed JSON as a compact, keyboard-accessible inspector tree.
 * @param props - Parsed data, accessible label, and display options.
 * @returns A read-only JSON tree with an optionally fixed-open top level.
 */
export const JsonTree = defineComponent((props: JsonTreeProps) => {
  const initialTabStopId = computed(() => {
    const { data, expandTopLevel = true } = props
    const rootEntries = entriesOf(data)
    const firstExpandableIndex = rootEntries.findIndex(([, value]) => (isExpandableValue(value) && entriesOf(value).length > 0))
    const firstExpandableEntry = rootEntries[firstExpandableIndex]
    const initialTabStopId = expandTopLevel
      ? firstExpandableEntry === undefined
        ? null
        : pathId([Array.isArray(data) ? firstExpandableIndex : firstExpandableEntry[0]])
      : isExpandableValue(data) && rootEntries.length > 0 ? pathId([]) : null
    return initialTabStopId
  })
  const activeRowRef = shallowRef<HTMLElement | undefined>()
  const resetTimer = shallowRef<ReturnType<typeof setTimeout> | undefined>()
  const copySequence = shallowRef(0)
  const copyStore = createCopyStore()
  const tabStopId = shallowRef<string | null>(initialTabStopId.value)
  const setActiveRow = (row: HTMLElement | undefined) => {
    activeRowRef.value?.removeAttribute('data-json-copy-active')
    activeRowRef.value = row
    row?.setAttribute('data-json-copy-active', '')
  }
  const clearCopyTarget = () => {
    copySequence.value += 1
    if (resetTimer.value !== undefined)
      clearTimeout(resetTimer.value)
    setActiveRow(undefined)
    copyStore.set(undefined)
  }
  onScopeDispose(() => {
    copySequence.value += 1
    if (resetTimer.value !== undefined)
      clearTimeout(resetTimer.value)
    activeRowRef.value?.removeAttribute('data-json-copy-active')
  })
  watch([() => props.data, () => props.expandTopLevel, initialTabStopId], () => { clearCopyTarget(); tabStopId.value = initialTabStopId.value }, { immediate: true, flush: 'post' })
  const handleRowHover = (row: HTMLElement, target: RowTarget) => {
    if (props.copyable === false || copyStore.get()?.menuOpen)
      return
    if (activeRowRef.value === row)
      return
    setActiveRow(row)
    copyStore.set({ id: pathId(target.path), target, state: 'idle', menuOpen: false })
  }
  const handleRootMouseOver = (event: MouseEvent) => {
    if (props.copyable === false || copyStore.get()?.menuOpen)
      return
    /* v8 ignore next -- browser mouse events over JSON rows target an Element. */
    if (!(event.target instanceof Element))
      return
    if (event.target.closest('[data-json-copy-button]') === null)
      clearCopyTarget()
  }
  const copy = async (target: RowTarget, mode: CopyMode) => {
    const sequence = ++copySequence.value
    const snapshot: CopySnapshot = {
      id: pathId(target.path), target, state: 'idle', menuOpen: false,
    }
    copyStore.set(snapshot)
    let state: CopySnapshot['state']
    try {
      await navigator.clipboard.writeText(copyText(target, mode))
      state = 'copied'
    }
    catch {
      state = 'failed'
    }
    const current = copyStore.get()
    if (sequence !== copySequence.value || current?.target !== target)
      return
    copyStore.set({ ...current, state })
    if (resetTimer.value !== undefined)
      clearTimeout(resetTimer.value)
    resetTimer.value = setTimeout(() => {
      const current = copyStore.get()
      if (current?.target === target)
        copyStore.set({ ...current, state: 'idle' })
    }, 1500)
  }
  return () => {
    const { data, label, className, collapsedStringLines = 3, stringWrapping, copyable = true, expandTopLevel = true, labels } = props
    const rootEntries = entriesOf(data)
    const [rootOpen, rootClose] = bracketOf(data)
    const renderCopy = copyable ? (target: RowTarget, persistent = false) => (h(JsonCopyAction, { 'store': copyStore, 'target': target, 'persistent': persistent, 'labels': labels, 'onCopy': copy, 'onClose': clearCopyTarget }, undefined)) : undefined
    return (h('div', { 'class': clsx(css.root, className), 'style': { '--json-tree-collapsed-lines': collapsedStringLines } satisfies CSSProperties, 'onMouseover': handleRootMouseOver, 'onMouseleave': () => {
      if (!copyStore.get()?.menuOpen)
        clearCopyTarget()
    } }, [expandTopLevel
      ? (h('div', { 'class': css.expandedTopLevel }, [h('div', { 'class': clsx(css.row, css.topLevelBracket), 'data-json-root-row': true, 'onMouseover': (event) => {
        event.stopPropagation()
        if (event.currentTarget instanceof HTMLElement) handleRowHover(event.currentTarget, { path: [], value: data })
      } }, [renderCopy?.({ path: [], value: data }), h('span', { 'class': css.punctuation }, [rootOpen])]), h('div', { 'aria-label': label, 'class': clsx(css.container, css.expandedTopLevelContainer), 'role': 'tree' }, [rootEntries.map(([key, value], index) => (h(JsonTreeNode, { 'key': key, 'collapsedStringLines': collapsedStringLines, 'stringWrapping': stringWrapping, 'field': key, 'value': value, 'path': [Array.isArray(data) ? index : key], 'labels': labels, 'lastElement': index === rootEntries.length - 1, 'initialExpanded': false, 'tabStopId': tabStopId.value, 'onClaimTabStop': (id) => { tabStopId.value = id }, 'onRowHover': handleRowHover, 'renderCopy': renderCopy }, undefined)))]), h('div', { 'class': clsx(css.row, css.topLevelBracket) }, [h('span', { 'class': css.punctuation }, [rootClose])])]))
      : (h('div', { 'aria-label': label, 'class': css.container, 'role': 'tree' }, [h(JsonTreeNode, { 'collapsedStringLines': collapsedStringLines, 'stringWrapping': stringWrapping, 'value': data, 'path': [], 'labels': labels, 'lastElement': true, 'initialExpanded': true, 'tabStopId': tabStopId.value, 'onClaimTabStop': (id) => { tabStopId.value = id }, 'onRowHover': handleRowHover, 'renderCopy': renderCopy }, undefined)]))]))
  }
}, { props: ['data', 'label', 'className', 'collapsedStringLines', 'stringWrapping', 'copyable', 'expandTopLevel', 'labels'] })
