<script setup lang="ts">
import { Button } from '@eap/ui'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Layout from './Layout.vue'
import LayoutAside from './LayoutAside.vue'
import LayoutContent from './LayoutContent.vue'
import LayoutHeader from './LayoutHeader.vue'
import './frame.css'
import './workbench.css'

const props = defineProps<{
  fullSurface?: boolean
  editor?: boolean
  bodyClass?: string | Record<string, boolean>
  rightId?: string
  rightSeated?: boolean
  rightCollapsed?: boolean
  rightLabel?: string
  outletsClass?: string
  rightAttrs?: Record<string, unknown>
  closeRightLabel: string
  escapeSuspended?: boolean
}>()
const emit = defineEmits<{ closeRight: []; escape: [event: KeyboardEvent] }>()

const rightPanel = ref<InstanceType<typeof LayoutAside>>()
const narrow = ref(false)
const rightOverlay = computed(() => narrow.value && props.rightSeated && !props.rightCollapsed)
let focusReturn: HTMLElement | null = null
let detachMedia: (() => void) | undefined

watch(rightOverlay, async (open) => {
  if (open && document.activeElement instanceof HTMLElement) focusReturn = document.activeElement
  await nextTick()
  if (open !== rightOverlay.value) return
  if (open) {
    if (!props.escapeSuspended) rightPanel.value?.focus()
  } else {
    if (!props.escapeSuspended && focusReturn?.isConnected) focusReturn.focus()
    focusReturn = null
  }
})

function handleKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || props.escapeSuspended) return
  if (rightOverlay.value) {
    emit('closeRight')
  } else {
    emit('escape', event)
  }
}

onMounted(() => {
  const query = window.matchMedia('(max-width: 1024px)')
  const sync = () => {
    narrow.value = query.matches
  }
  sync()
  query.addEventListener('change', sync)
  detachMedia = () => query.removeEventListener('change', sync)
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => {
  detachMedia?.()
  window.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <Layout
    class="app eap-workbench-frame"
    :data-layout-right-narrow="narrow || undefined"
    :data-layout-full-surface="fullSurface || undefined"
    :data-layout-no-topbar="!$slots.topbar || undefined"
    :data-layout-has-status="Boolean($slots.status) || undefined"
  >
    <slot name="overlays" />
    <LayoutHeader v-if="$slots.topbar" class="topbar">
      <slot name="topbar" :right-overlay="rightOverlay" :right-narrow="narrow" />
    </LayoutHeader>
    <slot name="notice" />

    <Layout
      direction="horizontal"
      class="body"
      :class="[bodyClass, { 'body--editor': editor }]"
      :data-layout-no-navigation="!$slots.navigation || undefined"
    >
      <div
        v-if="$slots.surface"
        v-show="fullSurface"
        data-layout-surface
        :inert="rightOverlay || undefined"
      >
        <slot name="surface" />
      </div>
      <slot name="navigation" :inert="rightOverlay || undefined" />
      <slot name="before-main" />
      <LayoutContent class="workbench" :inert="rightOverlay || undefined">
        <slot />
      </LayoutContent>
      <div v-if="$slots.outlets" :class="outletsClass" data-layout-auxiliary>
        <slot name="outlets" />
      </div>
      <Button
        v-if="rightOverlay"
        variant="backdrop"
        type="button"
        class="layout-sidebar-backdrop"
        data-layout-auxiliary
        data-testid="layout-sidebar-right-backdrop"
        :aria-label="closeRightLabel"
        @click="emit('closeRight')"
      />
      <LayoutAside
        v-if="rightId || $slots.right"
        :id="rightId"
        ref="rightPanel"
        v-bind="rightAttrs"
        data-layout-right
        :data-sidebar-right-seat="rightSeated || undefined"
        :data-collapsed="rightCollapsed || undefined"
        :hidden="!rightSeated"
        :tabindex="rightOverlay ? -1 : undefined"
        :role="rightOverlay ? 'dialog' : undefined"
        :aria-modal="rightOverlay ? 'true' : undefined"
        :aria-label="rightLabel"
      >
        <slot name="right" />
      </LayoutAside>
      <slot name="inspector" />
    </Layout>

    <slot name="status" />
  </Layout>
</template>
