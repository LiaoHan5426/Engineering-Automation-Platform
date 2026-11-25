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

function glyph(name: string) {
  function Icon(props: UiProps) {
    const size = typeof props.size === 'number' ? props.size : 16
    return createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'currentColor',
        'aria-hidden': true,
        'data-eap-ui': name,
        'data-kind': props.kind,
        className: props.className,
      },
      createElement('path', {
        d: 'M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2c.4 0 .77.2 1 .5L8 3h5a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-8Z',
      }),
    )
  }
  Icon.displayName = name
  return Icon
}

function host(name: string) {
  function Host(props: UiProps) {
    return createElement(
      'div',
      { className: props.className, 'data-eap-ui': name },
      props.children,
    )
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
    { title: typeof props.label === 'string' ? props.label : undefined, className: props.className, 'data-eap-ui': 'Tooltip' },
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

const HOSTS = [
  'ConnectionIndicator',
  'DiffBlock',
  'JsonTree',
  'MarkdownDelegateProvider',
  'MarkdownText',
  'Menu',
  'MenuSurface',
  'Pill',
  'ReadBlock',
  'SearchBlock',
  'SegmentedControl',
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
  FileTypeIcon: glyph('FileTypeIcon'),
  Button,
  Input,
  Tooltip,
  Modal,
  useDismissOnOutsidePointer,
}
for (const name of ICONS) pluginUi[name] = glyph(name)
for (const name of HOSTS) pluginUi[name] = host(name)
pluginUi.default = pluginUi

/** Plugin-facing UI module. Only the exports the installed client calls are present. */
export function createPluginUi(): Record<string, unknown> {
  return pluginUi
}
