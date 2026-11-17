import { h, Fragment, defineComponent } from 'vue'
/**
 * The guide type's chip title: the compass before the type's label. Registered
 * under `sidebar.right.pane.tab.title`; without it the chip would show the
 * bare label. Both guide glyphs live here: the compass the chip and the body's
 * hero draw, and the cube the body's icon-less capsules fall back to.
 */
import type { DefineSetupFnComponent, VNodeChild } from 'vue'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './GuideBody.module.css'
/**
 * The compass: a ring with the needle's rhombus pointing north-east, on
 * `currentColor` so each rendering picks its own ink.
 * @param props - rendered size and class.
 * @returns the compass glyph.
 */
export function CompassGlyph({ size = 16, className }: IconProps): VNodeChild {
  return (h('svg', {
    'width': size,
    'height': size,
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'aria-hidden': 'true',
    'class': className,
  }, [
    h('path', {
      'd': 'M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z',
      'stroke': 'currentColor',
    }, []),
    h('path', {
      'd': 'M10.6101 5.39014L8.99014 8.99014L5.39014 10.6101L7.01014 7.01014L10.6101 5.39014Z',
      'fill': 'currentColor',
    }, []),
  ]))
}
/**
 * The cube: an isometric box — hexagonal silhouette, the top face's two edges,
 * and the front seam — in straight strokes with softly rounded joins, on
 * `currentColor`. The guide body draws it in a capsule whose type registered
 * no glyph of its own.
 * @param props - rendered size and class.
 * @returns the cube glyph.
 */
export function CubeGlyph({ size = 16, className }: IconProps): VNodeChild {
  return (h('svg', {
    'width': size,
    'height': size,
    'viewBox': '0 0 16 16',
    'fill': 'none',
    'aria-hidden': 'true',
    'class': className,
  }, [
    h('path', {
      'd': 'M7.99998 2.5L12.9 5.2V10.8L7.99998 13.5L3.09998 10.8V5.2L7.99998 2.5Z',
      'stroke': 'currentColor',
      'strokeLinejoin': 'round',
    }, []),
    h('path', {
      'd': 'M3.09998 5.19995L7.99998 7.89995M7.99998 7.89995L12.9 5.19995M7.99998 7.89995V13.5',
      'stroke': 'currentColor',
      'strokeLinecap': 'round',
      'strokeLinejoin': 'round',
    }, []),
  ]))
}
/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the compass followed by the tab's title text.
 */
export const GuideTitle: DefineSetupFnComponent<PropsRuntime<'sidebar.right.pane.tab.title'>> = defineComponent((props: PropsRuntime<'sidebar.right.pane.tab.title'>) => {
  const info = props.useTabInfo()
  return () => h(Fragment, null, [h(CompassGlyph, { className: css.titleIcon }), info.value.tab.title])
}, { name: 'GuideTitle', props: ['useTabInfo', 'useRemoteAccess', 'useSessions', 'useSessionRetainInfo', 'useSessionAccess', 'usePanelInfo'], inheritAttrs: false })
