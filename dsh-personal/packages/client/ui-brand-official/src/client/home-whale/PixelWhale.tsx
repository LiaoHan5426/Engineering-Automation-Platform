/** Home frame layer: a decorative canvas below the Conversation content, played by clicks on blank home space. */
import { defineComponent, h, onScopeDispose, type VNodeChild } from 'vue'
import type { HeroFrameOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import atlasUrl from '../assets/breach-atlas.webp'
import { WHALE_ARTWORK } from './artwork.ts'
import { attachPixelWhale, type PixelWhaleHandle } from './renderer.ts'
import css from './PixelWhale.module.css'

/** Interactive descendants whose clicks belong to the control, not to blank home space. */
const CONTROLS = 'button, a, input, textarea, select, label, [contenteditable], [role="button"], [role="dialog"], [role="menu"], [role="listbox"], [data-composer-card]'

/** Frame owner state; wrapped content is supplied through the native default slot. */
export type PixelWhaleProps = HeroFrameOwnerProps & { children?: VNodeChild }

/** A primary blank-space click excludes controls and text selection inside this frame. */
function isBlankClick(event: MouseEvent): boolean {
  const frame = event.currentTarget
  const rawTarget = event.target
  const target = rawTarget instanceof Element ? rawTarget : rawTarget instanceof Node ? rawTarget.parentElement : null
  const selection = window.getSelection()
  return event.button === 0
    && frame instanceof HTMLDivElement
    && target !== null && frame.contains(target)
    && target.closest(CONTROLS) === null
    && !(selection !== null && !selection.isCollapsed && frame.contains(selection.anchorNode))
}

/** Wrap the Conversation body and own its decorative canvas for the visible home lifetime. */
export const PixelWhale = defineComponent((props: PixelWhaleProps, { slots }) => {
  let whale: PixelWhaleHandle | undefined
  let canvasElement: HTMLCanvasElement | null = null
  const release = (): void => { whale?.dispose(); whale = undefined }
  const canvasRef = (element: unknown): void => {
    const canvas = element instanceof HTMLCanvasElement ? element : null
    if (canvas === canvasElement) return
    release()
    canvasElement = canvas
    if (canvas !== null) whale = attachPixelWhale(canvas, WHALE_ARTWORK, atlasUrl)
  }
  onScopeDispose(release)
  const onClick = (event: MouseEvent): void => { if (whale !== undefined && isBlankClick(event)) whale.play() }
  return () => h('div', { class: css.layer, onClick }, [
    props.hero ? h('canvas', { ref: canvasRef, class: css.canvas, 'data-home-whale': '', 'aria-hidden': 'true' }) : null,
    slots.default?.(),
  ])
}, { name: 'PixelWhale', inheritAttrs: false, props: ['hero', 'children'] })
