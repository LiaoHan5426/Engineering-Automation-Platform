<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import InlineNodes from './InlineNodes'
import { parseMarkdown } from './markdown'

const props = withDefaults(
  defineProps<{
    /** Raw Markdown text. Safe to pass streaming, half-written output. */
    source: string
    copyLabel?: string
    copiedLabel?: string
    /** Shown while a fenced block has no closing fence yet (streaming). */
    streamingLabel?: string
  }>(),
  {
    copyLabel: '复制',
    copiedLabel: '已复制',
    streamingLabel: '',
  },
)

const blocks = computed(() => parseMarkdown(props.source))
const copiedIndex = ref(-1)
let resetTimer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => {
  if (resetTimer) clearTimeout(resetTimer)
})

async function copy(value: string, index: number) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // Clipboard API is unavailable outside a secure context (and in some tests).
    const holder = document.createElement('textarea')
    holder.value = value
    holder.setAttribute('readonly', '')
    holder.style.position = 'fixed'
    holder.style.opacity = '0'
    document.body.append(holder)
    holder.select()
    try {
      document.execCommand('copy')
    } catch {
      document.body.removeChild(holder)
      return
    }
    document.body.removeChild(holder)
  }
  copiedIndex.value = index
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copiedIndex.value = -1
  }, 1500)
}
</script>

<template>
  <div class="eap-rich-text">
    <template v-for="(block, index) in blocks" :key="index">
      <p v-if="block.type === 'paragraph'" class="eap-rich-text__paragraph">
        <InlineNodes :nodes="block.children" />
      </p>

      <div
        v-else-if="block.type === 'heading'"
        class="eap-rich-text__heading"
        role="heading"
        :aria-level="block.level"
        :data-level="block.level"
      >
        <InlineNodes :nodes="block.children" />
      </div>

      <div v-else-if="block.type === 'code'" class="eap-rich-text__block">
        <div class="eap-rich-text__toolbar">
          <span class="eap-rich-text__lang">{{ block.lang || 'text' }}</span>
          <span v-if="block.open && streamingLabel" class="eap-rich-text__streaming">
            {{ streamingLabel }}
          </span>
          <button
            type="button"
            class="eap-rich-text__copy"
            data-testid="rich-text-copy"
            @click="copy(block.value, index)"
          >
            {{ copiedIndex === index ? copiedLabel : copyLabel }}
          </button>
        </div>
        <pre class="eap-rich-text__pre"><code>{{ block.value }}</code></pre>
      </div>

      <ol v-else-if="block.type === 'list' && block.ordered" :start="block.start">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <InlineNodes :nodes="item" />
        </li>
      </ol>

      <ul v-else-if="block.type === 'list'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <InlineNodes :nodes="item" />
        </li>
      </ul>

      <blockquote v-else-if="block.type === 'quote'" class="eap-rich-text__quote">
        <InlineNodes :nodes="block.children" />
      </blockquote>

      <div v-else-if="block.type === 'table'" class="eap-rich-text__scroller">
        <table class="eap-rich-text__table">
          <thead>
            <tr>
              <th v-for="(cell, cellIndex) in block.header" :key="cellIndex">
                <InlineNodes :nodes="cell" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                <InlineNodes :nodes="cell" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr v-else-if="block.type === 'divider'" class="eap-rich-text__divider" />
    </template>
  </div>
</template>

<style src="./rich-text.css"></style>
