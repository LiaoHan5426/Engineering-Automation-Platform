<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Button from '../button/Button.vue'
import Drawer from '../drawer/Drawer.vue'
import Splitter from '../splitter/Splitter.vue'

defineProps<{
  resourcesLabel: string
  inspectorLabel: string
  resizeLabel: string
  closeLabel: string
}>()
const root = ref<HTMLElement>()
const compact = ref(false)
const resourcesOpen = ref(true)
const inspectorOpen = ref(true)
const resourcesSize = ref(20)
const canvasSize = ref(72)
let observer: ResizeObserver | undefined
function measure() {
  const width = root.value?.clientWidth
  if (!width) return
  const next = width < 1080
  if (next !== compact.value) {
    resourcesOpen.value = !next
    inspectorOpen.value = !next
    compact.value = next
  }
}
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    if (root.value) observer.observe(root.value)
  }
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
function showInspector() {
  if (compact.value) resourcesOpen.value = false
  inspectorOpen.value = true
}
function showResources() {
  if (compact.value) inspectorOpen.value = false
  resourcesOpen.value = true
}
defineExpose({ showInspector, showResources })
</script>
<template>
  <section
    ref="root"
    class="eap-editor-workbench"
    :class="{
      'eap-editor-workbench--compact': compact,
      'eap-editor-workbench--collapsedresources': compact || !resourcesOpen,
      'eap-editor-workbench--collapsedinspector': compact || !inspectorOpen,
    }"
  >
    <header class="eap-editor-workbench__header"><slot name="header" /></header>
    <nav class="eap-editor-workbench__tools">
      <Button
        size="sm"
        :active="resourcesOpen"
        :aria-expanded="resourcesOpen"
        @click="resourcesOpen = !resourcesOpen"
        >{{ resourcesLabel }}</Button
      >
      <div class="eap-editor-workbench__toolbar"><slot name="toolbar" /></div>
      <Button
        size="sm"
        :active="inspectorOpen"
        :aria-expanded="inspectorOpen"
        @click="inspectorOpen = !inspectorOpen"
        >{{ inspectorLabel }}</Button
      >
    </nav>
    <Splitter
      v-model="resourcesSize"
      class="eap-editor-workbench__outer"
      :label="resizeLabel"
      :min="15"
      :max="32"
    >
      <template #start>
        <aside
          v-if="!compact && resourcesOpen"
          class="eap-editor-workbench__side"
          :aria-label="resourcesLabel"
        >
          <slot name="resources" />
        </aside>
      </template>
      <template #end>
        <Splitter
          v-model="canvasSize"
          class="eap-editor-workbench__inner"
          :label="resizeLabel"
          :min="50"
          :max="78"
        >
          <template #start
            ><div class="eap-editor-workbench__canvas"><slot /></div
          ></template>
          <template #end
            ><aside
              v-if="!compact && inspectorOpen"
              class="eap-editor-workbench__side"
              :aria-label="inspectorLabel"
            >
              <slot name="inspector" /></aside
          ></template>
        </Splitter>
      </template>
    </Splitter>
    <footer v-if="$slots.status" class="eap-editor-workbench__status">
      <slot name="status" />
    </footer>
    <Drawer
      v-if="compact && resourcesOpen"
      :title="resourcesLabel"
      side="start"
      :close-label="closeLabel"
      @close="resourcesOpen = false"
      ><div class="eap-editor-workbench__drawer"><slot name="resources" /></div
    ></Drawer>
    <Drawer
      v-if="compact && inspectorOpen"
      :title="inspectorLabel"
      :close-label="closeLabel"
      @close="inspectorOpen = false"
      ><div class="eap-editor-workbench__drawer"><slot name="inspector" /></div
    ></Drawer>
    <slot name="overlay" />
  </section>
</template>
<style src="./editor-workbench.css"></style>
