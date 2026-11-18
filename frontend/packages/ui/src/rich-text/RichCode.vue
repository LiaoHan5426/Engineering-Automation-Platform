<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Button from '../button/Button.vue'
import DOMPurify from 'dompurify'
import { richTextBudget, sanitizeDiagram } from './markdown'
const props = defineProps<{
  source: string
  language?: string
  copyLabel: string
  copiedLabel: string
  failedLabel: string
  renderLabel: string
  sourceLabel: string
  diagramAllowed?: boolean
}>()
const html = ref(''),
  svg = ref(''),
  copied = ref(false),
  failed = ref(false),
  rendering = ref(false)
let version = 0
watch(
  () => [props.source, props.language],
  async () => {
    const current = ++version
    html.value = ''
    svg.value = ''
    failed.value = false
    rendering.value = false
    if (
      !props.language ||
      props.language === 'mermaid' ||
      props.source.length > richTextBudget.code
    )
      return
    try {
      const hljs = (await import('highlight.js/lib/common')).default
      if (current !== version || !hljs.getLanguage(props.language)) return
      html.value = DOMPurify.sanitize(
        hljs.highlight(props.source, { language: props.language, ignoreIllegals: true }).value,
      )
    } catch {
      /* Original code is always available. */
    }
  },
  { immediate: true },
)
async function copy() {
  try {
    await navigator.clipboard.writeText(props.source)
    copied.value = true
    failed.value = false
  } catch {
    failed.value = true
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => {
  version++
  clearTimeout(timer)
})
async function render() {
  if (rendering.value || !props.diagramAllowed || props.source.length > richTextBudget.diagram) {
    failed.value = true
    return
  }
  const current = version
  rendering.value = true
  failed.value = false
  try {
    // Published browser bundle avoids Node-oriented langium/jsonrpc exports during Vite optimization.
    const mermaid = (await import('mermaid/dist/mermaid.esm.min.mjs')).default
    if (current !== version) return
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      maxTextSize: richTextBudget.diagram,
      maxEdges: 200,
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      theme: 'neutral',
    })
    const result = await Promise.race([
      mermaid.render(`eap-diagram-${crypto.randomUUID()}`, props.source),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('budget')), richTextBudget.timeout)
      }),
    ])
    if (current !== version) return
    svg.value = sanitizeDiagram(result.svg)
  } catch (error) {
    console.warn('[RichText] Diagram render failed', error)
    if (current === version) failed.value = true
  } finally {
    clearTimeout(timer)
    if (current === version) rendering.value = false
  }
}
</script>
<template>
  <section class="eap-rich-text__code">
    <div class="eap-rich-text__toolbar">
      <span>{{ language }}</span
      ><Button size="sm" variant="ghost" @click="copy">{{
        copied ? copiedLabel : copyLabel
      }}</Button
      ><Button
        v-if="language === 'mermaid'"
        size="sm"
        variant="ghost"
        :disabled="rendering || !diagramAllowed || source.length > richTextBudget.diagram"
        @click="render"
        >{{ renderLabel }}</Button
      >
    </div>
    <p v-if="failed" role="status">{{ failedLabel }}</p>
    <div v-if="svg" class="eap-rich-text__diagram" v-html="svg" />
    <details v-if="svg">
      <summary>{{ sourceLabel }}</summary>
      <pre><code>{{ source }}</code></pre>
    </details>
    <pre v-else><code v-if="html" v-html="html" /><code v-else>{{ source }}</code></pre>
  </section>
</template>
