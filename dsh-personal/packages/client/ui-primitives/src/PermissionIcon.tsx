import { h, type VNodeChild } from 'vue'
import { ICON_MEDIUM_STROKE, ICON_REGULAR_STROKE } from './icons/index.tsx'
import type { IconProps } from './icons/props.ts'
interface PermissionIconArtworkProps extends IconProps {
  strokeWidth: number
}
function ReadOnlyArtwork({ size = 16, className, strokeWidth }: PermissionIconArtworkProps): VNodeChild {
  return (h('svg', { 'width': size, 'height': size, 'class': className, 'viewBox': '0 0 16 16', 'fill': 'none', 'xmlns': 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', 'stroke-width': strokeWidth }, [h('path', { "vector-effect": "non-scaling-stroke", "d": "M5.08545 8.13775L7.18455 10.2368C7.26636 10.3187 7.4003 10.3142 7.47649 10.2271L11.5148 5.61194", "stroke": "currentColor" }), h('path', { "vector-effect": "non-scaling-stroke", "d": "M6.59624 2.14853C7.50155 1.80917 8.49914 1.80919 9.40444 2.14859L14 4V7.11961C14 11.6089 10.5565 13.5975 8.00035 14.5779C5.44423 13.5975 2 11.6089 2 7.11961V4L6.59624 2.14853Z", "stroke": "currentColor", "stroke-linejoin": "round" })]))
}
function WorkspaceWriteArtwork({ size = 16, className, strokeWidth }: PermissionIconArtworkProps): VNodeChild {
  return (h('svg', { 'width': size, 'height': size, 'class': className, 'viewBox': '0 0 16 16', 'fill': 'none', 'xmlns': 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', 'stroke-width': strokeWidth }, [h('path', { "vector-effect": "non-scaling-stroke", "d": "M14 6.68994V4L9.40444 2.14859C8.49914 1.80919 7.50155 1.80917 6.59624 2.14853L2 4V7.11961C2 11.6089 5.44423 13.5975 8.00035 14.5779C8.404 14.4231 8.8303 14.2432 9.264 14.035", "stroke": "currentColor", "stroke-linejoin": "round" }), h('path', { "vector-effect": "non-scaling-stroke", "d": "M5.5 6.5H10.5M5.5 10H8.5", "stroke": "currentColor" }), h('path', { "vector-effect": "non-scaling-stroke", "d": "M10.37865 13.47795L14.23015 8.23882M12.5 13H15.5", "stroke": "currentColor" })]))
}
function FullAccessArtwork({ size = 16, className, strokeWidth }: PermissionIconArtworkProps): VNodeChild {
  return (h('svg', { 'width': size, 'height': size, 'class': className, 'viewBox': '0 0 16 16', 'fill': 'none', 'xmlns': 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', 'stroke-width': strokeWidth }, [h('path', { "vector-effect": "non-scaling-stroke", "d": "M6.59624 2.14853C7.50155 1.80917 8.49914 1.80919 9.40444 2.14859L14 4V7.11961C14 11.6089 10.5565 13.5975 8.00035 14.5779C5.44423 13.5975 2 11.6089 2 7.11961V4L6.59624 2.14853Z", "stroke": "currentColor", "stroke-linejoin": "round" }), h('path', { "vector-effect": "non-scaling-stroke", "d": "M8 4.5V10", "stroke": "currentColor" }), h('path', { "vector-effect": "non-scaling-stroke", "d": "M8 11V12", "stroke": "currentColor" })]))
}
function AutoReviewArtwork({ size = 16, className, strokeWidth }: PermissionIconArtworkProps): VNodeChild {
  return (h('svg', { 'width': size, 'height': size, 'class': className, 'viewBox': '0 0 16 16', 'fill': 'none', 'xmlns': 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', 'stroke-width': strokeWidth }, [h('path', { "vector-effect": "non-scaling-stroke", "d": "M6.59624 2.14853C7.50155 1.80917 8.49914 1.80919 9.40444 2.14859L14 4V7.11961C14 11.6089 10.5565 13.5975 8.00035 14.5779C5.44423 13.5975 2 11.6089 2 7.11961V4L6.59624 2.14853Z", "stroke": "currentColor", "stroke-linejoin": "round" }), h('path', { "vector-effect": "non-scaling-stroke", "d": "M5.75 10.15L8 4.95L10.25 10.15M6.5 8.5H9.5", "stroke": "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" })]))
}
/**
* Render the read-only permission icon with a one-pixel stroke.
* @param props - Size and optional class.
* @returns The regular decorative permission glyph.
*/
export function PermissionIconReadOnlyRegular(props: IconProps): VNodeChild {
  return h(ReadOnlyArtwork, { ...props, 'strokeWidth': ICON_REGULAR_STROKE })
}
/**
* Render the read-only permission icon with a 1.3px stroke.
* @param props - Size and optional class.
* @returns The medium decorative permission glyph.
*/
export function PermissionIconReadOnlyMedium(props: IconProps): VNodeChild {
  return h(ReadOnlyArtwork, { ...props, 'strokeWidth': ICON_MEDIUM_STROKE })
}
/**
* Render the workspace-write permission icon with a one-pixel stroke.
* @param props - Size and optional class.
* @returns The regular decorative permission glyph.
*/
export function PermissionIconWorkspaceWriteRegular(props: IconProps): VNodeChild {
  return h(WorkspaceWriteArtwork, { ...props, 'strokeWidth': ICON_REGULAR_STROKE })
}
/**
* Render the workspace-write permission icon with a 1.3px stroke.
* @param props - Size and optional class.
* @returns The medium decorative permission glyph.
*/
export function PermissionIconWorkspaceWriteMedium(props: IconProps): VNodeChild {
  return h(WorkspaceWriteArtwork, { ...props, 'strokeWidth': ICON_MEDIUM_STROKE })
}
/**
* Render the full-access permission icon with a one-pixel stroke.
* @param props - Size and optional class.
* @returns The regular decorative permission glyph.
*/
export function PermissionIconFullAccessRegular(props: IconProps): VNodeChild {
  return h(FullAccessArtwork, { ...props, 'strokeWidth': ICON_REGULAR_STROKE })
}
/**
* Render the full-access permission icon with a 1.3px stroke.
* @param props - Size and optional class.
* @returns The medium decorative permission glyph.
*/
export function PermissionIconFullAccessMedium(props: IconProps): VNodeChild {
  return h(FullAccessArtwork, { ...props, 'strokeWidth': ICON_MEDIUM_STROKE })
}
/**
* Render the auto-review permission icon with a one-pixel stroke.
* @param props - Size and optional class.
* @returns The regular decorative permission glyph.
*/
export function PermissionIconAutoReviewRegular(props: IconProps): VNodeChild {
  return h(AutoReviewArtwork, { ...props, 'strokeWidth': ICON_REGULAR_STROKE })
}
/**
* Render the auto-review permission icon with a 1.3px stroke.
* @param props - Size and optional class.
* @returns The medium decorative permission glyph.
*/
export function PermissionIconAutoReviewMedium(props: IconProps): VNodeChild {
  return h(AutoReviewArtwork, { ...props, 'strokeWidth': ICON_MEDIUM_STROKE })
}
