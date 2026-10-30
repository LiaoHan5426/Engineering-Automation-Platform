<script setup lang="ts">
/**
 * Authorized file tree shared by the session rail and the composer picker.
 * Stays an app composite: it calls the workspace API, so it is not an @eap/ui primitive.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { runtimeApi, type WorkspaceSource } from '@eap/runtime-client';

const props = withDefaults(defineProps<{ selectable?: boolean; disabled?: boolean; filter?: string }>(), { selectable: false, disabled: false, filter: '' });
const emit = defineEmits<{ select: [source: WorkspaceSource] }>();
const { t, te } = useI18n();

type Entry = { name: string; path: string; directory: boolean };
type Branch = { entries: Entry[]; truncated: boolean; denial: string };

const roots = ref<Entry[]>([]);
const rootMeta = ref({ truncated: false, denial: '' });
const branches = ref<Record<string, Branch>>({});
const expanded = ref<Record<string, boolean>>({});
const loadingPaths = ref<Record<string, boolean>>({});
const source = ref<WorkspaceSource>();
const busy = ref(false);
const error = ref('');
let request = 0;

function describeDenial(code: string) {
  if (!code) return '';
  const key = `desktop.fileDenial.${code}`;
  return te(key) ? t(key) : code;
}

async function fetchBranch(path: string): Promise<Branch> {
  const result = await runtimeApi.workspaceFiles(path);
  return {
    entries: result.entries ?? [],
    truncated: !!result.truncated,
    denial: result.denial ?? '',
  };
}

async function loadRoot() {
  const ticket = ++request;
  busy.value = true;
  error.value = '';
  source.value = undefined;
  try {
    const branch = await fetchBranch('');
    if (ticket !== request) return;
    roots.value = branch.entries;
    rootMeta.value = { truncated: branch.truncated, denial: branch.denial };
    branches.value = { '': branch };
    expanded.value = {};
    error.value = describeDenial(branch.denial);
  } catch {
    if (ticket === request) error.value = t('desktop.fileReadFailed');
  } finally {
    if (ticket === request) busy.value = false;
  }
}

async function toggleDirectory(path: string) {
  if (expanded.value[path]) {
    expanded.value = { ...expanded.value, [path]: false };
    return;
  }
  if (!branches.value[path]) {
    loadingPaths.value = { ...loadingPaths.value, [path]: true };
    error.value = '';
    try {
      const branch = await fetchBranch(path);
      branches.value = { ...branches.value, [path]: branch };
      if (branch.denial) error.value = describeDenial(branch.denial);
    } catch {
      error.value = t('desktop.fileReadFailed');
      return;
    } finally {
      const next = { ...loadingPaths.value };
      delete next[path];
      loadingPaths.value = next;
    }
  }
  expanded.value = { ...expanded.value, [path]: true };
}

async function open(path: string) {
  const ticket = ++request;
  busy.value = true;
  error.value = '';
  try {
    const result = await runtimeApi.workspaceSource(path);
    if (ticket === request) {
      source.value = result;
      error.value = describeDenial(result.denial);
    }
  } catch {
    if (ticket === request) error.value = t('desktop.fileReadFailed');
  } finally {
    if (ticket === request) busy.value = false;
  }
}

type Row = { entry: Entry; depth: number };
const needle = computed(() => props.filter.trim().toLowerCase());
const rows = computed(() => {
  const out: Row[] = [];
  const walk = (entries: Entry[], depth: number) => {
    for (const entry of entries) {
      const match = !needle.value || entry.name.toLowerCase().includes(needle.value) || entry.path.toLowerCase().includes(needle.value);
      const open = entry.directory && expanded.value[entry.path] && branches.value[entry.path] && !branches.value[entry.path]!.denial;
      if (match || open) out.push({ entry, depth });
      if (open) walk(branches.value[entry.path]!.entries, depth + 1);
    }
  };
  walk(roots.value, 0);
  return out;
});

onMounted(() => { void loadRoot(); });
</script>

<template>
  <section class="repository-browser" data-testid="repository-browser">
    <header>
      <strong>{{ t('desktop.repoFiles') }}</strong>
      <button type="button" data-testid="repo-refresh" :disabled="busy" @click="loadRoot">{{ t('desktop.fileRefresh') }}</button>
    </header>
    <p class="hint" data-testid="repo-tree-hint">{{ t('desktop.fileTreeExpandHint') }}</p>
    <p v-if="busy && !roots.length" role="status">{{ t('desktop.fileLoading') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul v-if="roots.length && !rootMeta.denial" class="repo-tree eap-scrollbar" data-testid="repo-tree">
      <li v-for="{ entry, depth } in rows" :key="entry.path" :style="{ '--depth': depth }">
        <button
          v-if="entry.directory"
          type="button"
          class="tree-dir"
          :data-testid="'repo-dir-' + entry.path"
          :aria-expanded="!!expanded[entry.path]"
          :disabled="busy || !!loadingPaths[entry.path]"
          @click="toggleDirectory(entry.path)"
        >
          <span class="caret" aria-hidden="true">{{ loadingPaths[entry.path] ? '…' : expanded[entry.path] ? '▾' : '▸' }}</span>
          <span>{{ entry.name }}</span>
        </button>
        <button
          v-else
          type="button"
          class="tree-file"
          :data-testid="'repo-file-' + entry.path"
          :disabled="busy"
          :aria-pressed="source?.path === entry.path"
          @click="open(entry.path)"
        >
          <span class="caret file" aria-hidden="true">▤</span>
          <span>{{ entry.name }}</span>
        </button>
        <p v-if="entry.directory && expanded[entry.path] && branches[entry.path]?.truncated" class="hint nested">{{ t('desktop.fileTruncated') }}</p>
        <p v-if="entry.directory && expanded[entry.path] && branches[entry.path]?.denial" class="hint nested" role="status">{{ describeDenial(branches[entry.path]!.denial) }}</p>
      </li>
    </ul>
    <p v-if="rootMeta.truncated" class="hint">{{ t('desktop.fileTruncated') }}</p>
    <article v-if="source && !error" data-testid="repo-source">
      <strong>{{ source.path }}</strong>
      <small>SHA-256 · {{ source.baseHash }}</small>
      <pre>{{ source.excerpt }}</pre>
      <button
        v-if="selectable"
        type="button"
        data-testid="reference-workspace-source"
        :disabled="disabled || busy || !source.exists || !source.excerpt || !source.baseHash"
        @click="emit('select', { ...source! })"
      >{{ t('desktop.referenceSource') }}</button>
      <p v-if="selectable" class="hint">{{ t('desktop.referenceSourceHint') }}</p>
    </article>
  </section>
</template>

<style scoped>
.repository-browser{display:grid;gap:10px;min-width:0;min-height:0}
header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
header strong{font-size:13px;color:#243028}
header button{margin-left:auto}
button{border:1px solid #d0dbcd;border-radius:8px;padding:6px 10px;background:#edf2e9;color:#3c6355;cursor:pointer;font:inherit;font-size:12px}
button:disabled{opacity:.55;cursor:default}
button:hover:not(:disabled){background:#e1ebe4}
.repo-tree{margin:0;padding:0;list-style:none;max-height:min(420px,48vh);overflow:auto;border:1px solid #e8ebe3;border-radius:10px;background:#faf9f4}
.repo-tree li{margin:0}
.tree-dir,.tree-file{display:flex;align-items:center;gap:6px;width:100%;text-align:left;background:transparent;border:0;border-radius:0;padding:7px 10px;padding-left:calc(10px + var(--depth) * 14px);color:#243028}
.tree-dir + .tree-file,.tree-file + .tree-dir,.tree-dir + .tree-dir,.tree-file + .tree-file{border-top:1px solid #eef1ea}
.tree-dir:hover:not(:disabled),.tree-file:hover:not(:disabled){background:#e7f3ee;color:#287b6c}
.tree-file[aria-pressed="true"]{background:#e7f3ee;color:#287b6c}
.caret{display:inline-block;width:1em;flex:0 0 auto;color:#7a887f}
.caret.file{color:#9aa69c}
.hint.nested{margin:0;padding:2px 10px 8px;padding-left:calc(26px + var(--depth) * 14px)}
small{display:block;overflow-wrap:anywhere;font-size:10px;color:#778478;margin:8px 0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:min(280px,32vh);overflow:auto;background:#f0f2eb;padding:12px;border-radius:8px;font-size:11px}
.hint{margin:0;font-size:11px;line-height:1.5;color:#778478}
[role=alert]{margin:0;padding:8px 10px;border-radius:8px;background:#fef3f2;border:1px solid #fecdca;color:#b42318;font-size:12px}
</style>
