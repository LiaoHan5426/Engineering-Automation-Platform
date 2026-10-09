<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { runtimeApi } from "./api";
import { errorMessage } from "./presentation";
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
function canLeave() {
  return !dirty.value || window.confirm("资料有未保存修改，是否放弃？");
}
async function refresh() {
  try {
    items.value = (await runtimeApi.databases()).items;
  } catch (error) {
    message.value = errorMessage(error);
  }
}
function create() {
  if (!canLeave()) return;
  reset();
  editing.value = true;
  message.value = "";
  baseline.value = JSON.stringify(profile());
}
async function select(key: string) {
  if (!canLeave()) return;
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
 * declares this profile, and the refusal reason is what the operator needs to see here.
 */
async function remove() {
  if (busy.value || !id.value) return;
  const target = label.value || id.value;
  if (!window.confirm(`删除数据库资料「${target}」？该操作的引用授权会一并失效，且不可撤销。`)) return;
  busy.value = true;
  message.value = "";
  try {
    await runtimeApi.deleteDatabase(id.value);
    await refresh();
    reset();
    message.value = "资料已删除；引用它的专家需要重新选择资料后才能启用";
    emit("saved");
  } catch (error) {
    message.value = errorMessage(error);
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
        <button class="eap-button eap-button--primary" :disabled="busy" @click="create">
          ＋ 新建资料
        </button>
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
      <p v-if="!items.length" class="empty-state">
        暂无资料。可登记脱敏表结构和索引，不需要提供连接凭据。
      </p>
    </aside>
    <div class="eap-panel">
      <p v-if="message" class="feedback" role="status">{{ message }}</p>
      <p v-if="busy" role="status">正在处理…</p>
      <p v-if="!editing" class="empty-state">选择资料查看、编辑或删除，也可新建一个元数据快照。</p>
      <form v-else @submit.prevent="save">
        <div class="manager-toolbar">
          <div>
            <h2>{{ label || "新数据库资料" }}</h2>
            <small>{{ dirty ? "有未保存修改" : "脱敏元数据快照" }}</small>
          </div>
          <div class="form-actions">
            <button
              v-if="id"
              type="button"
              class="eap-button eap-button--danger"
              :disabled="busy"
              @click="remove"
            >
              删除资料
            </button>
            <button class="eap-button eap-button--primary" :disabled="busy || !label.trim()">
              {{ busy ? "保存中…" : "保存资料" }}
            </button>
          </div>
        </div>
        <p class="planning-note">
          只保存人工录入的结构快照。不要填写密码、Token 或 JDBC 地址；不会连接数据库或执行
          SQL。专家使用资料前需要显式授权。
        </p>
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
            <button
              type="button"
              class="eap-button"
              @click="tables.push({ name: '', columns: [] })"
            >
              ＋ 添加表
            </button>
          </div>
          <p v-if="!tables.length" class="empty-state">尚未登记表结构。</p>
          <article v-for="(table, index) in tables" :key="index" class="observation">
            <div class="form-actions">
              <label class="grow"
                >表名<input
                  v-model="table.name"
                  class="workspace-input"
                  placeholder="schema.table"
                  required /></label
              ><button type="button" class="eap-button" @click="tables.splice(index, 1)">
                移除表
              </button>
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
              ><button
                type="button"
                class="eap-button"
                @click="table.columns.splice(columnIndex, 1)"
              >
                移除字段
              </button>
            </div>
            <button
              type="button"
              class="eap-button"
              @click="table.columns.push({ name: '', type: '', nullable: true })"
            >
              ＋ 添加字段
            </button>
          </article>
          <div class="manager-toolbar">
            <h3>索引信息</h3>
            <button
              type="button"
              class="eap-button"
              @click="indexes.push({ name: '', table: '', columns: [], unique: false })"
            >
              ＋ 添加索引
            </button>
          </div>
          <p v-if="!indexes.length" class="empty-state">尚未登记索引，这不代表数据库没有索引。</p>
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
              ><button type="button" class="eap-button" @click="indexes.splice(position, 1)">
                移除索引
              </button>
            </div>
          </article>
          <datalist id="database-table-names">
            <option v-for="table in tables" :key="table.name" :value="table.name" />
          </datalist>
        </fieldset>
      </form>
    </div>
  </section>
</template>
