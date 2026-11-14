<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { markdownBlocks, richTextBudget, sanitizeMarkup, type RichBlock } from './markdown'
import RichCode from './RichCode.vue'
import 'katex/dist/katex.min.css'
const props = defineProps<{
  source: string
  copyLabel: string
  copiedLabel: string
  failedLabel: string
  renderLabel: string
  sourceLabel: string
}>()
const blocks = ref<RichBlock[]>([])
let version = 0,
  timer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.source,
  () => {
    const current = ++version
    clearTimeout(timer)
    timer = setTimeout(async () => {
      try {
        const result = await markdownBlocks(props.source)
        for (const block of result)
          if (block.kind === 'math') {
            try {
              const katex = (await import('katex')).default
              block.text = sanitizeMarkup(
                katex.renderToString(block.text, {
                  displayMode: true,
                  throwOnError: false,
                  trust: false,
                  strict: 'error',
                  maxExpand: 200,
                  maxSize: 10,
                }),
              )
              block.kind = 'html'
            } catch {
              block.kind = 'code'
            }
          }
        if (current === version) blocks.value = result
      } catch {
        if (current === version) blocks.value = [{ kind: 'code', text: props.source }]
      }
    }, richTextBudget.refresh)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  version++
  clearTimeout(timer)
})
</script>
<template>
  <div class="eap-rich-text">
    <template v-for="(block, index) in blocks" :key="index">
      <div v-if="block.kind === 'html'" v-html="block.text" />
      <RichCode
        v-else
        :source="block.text"
        :language="block.language"
        :diagram-allowed="
          blocks.slice(0, index).filter((b) => b.language === 'mermaid').length <
          richTextBudget.diagrams
        "
        :copy-label="copyLabel"
        :copied-label="copiedLabel"
        :failed-label="failedLabel"
        :render-label="renderLabel"
        :source-label="sourceLabel"
      />
    </template>
    <pre v-if="!blocks.length" class="eap-rich-text__pending">{{ source }}</pre>
  </div>
</template>
<style src="./rich-text.css"></style>
