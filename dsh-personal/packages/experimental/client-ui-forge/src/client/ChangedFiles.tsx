import { defineComponent, h, computed, shallowRef, watch, onMounted, onScopeDispose, type VNodeChild } from 'vue'
/** Changed-file navigation shared by the toolbar menu and wide diff pane, with a disclosure column on every row. */
import clsx from 'clsx'
import {
  MarqueeText, useHoverMarquee,
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconFolderCloseRegular,
  Input,
  Menu,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgeDiffFile } from '../types.ts'
import { Counts } from './DiffFile.tsx'
import {
  changedFileTree,
  filesInTreeOrder,
  filterFileTree, viewedNodes,
  type ChangedFileNode,
} from './file-tree.ts'
import type { NS } from './locales.ts'
import css from './ChangedFiles.module.css'
/** Viewing choices remain owned by the changes tab while either navigation surface is hidden. */
export interface ChangedFilesState {
  readonly query: string
  readonly collapsed: Readonly<Record<string, boolean>>
  readonly selected: string | null
}
/** Data and actions of the changed-file navigator. */
export interface ChangedFilesProps extends PropsLocale<typeof NS> {
  readonly viewed?: ReadonlySet<string>
  readonly loading?: boolean
  readonly files: readonly ForgeDiffFile[]
  readonly state: ChangedFilesState
  readonly filter: (query: string) => void
  readonly toggle: (path: string) => void
  readonly jump: (path: string) => void
  /** A menu row participates in the shared menu's keyboard walk. */
  readonly menu?: boolean
  /** Unresolved host review threads by file path; files without any are absent. */
  readonly threadCounts?: ReadonlyMap<string, number>
}
const FileName = defineComponent((props: { readonly name: string }) => {
  const text = shallowRef<HTMLSpanElement | null>(null)
  const marquee = useHoverMarquee(text)
  let row: HTMLElement | null = null
  onMounted(() => {
    row = text.value?.closest('button') ?? null
    row?.addEventListener('pointerenter', marquee.onPointerEnter)
    row?.addEventListener('pointerleave', marquee.onPointerLeave)
  })
  onScopeDispose(() => {
    row?.removeEventListener('pointerenter', marquee.onPointerEnter)
    row?.removeEventListener('pointerleave', marquee.onPointerLeave)
  })
  return () => h('span', { onPointerenter: marquee.onPointerEnter, onPointerleave: marquee.onPointerLeave }, [h(MarqueeText, { elementRef: el => { text.value = el }, className: css.name ?? '', 'data-forge-tree-name': '' }, { default: () => props.name })])
}, { props: ['name'] })
function Rows({
  nodes,
  depth,
  done,
  props,
}: {
  readonly nodes: readonly ChangedFileNode[]
  readonly done: ReadonlySet<string>
  readonly depth: number
  readonly props: ChangedFilesProps
}): VNodeChild {
  return nodes.map((node) => {
    const directory = node.kind === 'directory'
    const expanded =
      directory && (props.state.query.trim() !== '' || props.state.collapsed[node.path] !== true)
    const threads = node.kind === 'file' ? (props.threadCounts?.get(node.path) ?? 0) : 0
    const label =
      node.kind === 'file' && node.file.previousPath !== null
        ? props.t('diff.renamedPath', { from: node.file.previousPath, path: node.path })
        : node.path
    return h('div', { key: node.path }, [
      h(
        Tooltip,
        { label: label, portal: true, side: 'left', delayMs: 500, disabled: node.kind !== 'file' || node.file.previousPath === null },
        {
          default: () => [
            h(
              'button',
              {
                type: 'button',
                role: props.menu ? 'menuitem' : undefined,
                class: clsx(
                  css.row,
                  done.has(node.path) && css.viewed,
                  !directory && props.state.selected === node.path && css.selected,
                ),
                style: { paddingInlineStart: `${8 + depth * 14}px` },
                'aria-label': label,
                'data-viewed': done.has(node.path) ? '' : undefined,
                'aria-description': done.has(node.path) ? props.t(directory ? 'viewed.directory' : 'viewed.label') : undefined,
                'aria-expanded': directory ? expanded : undefined,
                'aria-current':
                  !directory && props.state.selected === node.path ? 'true' : undefined,
                onKeydown: (event: KeyboardEvent) => {
                  if (!directory || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
                  event.preventDefault()
                  if ((event.key === 'ArrowRight') !== expanded) props.toggle(node.path)
                },
                onClick: (event) => {
                  if (directory) {
                    event.stopPropagation()
                    props.toggle(node.path)
                  } else props.jump(node.path)
                },
              },
              [
                h('span', { class: css.chevron, 'aria-hidden': 'true' }, [
                  directory &&
                    h(IconChevronDownOutlineRegular, {
                      size: 12,
                      className: clsx(!expanded && css.collapsed),
                    }),
                ]),
                directory
                  ? h(IconFolderCloseRegular, { size: 14 })
                  : h(FileTypeIcon, { path: node.path, size: 14 }),
                h(FileName, { name: node.name }),
                threads > 0 &&
                  h(Tooltip, { label: props.t('thread.treeCount', { count: threads }), delayMs: 500, portal: true, side: 'left' }, { default: () => h('span', { class: css.threads }, [threads]) }),
                node.kind === 'file' && h(Counts, { file: node.file, t: props.t }),
              ],
            ),
          ],
        },
      ),
      node.kind === 'directory' &&
        expanded &&
        h(Rows, { nodes: node.children, depth: depth + 1, done, props: props }),
    ])
  })
}
/**
 * Scroll only the row container to show a row that is not wholly visible; a visible row stays where it is.
 * `scrollIntoView` would also scroll every scrollable ancestor, moving the menu card or the page behind it, and
 * its `container` option is not yet supported widely enough, so the offset is measured here.
 * @param container - the scrolling rows.
 * @param row - the row to show.
 * @param align - `center` places the row mid-view with its neighbors; `nearest` scrolls by the least distance.
 */
function revealRow(container: HTMLElement, row: HTMLElement, align: 'center' | 'nearest'): void {
  const top = container.getBoundingClientRect().top + container.clientTop
  const bottom = top + container.clientHeight
  const box = row.getBoundingClientRect()
  if (box.top >= top && box.bottom <= bottom) return
  if (align === 'center') container.scrollTop += (box.top + box.bottom - top - bottom) / 2
  else container.scrollTop += box.top < top ? box.top - top : box.bottom - bottom
}
/**
 * Render searchable directory navigation without reading file contents.
 * @param props - changed files, per-tab choices, navigation actions, and localized copy.
 * @returns the search field and matching branches.
 */
export const ChangedFiles = defineComponent(
  (props: ChangedFilesProps) => {
    const tree = computed(() => changedFileTree(props.files))
    const done = computed(() => viewedNodes(tree.value, props.viewed ?? new Set<string>()))
    const nodes = computed(() => filterFileTree(tree.value, props.state.query))
    const order = computed(() => filesInTreeOrder(tree.value))
    const selectedIndex = computed(() =>
      order.value.findIndex(file => file.path === props.state.selected),
    )
    const rows = shallowRef<HTMLDivElement | null>(null)
    const query = shallowRef(props.state.query)
    // A changed filter shows its results from the top.
    watch(
      () => [props.state.query],
      () => {
        if (query.value === props.state.query) return
        query.value = props.state.query
        const container = rows.value
        /* v8 ignore next -- the ref is attached before layout effects run. */
        if (container === null) return
        container.scrollTop = 0
      },
      { immediate: true, flush: 'post' },
    )
    const mounted = shallowRef(false)
    // The toolbar menu mounts these rows at the top on every opening, so mounting centers the selected file. Later, a
    // file step in the diff, or files arriving or reordering around a selection, scrolls by the least distance; a
    // refresh that keeps the selected file's position leaves the reader's scroll alone.
    watch(
      [() => rows.value, () => props.state.selected, () => selectedIndex.value],
      () => {
        const align = mounted.value ? 'nearest' : 'center'
        const container = rows.value
        const row = container?.querySelector<HTMLElement>('[aria-current="true"]')
        if (container == null) return
        mounted.value = true
        if (row == null) return
        revealRow(container, row, align)
      },
      { immediate: true, flush: 'post' },
    )
    return () => {
      return h('div', { class: css.root, 'data-forge-file-tree': '' }, [
        h('div', { class: css.search }, [
          h(Input, {
            className: clsx(css.searchInput),
            'aria-label': props.t('diff.filterFiles'),
            placeholder: props.t('diff.filterFiles'),
            value: props.state.query,
            onInput: (event: Event) => {
              props.filter((event.currentTarget as HTMLInputElement).value)
            },
            onKeydown: (event: KeyboardEvent) => {
              if (['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key))
                event.stopPropagation()
            },
          }),
        ]),
        h('div', { ref: rows, class: css.rows }, [
          nodes.value.length === 0
            ? h('div', { class: css.empty }, [props.t('diff.noMatchingFiles')])
            : h(Rows, { nodes: nodes.value, depth: 0, done: done.value, props: props }),
        ]),
      ])
    }
  },
  { props: ['files', 'state', 'filter', 'toggle', 'jump', 'menu', 'threadCounts', 'viewed', 'loading', 't'] },
)
/**
 * Open directory navigation through the existing files toolbar entry.
 * @param props - navigator data and whether its owning tab is visible.
 * @returns the toolbar entry and its portalled menu.
 */
export const ChangedFilesMenu = defineComponent(
  (
    props: ChangedFilesProps & {
      readonly visible: boolean
    },
  ) => {
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    return () => {
      return h(
        Menu,
        {
          open: props.visible && open.value,
          portal: true,
          dense: true,
          align: 'start',
          className: css.anchor ?? '',
          listClassName: css.menu ?? '',
          onClose: () => {
            setOpen(false)
          },
        },
        {
          anchor: () =>
            h(
              'button',
              {
                type: 'button',
                class: css.trigger,
                'aria-haspopup': 'menu',
                'aria-expanded': props.visible && open.value,
                disabled: props.files.length === 0,
                onClick: () => {
                  setOpen(value => !value)
                },
              },
              [
                h('span', { class: css.triggerLabel }, [
                  props.loading ? props.t('diff.allFilesLoading') : props.t('diff.allFiles', { count: props.files.length }),
                ]),
                h(IconChevronDownOutlineRegular, { size: 12, className: css.triggerChevron ?? '' }),
              ],
            ),
          default: () => [
            h(ChangedFiles, {
              ...props,
              menu: true,
              jump: (path) => {
                setOpen(false)
                props.jump(path)
              },
            }),
          ],
        },
      )
    }
  },
  { props: ['visible', 'files', 'state', 'filter', 'toggle', 'jump', 'menu', 'threadCounts', 'viewed', 'loading', 't'] },
)
