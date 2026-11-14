<script setup lang="ts">
import { computed, ref, useAttrs, watch, nextTick, onMounted } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  modelValue?: string
  disabled?: boolean
  autoResize?: boolean
  maxHeight?: number
}>()
const emit = defineEmits<{
  'update:modelValue': [string]
  input: [Event]
}>()
const attrs = useAttrs()
const root = ref<HTMLTextAreaElement | null>(null)
const extra = computed(() => {
  const { class: _class, onInput: _onInput, value: _value, ...rest } = attrs
  return rest
})
const shown = computed(() => String(props.modelValue ?? attrs.value ?? ''))

function resize() {
  if (!props.autoResize || !root.value) return
  const node = root.value
  node.style.height = 'auto'
  const max = props.maxHeight ?? 240
  node.style.height = `${Math.min(node.scrollHeight, max)}px`
  node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden'
}
watch(shown, () => {
  void nextTick(resize)
})
onMounted(resize)
function onInput(event: Event) {
  resize()
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  emit('input', event)
}

defineExpose({
  focus: () => root.value?.focus(),
  scrollIntoView: (options?: ScrollIntoViewOptions) => root.value?.scrollIntoView(options),
})
</script>

<template>
  <textarea
    ref="root"
    :class="['eap-textarea', attrs.class]"
    :disabled="disabled"
    :value="shown"
    v-bind="extra"
    @input="onInput"
  />
</template>

<style src="./field.css"></style>
