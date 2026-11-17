import { computed, defineComponent, h, shallowReadonly, shallowRef, watchEffect } from 'vue'
import type { ShallowRef } from 'vue'

/**
 * The viewer page's brand row: the sidebar's own mark and name seats carry the share.
 *
 * The page renders the normal client UI, so its identity belongs where every DSH page keeps one —
 * the expanded sidebar's brand row — instead of a floating banner. The mark stays the shipped
 * Harness logo; the name seat becomes the way home and states, compactly, who shared this Session
 * and which DSH built it. The Relay's own release stays a detail on that link rather than a second
 * identifier in the page's chrome.
 *
 * @module @deepseek-ai/dsh-experimental-liveshare/src/client/viewer-brand
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import { identitySubjectLabel } from '../owner-identity.ts'
import { viewerContextFacts } from './viewer-context.ts'
import css from './viewer-brand.module.css'
export const name = 'liveshare-viewer-brand'
/**
 * Registration rank for the viewer's brand seats.
 *
 * `sidebar.brand.mark` and `sidebar.brand.name` are single slots, and a served viewer page mounts the
 * owner's own plugins, so the shipped brand (including `ui-brand-official`, which registers both at
 * the default rank on official builds) is already registered at rank 0. A second registration at that
 * rank fails, so the viewer entry registers below it and shadows the shipped one.
 */
export const VIEWER_BRAND_PRIORITY = -10
/** The slot registry is the only service this plugin reads. */
export const inject: readonly string[] = ['slots']
/** Window global the shell installs for the share this page presents. */
interface ViewerTargetWindow {
  __DSH_LIVESHARE_VIEWER__?: {
    readonly shareId: string
    readonly sessionId: string
    readonly basePath: string
  }
}
/** The page's own read publishes the facts; the seat states whichever have arrived. */
function useViewerContextFacts(): Readonly<
  ShallowRef<ReturnType<typeof viewerContextFacts.getSnapshot>>
> {
  const read = () => viewerContextFacts.getSnapshot()
  const currentRef = shallowRef(read())
  watchEffect((onCleanup) => {
    const refresh = () => {
      currentRef.value = read()
    }
    onCleanup((listener => viewerContextFacts.subscribe(listener))(refresh))
    refresh()
  })
  return shallowReadonly(currentRef)
}
/**
 * Render the mark slot: the shipped Harness logo at the shell's requested size.
 * @param props - Host-supplied mark presentation.
 * @returns the Harness mark.
 */
export const ViewerBrandMark = defineComponent(
  (componentProps: SidebarBrandMarkOwnerProps) => {
    return () => {
      return h(FishLogo, { size: componentProps.size })
    }
  },
  { inheritAttrs: false, props: ['size'] },
)
/**
 * Render the name slot: LiveShare, its owner, and the owner's DSH version, linked to the page's
 * share directory. The Relay's release rides the same link's tooltip so a long identifier stays
 * readable on demand instead of widening the row.
 * @param props - The framework-injected translate seat for this package's copy.
 * @returns the viewer's brand content.
 */
export const ViewerBrandName = defineComponent(
  (componentProps: PropsLocale<typeof NS>) => {
    const targetRef = computed(() => (globalThis as ViewerTargetWindow).__DSH_LIVESHARE_VIEWER__)
    const basePathRef = computed(() => targetRef.value?.basePath ?? '')
    const factsRef = useViewerContextFacts()
    const ownerRef = computed(
      () =>
        factsRef.value.owner ??
        (factsRef.value.ownerSubjectId === undefined
          ? componentProps.t('viewer.picker.ownerUnknown')
          : componentProps.t('viewer.picker.subjectLabel', {
            label: identitySubjectLabel(factsRef.value.ownerSubjectId),
          })),
    )
    const ownerLineRef = computed(() =>
      componentProps.t('viewer.sharedByShort', { owner: ownerRef.value }),
    )
    const versionRef = computed(() =>
      factsRef.value.dshVersion === undefined
        ? undefined
        : // Inline, the chip states the release the owner runs. Build metadata and the Relay's own
      // release stay on the link's tooltip, so a long identifier never widens the row.
        `${componentProps.t('viewer.picker.version')} ${factsRef.value.dshVersion.replace(/\+.*$/u, '')}`,
    )
    const relayRef = computed(() =>
      factsRef.value.relay === undefined
        ? undefined
        : componentProps.t('viewer.relayVersion', { release: factsRef.value.relay }),
    )
    return () => {
      return h(
        'a',
        {
          class: css.brand,
          href: `${basePathRef.value}/`,
          'aria-label': componentProps.t('viewer.home'),
          title: [
            ownerLineRef.value,
            factsRef.value.dshVersion === undefined
              ? undefined
              : `${componentProps.t('viewer.picker.version')} ${factsRef.value.dshVersion}`,
            relayRef.value,
          ]
            .filter(value => value !== undefined)
            .join(' \u00B7 '),
        },
        [
          h('span', { class: css.top }, [
            h('span', { class: css.wordmark }, [componentProps.t('viewer.brand')]),
            versionRef.value === undefined
              ? null
              : h('span', { class: css.version }, [versionRef.value]),
          ]),
          h('span', { class: css.owner }, [ownerLineRef.value]),
        ],
      )
    }
  },
  { inheritAttrs: false, props: ['t'] },
)
/**
 * Fill the sidebar's brand seats with the viewer's own identity.
 * @param ctx - browser context of the viewer's module table.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register(
        { name: 'sidebar.brand.mark', priority: VIEWER_BRAND_PRIORITY },
        ViewerBrandMark,
      )
      yield ctx.slots.register(
        { name: 'sidebar.brand.name', priority: VIEWER_BRAND_PRIORITY, locale: NS },
        ViewerBrandName,
      )
    }),
  )
}
