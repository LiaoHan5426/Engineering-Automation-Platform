import {
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  Ellipsis,
  ArrowUp,
  ArrowLeft,
  Paperclip,
  Info,
  TriangleAlert,
  Code,
  Briefcase,
  Layers,
  Users,
  Settings,
  Sparkles,
  CircleUser,
  Terminal,
  File,
  Folder,
  RefreshCw,
  LoaderCircle,
} from '@lucide/vue'
import { defineComponent, h, mergeProps, type Component, type PropType } from 'vue'

function wrapIcon(name: string, component: Component) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      label: String,
      size: [Number, String] as PropType<number | string>,
      strokeWidth: Number,
    },
    setup(props, { attrs }) {
      return () =>
        h(
          component,
          mergeProps(
            {
              class: 'eap-icon',
              size: props.size ?? '1em',
              strokeWidth: props.strokeWidth ?? 1.75,
              style: {
                display: 'inline-block',
                flexShrink: 0,
                verticalAlign: '-0.125em',
                width:
                  props.size === undefined
                    ? 'var(--eap-icon-size, 1em)'
                    : typeof props.size === 'number'
                      ? `${props.size}px`
                      : props.size,
                height:
                  props.size === undefined
                    ? 'var(--eap-icon-size, 1em)'
                    : typeof props.size === 'number'
                      ? `${props.size}px`
                      : props.size,
                strokeWidth: props.strokeWidth ?? 'var(--eap-icon-stroke-width, 1.75)',
              },
            },
            attrs,
            {
              'aria-hidden': props.label?.trim() ? undefined : true,
              'aria-label': props.label?.trim() || undefined,
              role: props.label?.trim() ? 'img' : undefined,
              focusable: 'false',
            },
          ),
        )
    },
  })
}

export const IconPlus = /* @__PURE__ */ wrapIcon('IconPlus', Plus)
export const IconX = /* @__PURE__ */ wrapIcon('IconX', X)
export const IconChevronDown = /* @__PURE__ */ wrapIcon('IconChevronDown', ChevronDown)
export const IconChevronRight = /* @__PURE__ */ wrapIcon('IconChevronRight', ChevronRight)
export const IconCheck = /* @__PURE__ */ wrapIcon('IconCheck', Check)
export const IconEllipsis = /* @__PURE__ */ wrapIcon('IconEllipsis', Ellipsis)
export const IconArrowUp = /* @__PURE__ */ wrapIcon('IconArrowUp', ArrowUp)
export const IconArrowLeft = /* @__PURE__ */ wrapIcon('IconArrowLeft', ArrowLeft)
export const IconPaperclip = /* @__PURE__ */ wrapIcon('IconPaperclip', Paperclip)
export const IconInfo = /* @__PURE__ */ wrapIcon('IconInfo', Info)
export const IconTriangleAlert = /* @__PURE__ */ wrapIcon('IconTriangleAlert', TriangleAlert)
export const IconCode = /* @__PURE__ */ wrapIcon('IconCode', Code)
export const IconBriefcase = /* @__PURE__ */ wrapIcon('IconBriefcase', Briefcase)
export const IconLayers = /* @__PURE__ */ wrapIcon('IconLayers', Layers)
export const IconUsers = /* @__PURE__ */ wrapIcon('IconUsers', Users)
export const IconSettings = /* @__PURE__ */ wrapIcon('IconSettings', Settings)
export const IconSparkles = /* @__PURE__ */ wrapIcon('IconSparkles', Sparkles)
export const IconCircleUser = /* @__PURE__ */ wrapIcon('IconCircleUser', CircleUser)
export const IconTerminal = /* @__PURE__ */ wrapIcon('IconTerminal', Terminal)
export const IconFile = /* @__PURE__ */ wrapIcon('IconFile', File)
export const IconFolder = /* @__PURE__ */ wrapIcon('IconFolder', Folder)
export const IconRefreshCw = /* @__PURE__ */ wrapIcon('IconRefreshCw', RefreshCw)
export const IconLoaderCircle = /* @__PURE__ */ wrapIcon('IconLoaderCircle', LoaderCircle)
