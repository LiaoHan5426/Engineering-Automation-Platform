<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { runtimeApi } from "@eap/runtime-client";
import { ConfirmBox, Feedback, Button, EmptyState } from "@eap/ui";
import { errorMessage } from "../../lib/presentation";
const filter = ref("");
const bases = ref<Array<{ id: string; name: string; description: string; documents: number }>>([]);
const documents = ref<Array<{ id: string; title: string; content: string }>>([]);
const selected = ref(""),
  name = ref(""),
  description = ref(""),
  title = ref(""),
  content = ref(""),
  query = ref(""),
  message = ref("");
const matches = ref<Array<{ source: string; excerpt: string }>>([]);
const busy = ref(false);
const creating = ref(false),
  composing = ref(false),
  tab = ref("documents"),
  searched = ref(false);
const activeDocument = ref<{ id: string; title: string; content: string } | null>(null);
const emit = defineEmits<{ saved: [] }>();
const currentBase = computed(() => bases.value.find((base) => base.id === selected.value));

/* ---- 未保存的文档草稿：切换上下文前先问，而不是 window.confirm ---- */
const discardOpen = ref(false);
const pendingSelect = ref("");
const hasDraft = () => composing.value && !!(title.value.trim() || content.value.trim());
async function requestSelect(id: string) {
  if (id === selected.value) return;
  if (hasDraft()) {
    // 记住操作者本来想去哪：确认框确认的是这次跳转，而不是一个无来由的「确定」。
    pendingSelect.value = id;
    discardOpen.value = true;
    return;
  }
  await select(id);
}
async function confirmDiscard() {
  discardOpen.value = false;
  const target = pendingSelect.value;
  pendingSelect.value = "";
  composing.value = false;
  title.value = "";
  content.value = "";
  if (target) await select(target);
  else message.value = "已放弃本次未保存的编辑，正文没有写入任何知识库。";
}
/** 命中的那一句就是操作者真正会丢掉的东西，所以它必须被说出来。 */
const draftPreview = computed(() => (title.value.trim() || content.value.trim()).slice(0, 60));
const discardImpact = computed(() => {
  const lines = ["正文尚未提交，确认后这段内容不会进入任何知识库。"];
  if (draftPreview.value) lines.push(`当前草稿：${draftPreview.value}`);
  lines.push(
    pendingSelect.value ? "确认后会切换到另一个知识库；不确认就留在本页。" : "确认后停留在本页。",
  );
  return lines;
});

/* ---- 改名 / 说明：编辑走表单，表单可脏 ---- */
const editing = ref(false);
const editName = ref("");
const editDescription = ref("");
const renameDirty = computed(() => {
  const base = currentBase.value;
  if (!base || !editing.value) return false;
  return editName.value.trim() !== base.name || editDescription.value !== (base.description ?? "");
});
function startRename() {
  const base = currentBase.value;
  if (!base) return;
  editName.value = base.name;
  editDescription.value = base.description ?? "";
  editing.value = true;
  message.value = "";
}
async function renameBase() {
  await action(async () => {
    await runtimeApi.renameKnowledgeBase(selected.value, editName.value, editDescription.value);
    await load();
    editing.value = false;
    message.value = "名称与说明已更新；文档本身没有被改动。";
    emit("saved");
  });
}

/* ---- 删除知识库：模态列出影响，后端拒绝时按钮留在原位但禁用 ---- */
const deleteOpen = ref(false);
const deleteRefusal = ref("");
const deleteImpact = computed(() => {
  const base = currentBase.value;
  return [
    `「${base?.name ?? selected.value}」下的 ${documents.value.length} 篇文档会连同分段一起删除，无法恢复。`,
    "若仍被某个已启用的专家引用，后端会拒绝这次删除并点名该专家——引用关系要先解除。",
    "已产生的任务结果不会被改写；重新运行时会少掉这一路知识来源。",
  ];
});
async function deleteBase() {
  await action(async () => {
    deleteRefusal.value = "";
    try {
      await runtimeApi.deleteKnowledgeBase(selected.value);
    } catch (cause) {
      // 保留对话框与确认按钮，把原因写在旁边：控件不消失，才解释得清。
      deleteRefusal.value = errorMessage(cause);
      return;
    }
    selected.value = "";
    documents.value = [];
    activeDocument.value = null;
    deleteOpen.value = false;
    await load();
    message.value = "知识库已删除。";
    emit("saved");
  });
}

/* ---- 删除文档：同上，但影响范围是这一篇 ---- */
const documentDeleteId = ref("");
const documentDeleteRefusal = ref("");
const documentDeleteTarget = computed(() =>
  documents.value.find((doc) => doc.id === documentDeleteId.value),
);
const documentDeleteImpact = computed(() => [
  `《${documentDeleteTarget.value?.title ?? ""}》连同它的全部分段会被删除，无法恢复。`,
  "引用了它的判定不会自动重算；要看到新结果需要重新运行任务。",
  "这一步不会改动规则包，也不会抹掉已经产生的发现。",
]);
async function deleteDocument() {
  await action(async () => {
    documentDeleteRefusal.value = "";
    const target = documentDeleteTarget.value;
    try {
      await runtimeApi.deleteKnowledgeDocument(selected.value, documentDeleteId.value);
    } catch (cause) {
      documentDeleteRefusal.value = errorMessage(cause);
      return;
    }
    if (activeDocument.value?.id === documentDeleteId.value) activeDocument.value = null;
    documentDeleteId.value = "";
    await select(selected.value);
    message.value = `《${target?.title ?? "文档"}》已删除，其分段一并移除。`;
    emit("saved");
  });
}

async function load() {
  bases.value = (await runtimeApi.knowledgeBases()).items;
}
async function select(id: string) {
  const result = await runtimeApi.knowledgeDocuments(id);
  selected.value = id;
  activeDocument.value = null;
  composing.value = false;
  editing.value = false;
  documents.value = result.items;
}
async function action(work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  message.value = "";
  try {
    await work();
  } catch (e) {
    message.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function create() {
  await action(async () => {
    const result = await runtimeApi.createKnowledgeBase(name.value, description.value);
    await load();
    await select(result.id);
    name.value = "";
    description.value = "";
    creating.value = false;
    message.value = "知识库已创建";
  });
}
async function add() {
  await action(async () => {
    await runtimeApi.addKnowledgeDocument(selected.value, title.value, content.value);
    await select(selected.value);
    await load();
    title.value = "";
    content.value = "";
    composing.value = false;
    message.value = "文档已分段并保存，可用于全文检索";
  });
}
async function search() {
  await action(async () => {
    matches.value = (await runtimeApi.searchKnowledge(query.value)).items;
    searched.value = true;
  });
}
onMounted(() => action(load));
defineExpose({
  refresh: () =>
    action(async () => {
      await load();
      if (selected.value)
        documents.value = (await runtimeApi.knowledgeDocuments(selected.value)).items;
    }),
});
</script>
<template>
  <section class="manager-workspace">
    <aside class="eap-panel manager-list">
      <div class="manager-toolbar">
        <h2>知识库</h2>
        <Button variant="primary" :disabled="busy" @click="creating = !creating"> ＋ 新建 </Button>
      </div>
      <form v-if="creating" @submit.prevent="create">
        <label>名称<input v-model="name" class="workspace-input" required /></label
        ><label>说明<input v-model="description" class="workspace-input" /></label
        ><Button variant="primary" :disabled="busy || !name.trim()"> 创建</Button
        ><Button variant="secondary" type="button" @click="creating = false">取消</Button>
      </form>
      <input
        v-model="filter"
        class="workspace-input"
        placeholder="搜索知识库"
        aria-label="搜索知识库"
      /><button
        v-for="base in bases.filter((base) =>
          (base.name + base.description).toLowerCase().includes(filter.toLowerCase()),
        )"
        :key="base.id"
        class="manager-item"
        :class="{ active: selected === base.id }"
        :disabled="busy"
        @click="action(() => requestSelect(base.id))"
      >
        <strong>{{ base.name }}</strong
        ><small>{{ base.documents }} 篇文档 · {{ base.description || "暂无说明" }}</small>
      </button>
      <EmptyState v-if="!bases.length && !busy">
        还没有知识库，创建后即可录入业务知识。
      </EmptyState>
    </aside>
    <div class="eap-panel">
      <div class="manager-toolbar">
        <div>
          <h2>{{ currentBase?.name || "知识工作台" }}</h2>
          <small v-if="selected">{{ currentBase?.description || "暂无说明" }}</small>
        </div>
        <div class="form-actions">
          <Button
            variant="secondary"
            v-if="selected"
            :disabled="busy || composing"
            @click="editing ? (editing = false) : startRename()"
          >
            {{ editing ? "取消改名" : "编辑名称与说明" }}
          </Button>
          <Button
            variant="danger"
            v-if="selected"
            :disabled="busy || renameDirty"
            @click="deleteOpen = true"
          >
            删除知识库
          </Button>
          <Button
            variant="primary"
            v-if="selected && tab === 'documents'"
            :disabled="busy"
            @click="
              composing = true;
              editing = false;
              activeDocument = null;
            "
          >
            ＋ 录入文档
          </Button>
        </div>
      </div>
      <div class="manager-tabs">
        <button :class="{ active: tab === 'documents' }" @click="tab = 'documents'">文档</button
        ><button :class="{ active: tab === 'search' }" @click="tab = 'search'">全库检索</button>
      </div>
      <Feedback v-if="message">{{ message }}</Feedback>
      <p v-if="busy" role="status">正在处理…</p>

      <form v-if="editing && selected" class="pack-form" @submit.prevent="renameBase">
        <p class="hint">
          名称与说明只影响这个知识库在控制台里的样子：它被哪些专家引用、检索来源怎么标注，都读这里。
          改名不会移动或重写任何文档正文。
        </p>
        <label
          >名称<input v-model="editName" class="workspace-input" required maxlength="200" /></label
        ><label>说明<input v-model="editDescription" class="workspace-input" /></label>
        <div class="form-actions">
          <Button variant="primary" :disabled="busy || !editName.trim() || !renameDirty">
            保存
          </Button>
          <Button variant="secondary" type="button" :disabled="busy" @click="editing = false">
            取消
          </Button>
          <span v-if="renameDirty" class="hint">有未保存的修改。</span>
        </div>
      </form>

      <template v-if="tab === 'documents'">
        <EmptyState v-if="!selected">从左侧选择知识库，查看文档或录入新知识。</EmptyState>
        <form v-else-if="composing" @submit.prevent="add">
          <h3>录入知识文档</h3>
          <p class="hint">
            正文会按 1500 字符切分成段后入库，检索命中的是段而不是整篇。含密码、Token
            或连接串的正文会被后端拒绝。
          </p>
          <label>标题<input v-model="title" class="workspace-input" required /></label
          ><label
            >正文<textarea
              v-model="content"
              class="workspace-input"
              rows="12"
              required
              placeholder="表结构说明、业务规则或已验证优化案例"
            ></textarea></label
          ><Button variant="primary" :disabled="busy || !title.trim() || !content.trim()">
            保存文档</Button
          ><Button variant="secondary" type="button" @click="requestSelect('')">取消</Button>
        </form>
        <template v-else-if="selected"
          ><div class="document-grid">
            <div>
              <button
                v-for="doc in documents"
                :key="doc.id"
                class="manager-item"
                :class="{ active: activeDocument?.id === doc.id }"
                @click="activeDocument = doc"
              >
                <strong>{{ doc.title }}</strong
                ><small>{{ doc.content?.length || 0 }} 字符</small>
              </button>
              <EmptyState v-if="!documents.length">暂无文档，点击录入文档添加知识。</EmptyState>
            </div>
            <article v-if="activeDocument">
              <div class="result-heading">
                <h3>{{ activeDocument.title }}</h3>
                <Button
                  variant="danger"
                  :disabled="busy"
                  @click="documentDeleteId = activeDocument.id"
                >
                  删除文档
                </Button>
              </div>
              <pre class="document-content">{{ activeDocument.content }}</pre>
              <p class="hint">
                正文是分段的拼接结果：检索命中的是段，所以这里看到的是全部段按顺序拼起来的样子。
              </p>
            </article>
            <EmptyState v-else-if="documents.length">选择文档查看正文。</EmptyState>
          </div></template
        >
      </template>
      <template v-else
        ><form class="manager-toolbar" @submit.prevent="search">
          <input
            v-model="query"
            class="workspace-input"
            aria-label="检索关键词"
            placeholder="检索全部知识库中的关键词"
          /><Button variant="primary" :disabled="busy || !query.trim()"> 检索 </Button>
        </form>
        <EmptyState v-if="searched && !matches.length && !busy">
          未找到匹配内容，请调整关键词。
        </EmptyState>
        <article v-for="(match, index) in matches" :key="index" class="observation">
          <strong>{{ match.source }}</strong>
          <p>{{ match.excerpt }}</p>
        </article>
        <small>当前使用全文检索，尚未启用向量检索。</small></template
      >
    </div>

    <ConfirmBox
      v-if="discardOpen"
      title="放弃未保存的文档？"
      :impact="discardImpact"
      confirm-label="放弃修改"
      danger
      :busy="busy"
      @confirm="confirmDiscard"
      @cancel="
        discardOpen = false;
        pendingSelect = '';
      "
    />
    <ConfirmBox
      v-if="deleteOpen && selected"
      :title="`删除知识库「${currentBase?.name ?? selected}」？`"
      :impact="deleteImpact"
      confirm-label="删除知识库"
      danger
      :busy="busy"
      :refusal="deleteRefusal"
      @confirm="deleteBase"
      @cancel="
        deleteOpen = false;
        deleteRefusal = '';
      "
    />
    <ConfirmBox
      v-if="documentDeleteId"
      :title="`删除文档《${documentDeleteTarget?.title ?? ''}》？`"
      :impact="documentDeleteImpact"
      confirm-label="删除文档"
      danger
      :busy="busy"
      :refusal="documentDeleteRefusal"
      @confirm="deleteDocument"
      @cancel="
        documentDeleteId = '';
        documentDeleteRefusal = '';
      "
    />
  </section>
</template>
