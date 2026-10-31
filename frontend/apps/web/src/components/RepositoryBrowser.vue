<script setup lang="ts">
import { Button, Tree, type TreeNode } from "@eap/ui";
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

const needle = computed(() => props.filter.trim().toLowerCase());
const nodes = computed(() => {
  function map(entries: Entry[]): TreeNode[] {
    return entries.flatMap(entry => {
      const branch = branches.value[entry.path];
      const isOpen = entry.directory && expanded.value[entry.path] && branch && !branch.denial;
      const match = !needle.value || entry.name.toLowerCase().includes(needle.value) || entry.path.toLowerCase().includes(needle.value);
      if (!match && !isOpen) return [];
      return [{ id: entry.path, label: entry.name, children: entry.directory ? map(branch?.denial ? [] : branch?.entries ?? []) : undefined,
        disabled: busy.value || !!loadingPaths.value[entry.path], testId: `${entry.directory ? 'repo-dir-' : 'repo-file-'}${entry.path}` }];
    });
  }
  return map(roots.value);
});
const expandedKeys = computed(() => Object.keys(expanded.value).filter(key => expanded.value[key]));
function selectNode(node: TreeNode) { if (!node.children) void open(node.id); }

onMounted(() => { void loadRoot(); });
</script>

<template>
  <section class="repository-browser" data-testid="repository-browser">
    <header>
      <strong>{{ t('desktop.repoFiles') }}</strong>
      <Button variant="secondary" size="sm" type="button" data-testid="repo-refresh" :disabled="busy" @click="loadRoot">{{ t('desktop.fileRefresh') }}</Button>
    </header>
    <p class="hint" data-testid="repo-tree-hint">{{ t('desktop.fileTreeExpandHint') }}</p>
    <p v-if="busy && !roots.length" role="status">{{ t('desktop.fileLoading') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <Tree v-if="roots.length && !rootMeta.denial" class="repo-tree eap-scrollbar" data-testid="repo-tree"
      :items="nodes" :label="t('desktop.repoFiles')" :expanded="expandedKeys" :model-value="source?.path" manual-expand
      @select="selectNode" @toggle="node => toggleDirectory(node.id)">
      <template #default="{ node }">
        <span>{{ loadingPaths[node.id] ? '… ' : '' }}{{ node.label }}
          <small v-if="expanded[node.id] && branches[node.id]?.truncated">{{ t('desktop.fileTruncated') }}</small>
          <small v-if="expanded[node.id] && branches[node.id]?.denial" role="status">{{ describeDenial(branches[node.id]!.denial) }}</small>
        </span>
      </template>
    </Tree>
    <p v-if="rootMeta.truncated" class="hint">{{ t('desktop.fileTruncated') }}</p>
    <article v-if="source && !error" data-testid="repo-source">
      <strong>{{ source.path }}</strong>
      <small>SHA-256 · {{ source.baseHash }}</small>
      <pre>{{ source.excerpt }}</pre>
      <Button variant="secondary" size="sm"
        v-if="selectable"
        type="button"
        data-testid="reference-workspace-source"
        :disabled="disabled || busy || !source.exists || !source.excerpt || !source.baseHash"
        @click="emit('select', { ...source! })"
      >{{ t('desktop.referenceSource') }}</Button>
      <p v-if="selectable" class="hint">{{ t('desktop.referenceSourceHint') }}</p>
    </article>
  </section>
</template>

<style scoped>
.repository-browser{display:grid;gap:10px;min-width:0;min-height:0}
header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
header strong{font-size:13px;color:var(--text)}
header button{margin-left:auto}
.repo-tree{margin:0;padding:0;list-style:none;max-height:min(420px,48vh);overflow:auto;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
small{display:block;overflow-wrap:anywhere;font-size:10px;color:var(--text-mute);margin:8px 0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:min(280px,32vh);overflow:auto;background:var(--surface-2);padding:12px;border-radius:8px;font-size:11px}
.hint{margin:0;font-size:11px;line-height:1.5;color:var(--text-mute)}
[role=alert]{margin:0;padding:8px 10px;border-radius:8px;background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger);font-size:12px}
</style>
