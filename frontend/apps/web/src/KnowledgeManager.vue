<script setup lang="ts">
import { ref, onMounted } from "vue";
import { runtimeApi } from "./api";
import { errorMessage } from "./presentation";
const filter = ref("");
function confirmDiscard() {
  return (
    !composing.value ||
    (!title.value.trim() && !content.value.trim()) ||
    window.confirm("文档尚未保存，是否放弃本次编辑？")
  );
}
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
async function load() {
  bases.value = (await runtimeApi.knowledgeBases()).items;
}
async function select(id: string) {
  if (id !== selected.value && !confirmDiscard()) return;
  const result = await runtimeApi.knowledgeDocuments(id);
  selected.value = id;
  activeDocument.value = null;
  composing.value = false;
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
        <button
          class="eap-button eap-button--primary"
          :disabled="busy"
          @click="creating = !creating"
        >
          ＋ 新建
        </button>
      </div>
      <form v-if="creating" @submit.prevent="create">
        <label>名称<input v-model="name" class="workspace-input" required /></label
        ><label>说明<input v-model="description" class="workspace-input" /></label
        ><button class="eap-button eap-button--primary" :disabled="busy || !name.trim()">
          创建</button
        ><button type="button" class="eap-button" @click="creating = false">取消</button>
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
        @click="action(() => select(base.id))"
      >
        <strong>{{ base.name }}</strong
        ><small>{{ base.documents }} 篇文档 · {{ base.description || "暂无说明" }}</small>
      </button>
      <p v-if="!bases.length && !busy" class="empty-state">
        还没有知识库，创建后即可录入业务知识。
      </p>
    </aside>
    <div class="eap-panel">
      <div class="manager-toolbar">
        <h2>{{ bases.find((b) => b.id === selected)?.name || "知识工作台" }}</h2>
        <button
          v-if="selected && tab === 'documents'"
          class="eap-button eap-button--primary"
          :disabled="busy"
          @click="
            composing = true;
            activeDocument = null;
          "
        >
          ＋ 录入文档
        </button>
      </div>
      <div class="manager-tabs">
        <button :class="{ active: tab === 'documents' }" @click="tab = 'documents'">文档</button
        ><button :class="{ active: tab === 'search' }" @click="tab = 'search'">全库检索</button>
      </div>
      <p v-if="message" class="feedback" role="status">{{ message }}</p>
      <p v-if="busy" role="status">正在处理…</p>
      <template v-if="tab === 'documents'">
        <p v-if="!selected" class="empty-state">从左侧选择知识库，查看文档或录入新知识。</p>
        <form v-else-if="composing" @submit.prevent="add">
          <h3>录入知识文档</h3>
          <label>标题<input v-model="title" class="workspace-input" required /></label
          ><label
            >正文<textarea
              v-model="content"
              class="workspace-input"
              rows="12"
              required
              placeholder="表结构说明、业务规则或已验证优化案例"
            ></textarea></label
          ><button
            class="eap-button eap-button--primary"
            :disabled="busy || !title.trim() || !content.trim()"
          >
            保存文档</button
          ><button
            type="button"
            class="eap-button"
            @click="confirmDiscard() && (composing = false)"
          >
            取消
          </button>
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
              <p v-if="!documents.length" class="empty-state">暂无文档，点击录入文档添加知识。</p>
            </div>
            <article v-if="activeDocument">
              <h3>{{ activeDocument.title }}</h3>
              <pre class="document-content">{{ activeDocument.content }}</pre>
            </article>
            <p v-else-if="documents.length" class="empty-state">选择文档查看正文。</p>
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
          /><button class="eap-button eap-button--primary" :disabled="busy || !query.trim()">
            检索
          </button>
        </form>
        <p v-if="searched && !matches.length && !busy" class="empty-state">
          未找到匹配内容，请调整关键词。
        </p>
        <article v-for="(match, index) in matches" :key="index" class="observation">
          <strong>{{ match.source }}</strong>
          <p>{{ match.excerpt }}</p>
        </article>
        <small>当前使用全文检索，尚未启用向量检索。</small></template
      >
    </div>
  </section>
</template>
