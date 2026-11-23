<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ required: true })
const props = defineProps<{
  label: string
  tabs: Array<{ id: string; label: string; testId?: string; domId?: string }>
  /** Id of the tabpanel these tabs control, when the consumer renders one. */
  panelId?: string
}>()
const attrs = useAttrs()
const extra = computed(() => {
  const {
    class: _class,
    role: _role,
    'aria-label': _label,
    onKeydown: _keydown,
    ...rest
  } = attrs
  return rest
})
const tabRefs = ref<HTMLButtonElement[]>([])

/**
 * WAI-ARIA tabs: selection follows focus with Arrow/Home/End and only the
 * selected tab is in the tab sequence. Consumers that render a tabpanel pass
 * domId/panelId so aria-controls and aria-labelledby stay wired.
 */
function onKeydown(event: KeyboardEvent) {
  const count = props.tabs.length
  const index = props.tabs.findIndex((tab) => tab.id === model.value)
  if (index < 0 || !count) return
  let next: number | null = null
  if (event.key === 'ArrowRight') next = (index + 1) % count
  else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  const targetIndex = next
  const target = props.tabs[targetIndex]
  if (!target) return
  event.preventDefault()
  model.value = target.id
  queueMicrotask(() => tabRefs.value[targetIndex]?.focus())
}
</script>

<template>
  <div
    v-bind="extra"
    :class="['eap-tabs', attrs.class]"
    role="tablist"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <button
      v-for="tab in tabs"
      :id="tab.domId"
      :key="tab.id"
      ref="tabRefs"
      type="button"
      class="eap-tabs__tab"
      role="tab"
      :data-testid="tab.testId"
      :aria-selected="model === tab.id"
      :aria-controls="panelId"
      :tabindex="model === tab.id ? 0 : -1"
      @click="model = tab.id"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style src="./tabs.css"></style>
