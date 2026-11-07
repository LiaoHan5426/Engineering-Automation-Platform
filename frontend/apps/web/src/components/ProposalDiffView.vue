<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffLanguageForPath, loadMonacoDiff, type MonacoDiffBundle } from '../lib/monacoDiff'

const props = withDefaults(
  defineProps<{
    path: string
    before: string | null
    after: string
    beforeLabel?: string
    afterLabel?: string
  }>(),
  {
    beforeLabel: '',
    afterLabel: '',
  },
)

const { t } = useI18n()
const host = ref<HTMLElement | null>(null)
const engine = ref<'loading' | 'monaco' | 'fallback'>('loading')
let bundle: MonacoDiffBundle | null = null
let editor: import('monaco-editor').editor.IStandaloneDiffEditor | null = null

const originalText = () => props.before ?? ''
const modifiedText = () => props.after

function syncEditor() {
  if (!editor || !bundle) return
  bundle.update(editor, {
    original: originalText(),
    modified: modifiedText(),
    language: diffLanguageForPath(props.path),
  })
}

onMounted(async () => {
  bundle = await loadMonacoDiff()
  if (!bundle || !host.value) {
    engine.value = 'fallback'
    return
  }
  try {
    editor = bundle.create(host.value, {
      original: originalText(),
      modified: modifiedText(),
      language: diffLanguageForPath(props.path),
      readOnly: true,
    })
    engine.value = 'monaco'
  } catch {
    engine.value = 'fallback'
  }
})

watch(
  () => [props.path, props.before, props.after] as const,
  () => {
    if (engine.value === 'monaco') syncEditor()
  },
)

onBeforeUnmount(() => {
  if (editor && bundle) {
    bundle.dispose(editor)
    editor = null
  }
})

const resolvedBeforeLabel = () => props.beforeLabel || t('task.before')
const resolvedAfterLabel = () => props.afterLabel || t('task.after')
const newFileLabel = () => t('task.newFile')
</script>

<template>
  <div class="proposal-diff" data-testid="proposal-diff">
    <p v-if="engine === 'fallback'" class="hint" data-testid="diff-fallback-note" role="status">
      {{ t('desktop.diffFallbackNote') }}
    </p>
    <div
      v-show="engine === 'monaco'"
      ref="host"
      class="proposal-diff-monaco"
      data-testid="proposal-diff-monaco"
      :aria-label="path"
    />
    <div
      v-if="engine === 'loading'"
      class="proposal-diff-loading"
      role="status"
      data-testid="proposal-diff-loading"
    >
      {{ t('desktop.fileLoading') }}
    </div>
    <div
      v-if="engine === 'fallback'"
      class="proposal-diff-fallback codex-diff"
      data-testid="proposal-diff-fallback"
    >
      <section>
        <small>{{ resolvedBeforeLabel() }}</small>
        <pre data-testid="diff-before">{{ before ?? newFileLabel() }}</pre>
      </section>
      <section>
        <small>{{ resolvedAfterLabel() }}</small>
        <pre class="added" data-testid="diff-after">{{ after }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.proposal-diff {
  display: grid;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}
.proposal-diff-monaco {
  min-height: min(360px, 42vh);
  height: min(360px, 42vh);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.proposal-diff-loading {
  font-size: 12px;
  color: var(--text-soft);
}
.proposal-diff-fallback pre {
  font-size: 11px;
  white-space: pre-wrap;
  background: var(--danger-bg);
  color: var(--danger);
  max-height: min(280px, 32vh);
  overflow: auto;
}
.proposal-diff-fallback pre.added {
  background: var(--ok-bg);
  color: var(--ok);
}
.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-mute);
}
</style>
