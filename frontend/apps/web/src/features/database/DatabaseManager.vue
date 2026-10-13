<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { runtimeApi } from "@eap/runtime-client";
import { ConfirmBox, EmptyState, Feedback, Button } from "@eap/ui";
import { errorMessage } from "../../lib/presentation";
type Column = { name: string; type: string; nullable: boolean };
type Table = { name: string; columns: Column[] };
type Index = { name: string; table: string; columns: string[]; unique: boolean };
const emit = defineEmits<{ saved: [] }>();
const items = ref<Array<{ id: string; label: string; engine: string; environment: string }>>([]);
const id = ref<string | null>(null),
  label = ref(""),
  engine = ref("PostgreSQL"),
  environment = ref("local"),
  filter = ref(""),
  message = ref(""),
  busy = ref(false),
  editing = ref(false);
const tables = ref<Table[]>([]),
  indexes = ref<Index[]>([]),
  extra = ref<Record<string, unknown>>({}),
  baseline = ref("");
function profile() {
  return {
    label: label.value,
    engine: engine.value,
    environment: environment.value,
    metadata: { ...extra.value, tables: tables.value, indexes: indexes.value },
  };
}
const dirty = computed(() => editing.value && JSON.stringify(profile()) !== baseline.value);
/**
 * 离开编辑器前不静默丢弃草稿，也不用 `window.confirm`：它阻塞页面、无法被行为断言，
 * 而且说不清「丢掉的到底是哪一版」。这里改为拒绝离开，并把「保存 / 放弃」两个选择放在页面上。
 */
function guardLeave() {
  if (!dirty.value) return true;
  message.value = "资料有未保存修改：请先「保存资料」，或点「放弃修改」明确丢弃这一版。";
  return false;
}
const deleteOpen = ref(false);
const deleteRefusal = ref("");
/** 删除要列的是后果，不是动词：哪份资料、还剩几张表结构快照、谁在引用它。 */
const deleteImpact = computed(() => [
  `「${label.value || id.value}」登记的 ${tables.value.length} 张表结构与 ${indexes.value.length} 条索引会一并删除，无法恢复。`,
  "若仍被某个已启用的专家引用，后端会拒绝这次删除并点名该专家。",
  "删除不会改动任何规则包或专家定义；引用它的专家需要重新选择资料后才能启用。",
]);
async function askDelete() {
  if (!id.value || busy.value) return;
  deleteRefusal.value = "";
  deleteOpen.value = true;
}
async function refresh() {
  try {
    items.value = (await runtimeApi.databases()).items;
  } catch (error) {
    message.value = errorMessage(error);
  }
}
function create() {
  if (!guardLeave()) return;
  reset();
  editing.value = true;
  message.value = "";
  baseline.value = JSON.stringify(profile());
}
async function select(key: string) {
  if (!guardLeave()) return;
  busy.value = true;
  message.value = "";
  try {
    const item = await runtimeApi.database(key);
    id.value = item.id;
    label.value = item.label;
    engine.value = item.engine;
    environment.value = item.environment;
    extra.value = { ...item.metadata };
    tables.value = (item.metadata.tables ?? []) as Table[];
    indexes.value = (item.metadata.indexes ?? []) as Index[];
    editing.value = true;
    baseline.value = JSON.stringify(profile());
  } catch (error) {
    message.value = errorMessage(error);
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (busy.value) return;
  if (
    !label.value.trim() ||
    tables.value.some(
      (table) => !table.name.trim() || table.columns.some((column) => !column.name.trim()),
    ) ||
    indexes.value.some(
      (index) => !index.name.trim() || !index.table.trim() || !index.columns.length,
    )
  ) {
    message.value = "请补齐资料名称、表名、字段名称和索引信息";
    return;
  }
  const submitted = profile();
  busy.value = true;
  message.value = "";
  try {
    const result = await runtimeApi.saveDatabase(id.value, submitted);
    id.value = result.id;
    baseline.value = JSON.stringify(submitted);
    message.value = "资料已保存；不会自动授权给专家或连接业务数据库";
    await refresh();
    emit("saved");
  } catch (error) {
    message.value = errorMessage(error);
  } finally {
    busy.value = false;
  }
}
/**
 * Deletion is a boundary, not a convenience: the backend refuses while an enabled expert still
 * declares this profile, and the refusal reason is what the operator needs to see here. The confirm
 * button stays in place, disabled, with the reason beside it — a control that vanishes cannot explain
 * itself.
 */
async function remove() {
  if (busy.value || !id.value) return;
  busy.value = true;
  deleteRefusal.value = "";
  try {
    await runtimeApi.deleteDatabase(id.value);
    await refresh();
    reset();
    deleteOpen.value = false;
    message.value = "资料已删除；引用它的专家需要重新选择资料后才能启用";
    emit("saved");
  } catch (error) {
    deleteRefusal.value = errorMessage(error);
  } finally {
    busy.value = false;
  }
}
function reset() {
  id.value = null;
  label.value = "";
  engine.value = "PostgreSQL";
  environment.value = "local";
  tables.value = [];
  indexes.value = [];
  extra.value = {};
  editing.value = false;
  baseline.value = "";
}
defineExpose({ refresh });
onMounted(refresh);
</script>
<template>
  <section class="manager-workspace">
    <aside class="eap-panel manager-list">
      <div class="manager-toolbar">
        <h2>数据库资料</h2>
        <Button variant="primary" :disabled="busy" @click="create"> ＋ 新建资料 </Button>
      </div>
      <input
        v-model="filter"
        class="workspace-input"
        placeholder="搜索资料名称"
        aria-label="搜索数据库资料"
      /><button
        v-for="item in items.filter((item) =>
          item.label.toLowerCase().includes(filter.toLowerCase()),
        )"
        :key="item.id"
        class="manager-item"
        :class="{ active: id === item.id }"
        :disabled="busy"
        @click="select(item.id)"
      >
        <strong>{{ item.label }}</strong
        ><small>{{ item.engine }} · {{ item.environment }}</small>
      </button>
      <EmptyState v-if="!items.length">
        暂无资料。可登记脱敏表结构和索引，不需要提供连接凭据。
      </EmptyState>
    </aside>
    <div class="eap-panel">
      <Feedback v-if="message">{{ message }}</Feedback>
      <p v-if="busy" role="status">正在处理…</p>
      <EmptyState v-if="!editing">选择资料查看、编辑或删除，也可新建一个元数据快照。</EmptyState>
      <form v-else @submit.prevent="save">
        <div class="manager-toolbar">
          <div>
            <h2>{{ label || "新数据库资料" }}</h2>
            <small>{{ dirty ? "有未保存修改" : "脱敏元数据快照" }}</small>
          </div>
          <div class="form-actions">
            <Button
              variant="danger"
              v-if="id"
              type="button"
              :disabled="busy || dirty"
              @click="askDelete"
            >
              删除资料
            </Button>
            <Button
              variant="secondary"
              v-if="dirty"
              type="button"
              :disabled="busy"
              @click="
                baseline = JSON.stringify(profile());
                message = '已放弃未保存的修改，回到上次保存的版本。';
              "
            >
              放弃修改
            </Button>
            <Button variant="primary" :disabled="busy || !label.trim()">
              {{ busy ? "保存中…" : "保存资料" }}
            </Button>
          </div>
        </div>
        <Feedback tone="warning">
          只保存人工录入的结构快照。不要填写密码、Token 或 JDBC 地址；不会连接数据库或执行
          SQL。专家使用资料前需要显式授权。
        </Feedback>
        <fieldset :disabled="busy" class="metadata-fields">
          <label
            >资料名称<input
              v-model="label"
              class="workspace-input"
              required
              maxlength="200" /></label
          ><label
            >数据库引擎<select v-model="engine" class="workspace-input">
              <option>PostgreSQL</option>
              <option>MySQL</option>
              <option>SQL Server</option>
              <option>Oracle</option>
              <option>SQLite</option>
            </select></label
          ><label
            >环境<input v-model="environment" class="workspace-input" required maxlength="40"
          /></label>
          <div class="manager-toolbar">
            <h3>表结构</h3>
            <Button
              variant="secondary"
              type="button"
              @click="tables.push({ name: '', columns: [] })"
            >
              ＋ 添加表
            </Button>
          </div>
          <EmptyState v-if="!tables.length">尚未登记表结构。</EmptyState>
          <article v-for="(table, index) in tables" :key="index" class="observation">
            <div class="form-actions">
              <label class="grow"
                >表名<input
                  v-model="table.name"
                  class="workspace-input"
                  placeholder="schema.table"
                  required /></label
              ><Button variant="secondary" type="button" @click="tables.splice(index, 1)">
                移除表
              </Button>
            </div>
            <div
              v-for="(column, columnIndex) in table.columns"
              :key="columnIndex"
              class="metadata-row"
            >
              <label>字段名称<input v-model="column.name" class="workspace-input" required /></label
              ><label
                >类型<input
                  v-model="column.type"
                  class="workspace-input"
                  placeholder="uuid / varchar / bigint" /></label
              ><label><input v-model="column.nullable" type="checkbox" />允许空值</label
              ><Button
                variant="secondary"
                type="button"
                @click="table.columns.splice(columnIndex, 1)"
              >
                移除字段
              </Button>
            </div>
            <Button
              variant="secondary"
              type="button"
              @click="table.columns.push({ name: '', type: '', nullable: true })"
            >
              ＋ 添加字段
            </Button>
          </article>
          <div class="manager-toolbar">
            <h3>索引信息</h3>
            <Button
              variant="secondary"
              type="button"
              @click="indexes.push({ name: '', table: '', columns: [], unique: false })"
            >
              ＋ 添加索引
            </Button>
          </div>
          <EmptyState v-if="!indexes.length">尚未登记索引，这不代表数据库没有索引。</EmptyState>
          <article v-for="(index, position) in indexes" :key="position" class="observation">
            <label>索引名称<input v-model="index.name" class="workspace-input" required /></label
            ><label
              >所属表<input
                v-model="index.table"
                class="workspace-input"
                list="database-table-names"
                required /></label
            ><label
              >索引列（按顺序，逗号分隔）<input
                :value="index.columns.join(', ')"
                class="workspace-input"
                required
                @input="
                  index.columns = ($event.target as HTMLInputElement).value
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)
                "
            /></label>
            <div class="form-actions">
              <label><input v-model="index.unique" type="checkbox" />唯一索引</label
              ><Button variant="secondary" type="button" @click="indexes.splice(position, 1)">
                移除索引
              </Button>
            </div>
          </article>
          <datalist id="database-table-names">
            <option v-for="table in tables" :key="table.name" :value="table.name" />
          </datalist>
        </fieldset>
      </form>
    </div>

    <ConfirmBox
      v-if="deleteOpen && id"
      :title="`删除数据库资料「${label || id}」？`"
      :impact="deleteImpact"
      confirm-label="删除资料"
      danger
      :busy="busy"
      :refusal="deleteRefusal"
      @confirm="remove"
      @cancel="
        deleteOpen = false;
        deleteRefusal = '';
      "
    />
  </section>
</template>
