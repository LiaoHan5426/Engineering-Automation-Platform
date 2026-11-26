/**
 * UI surface a plugin client can require.
 * The package id stays the one plugins already call. The implementation is local.
 */
import { createElement, useEffect, type ReactNode, type RefObject } from 'react'

const FILE_TYPES: Record<string, string> = {
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  go: 'go',
  h: 'c',
  html: 'xml',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'react',
  kt: 'kotlin',
  md: 'markdown',
  php: 'php',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  sql: 'sql',
  svg: 'image',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'react',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
}

/** Byte count as compact size text (`312B`, `4.2KB`, `1.5MB`). */
export function fileSizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.floor(bytes || 0))}B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`
  const gb = mb / 1024
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`
}

/** Classify a path by its extension. Unknown paths stay `file`. */
export function classifyFileType(path: string): string {
  const base = String(path).split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
  return FILE_TYPES[ext] ?? 'file'
}

/** Write text to the clipboard. Returns whether the host accepted the write. */
export async function writeClipboard(text: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through to the selection copy */
    }
  }
  if (typeof document.execCommand !== 'function') return false
  const focused = document.activeElement
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.left = '-9999px'
  try {
    document.body.appendChild(field)
    field.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
  }
}

type UiProps = {
  className?: string
  children?: ReactNode
  size?: number
  kind?: string
  variant?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  value?: string
  placeholder?: string
  onChange?: (event: { target: { value: string } }) => void
  label?: ReactNode
  open?: boolean
  onClose?: () => void
  title?: ReactNode
  closeLabel?: ReactNode
  footer?: ReactNode
  'aria-label'?: string
  'aria-invalid'?: boolean
}

// The plugin calls these icons by name. Keep the command glyphs distinct
// from file types, whose artwork is selected from the path or explicit kind.
const GLYPHS: Record<string, string> = {
  AgentPreset: 'M8 2v2M4 5h8v8H4zM6 8h.01M10 8h.01M6 11h4',
  Api: 'M6 4 2 8l4 4m4-8 4 4-4 4M9 3l-2 10',
  Archive: 'M3 5h10v8H3zM2 2h12v3H2zM6 8h4',
  Branch: 'M4 3v10m8-10v3a4 4 0 0 1-4 4H4M2 3a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  Browse: 'M2 3h12v10H2zM2 6h12',
  Check: 'm3 8 3 3 7-7',
  Checklist: 'm2 5 1 1 2-2m-3 5 1 1 2-2m2-3h7m-7 4h7m-7 4h7',
  ChevronDown: 'm4 6 4 4 4-4',
  ChevronRight: 'm6 4 4 4-4 4',
  ChevronUp: 'm4 10 4-4 4 4',
  ChevronsUpDown: 'm5 6 3-3 3 3m-6 4 3 3 3-3',
  Clock: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2m0 3v3l2 1',
  Close: 'm4 4 8 8m0-8-8 8',
  Code: 'm6 4-4 4 4 4m4-8 4 4-4 4',
  ContextInjection: 'M3 2h10v12H3zM6 5h4M6 8h4M6 11h2',
  Copy: 'M6 5h7v8H6zM10 5V2H3v8h3',
  Download: 'M8 2v8m-3-3 3 3 3-3M3 12v2h10v-2',
  Edit: 'm3 11-1 3 3-1 8-8-2-2-8 8zm7-7 2 2',
  Ellipsis: 'M3 8h.1M8 8h.1M13 8h.1',
  FolderOpen: 'M2 13V3h4l2 2h6v2M3 13l2-6h9l-2 6z',
  Fullscreen: 'M6 2H2v4m8-4h4v4m0 4v4h-4m-4 0H2v-4',
  Globe: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M2 8h12M8 2c-4 3-4 9 0 12m0-12c4 3 4 9 0 12',
  Link: 'm6 10 4-4m-6 6-1 1a2 2 0 0 1-3-3l3-3a2 2 0 0 1 3 0m6-3 1-1a2 2 0 0 1 3 3l-3 3a2 2 0 0 1-3 0',
  ListPen: 'M2 4h10M2 8h5M2 12h4m2 2 1-3 4-4 2 2-4 4z',
  Loading: 'M14 8a6 6 0 1 1-6-6',
  NewChat: 'M2 3h12v8H7l-3 3v-3H2zM8 5v4M6 7h4',
  PanelLeft: 'M2 3h12v10H2zM6 3v10',
  Paperclip: 'M5 9l5-5a2 2 0 0 1 3 3l-6 6a3 3 0 0 1-4-4l6-6',
  Plan: 'M2 4h12M2 8h8m-8 4h10',
  Play: 'm5 2 8 6-8 6z',
  Question: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M6 6a2 2 0 1 1 3 2l-1 1m0 2h.01',
  Refresh: 'M13 6a5 5 0 1 0 0 5m0-9v4H9',
  RightUp: 'M4 12 12 4m-6 0h6v6',
  Search: 'M7 2a5 5 0 1 0 0 10A5 5 0 0 0 7 2m4 9 3 3',
  Send: 'm2 3 12 5-12 5 3-5zm3 5h9',
  Settings: 'M3 4h10M3 8h10M3 12h10M6 2v4m4 0v4m-4 0v4',
  Share: 'M4 7v6h9V7M8 10V2M5 5l3-3 3 3',
  Sparkle: 'M8 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
  Stop: 'M4 4h8v8H4z',
  Think: 'M5 12a5 5 0 1 1 6 0v2H5zM6 15h4',
  Trash: 'M3 4h10m-9 0 1 10h6l1-10M6 4V2h4v2m-3 3v4m2-4v4',
  TreeCorner: 'M4 2v8h8',
  User: 'M8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6M2 14a6 6 0 0 1 12 0',
  Users:
    'M6 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6M1 14a5 5 0 0 1 10 0m1-11a3 3 0 0 1 0 5m0 2a4 4 0 0 1 3 4',
  WarningTriangle: 'M8 2 1 14h14zM8 6v4m0 2h.01',
}

function renderGlyph(name: string, props: UiProps, path: string, kind?: string) {
  const size = props.size ?? 16
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: kind === 'folder' ? 'currentColor' : 'none',
      stroke: 'currentColor',
      strokeWidth: 1.25,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      'data-eap-ui': name,
      'data-kind': kind,
      className: props.className,
    },
    createElement('path', { d: path }),
  )
}

function glyph(name: string) {
  const path =
    GLYPHS[name.replace(/^Icon/, '').replace(/(?:Outline|Fill)?Regular$/, '')] ?? 'M3 2h10v12H3z'
  function Icon(props: UiProps) {
    return renderGlyph(name, props, path)
  }
  Icon.displayName = name
  return Icon
}

function FileTypeIcon(props: UiProps & { path?: string }) {
  const kind = props.kind ?? classifyFileType(props.path ?? '')
  const path =
    kind === 'folder'
      ? 'M2 4h5l1 1h6v8H2z'
      : kind === 'image'
        ? 'M2 3h12v10H2zM4 11l3-3 2 2 2-3 2 4M6 6h.01'
        : 'M3 2h6l4 4v8H3zM9 2v4h4M5 9h6m-6 2h4'
  return renderGlyph('FileTypeIcon', props, path, kind)
}

function host(name: string) {
  function Host(props: UiProps) {
    return createElement('div', { className: props.className, 'data-eap-ui': name }, props.children)
  }
  Host.displayName = name
  return Host
}

function Button(props: UiProps) {
  return createElement(
    'button',
    {
      type: props.type ?? 'button',
      disabled: props.disabled,
      className: props.className,
      onClick: props.onClick,
      'data-eap-ui': 'Button',
      'data-variant': props.variant,
    },
    props.children,
  )
}

function Input(props: UiProps) {
  return createElement('input', {
    className: props.className,
    value: props.value,
    placeholder: props.placeholder,
    disabled: props.disabled,
    'aria-label': props['aria-label'],
    'aria-invalid': props['aria-invalid'],
    onChange: props.onChange,
    'data-eap-ui': 'Input',
  })
}

function Tooltip(props: UiProps) {
  return createElement(
    'span',
    {
      title: typeof props.label === 'string' ? props.label : undefined,
      className: props.className,
      'data-eap-ui': 'Tooltip',
    },
    props.children,
  )
}

function Modal(props: UiProps) {
  if (!props.open) return null
  return createElement(
    'div',
    { role: 'dialog', 'data-eap-ui': 'Modal' },
    props.title,
    props.children,
    props.footer,
    createElement('button', { type: 'button', onClick: props.onClose }, props.closeLabel),
  )
}

/** Close `setOpen` when a pointer lands outside `rootRef`. */
export function useDismissOnOutsidePointer(
  rootRef: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && root.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [rootRef, open, setOpen])
}

const ICONS = [
  'IconAgentPresetOutlineRegular',
  'IconApiOutlineRegular',
  'IconArchiveOutlineRegular',
  'IconBranchOutlineRegular',
  'IconBrowseOutlineRegular',
  'IconCheckOutlineRegular',
  'IconChecklistOutlineRegular',
  'IconChevronDownOutlineRegular',
  'IconChevronRightOutlineRegular',
  'IconChevronUpOutlineRegular',
  'IconChevronsUpDownOutlineRegular',
  'IconClockOutlineRegular',
  'IconCloseFillRegular',
  'IconCloseOutlineRegular',
  'IconCodeOutlineRegular',
  'IconContextInjectionOutlineRegular',
  'IconCopyOutlineRegular',
  'IconDownloadOutlineRegular',
  'IconEditOutlineRegular',
  'IconEllipsisOutlineRegular',
  'IconFolderOpenOutlineRegular',
  'IconFolderOpenRegular',
  'IconFullscreenOutlineRegular',
  'IconGlobeOutlineRegular',
  'IconLinkOutlineRegular',
  'IconListPenOutlineRegular',
  'IconLoadingOutlineRegular',
  'IconNewChatOutlineRegular',
  'IconPanelLeftOutlineRegular',
  'IconPaperclipOutlineRegular',
  'IconPlanOutlineRegular',
  'IconPlayOutlineRegular',
  'IconPlusOutlineRegular',
  'IconQuestionOutlineRegular',
  'IconRefreshOutlineRegular',
  'IconRightUpOutlineRegular',
  'IconSearchOutlineRegular',
  'IconSendOutlineRegular',
  'IconSettingsOutlineRegular',
  'IconShareOutlineRegular',
  'IconSparkleRegular',
  'IconStopFillRegular',
  'IconThinkOutlineRegular',
  'IconTrashOutlineRegular',
  'IconTreeCornerRegular',
  'IconUserOutlineRegular',
  'IconUsersOutlineRegular',
  'IconWarningTriangleOutlineRegular',
] as const

function SegmentedControl(props: {
  id?: string
  label?: string
  value?: string
  options: readonly { value: string; label: string; disabled?: boolean }[]
  onChange?: (value: string) => void
}) {
  return createElement(
    'div',
    { role: 'group', 'aria-label': props.label, className: 'eap-dsh-segmented' },
    props.options.map((option) =>
      createElement(
        'button',
        {
          key: option.value,
          id: props.id ? `${props.id}-${option.value}` : undefined,
          type: 'button',
          disabled: option.disabled,
          'aria-pressed': option.value === props.value,
          onClick: () => props.onChange?.(option.value),
        },
        option.label,
      ),
    ),
  )
}

function MarkdownText({ text }: { text: string }) {
  // The compatibility view shows source as selectable text. The plugin owns
  // when to switch to its dedicated source or document renderer.
  return createElement('pre', { className: 'eap-dsh-markdown-source' }, text)
}

const HOSTS = [
  'ConnectionIndicator',
  'DiffBlock',
  'JsonTree',
  'MarkdownDelegateProvider',
  'Menu',
  'MenuSurface',
  'Pill',
  'ReadBlock',
  'SearchBlock',
  'StateDot',
  'Switch',
  'Tag',
  'TerminalBlock',
  'WebBlock',
] as const

const pluginUi: Record<string, unknown> = {
  __esModule: true,
  fileSizeText,
  classifyFileType,
  writeClipboard,
  FileTypeIcon,
  Button,
  Input,
  Tooltip,
  Modal,
  SegmentedControl,
  MarkdownText,
  useDismissOnOutsidePointer,
}
for (const name of ICONS) pluginUi[name] = glyph(name)
for (const name of HOSTS) pluginUi[name] = host(name)
pluginUi.default = pluginUi

/** Plugin-facing UI module. Only the exports the installed client calls are present. */
export function createPluginUi(): Record<string, unknown> {
  return pluginUi
}
