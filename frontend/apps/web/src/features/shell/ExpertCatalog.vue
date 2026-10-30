<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Input } from "@eap/ui";
import { addExpert, currentExtras, expertCatalog, removeExpert, workbench } from "./workbench";

const emit = defineEmits<{ navigate: [id: string] }>();
const { t } = useI18n();
const query = ref("");
const mine = ref(false);
const category = ref("");
const categories = computed(() => [...new Set(expertCatalog.map((item) => item.category).filter(Boolean))]);
const visible = computed(() => {
  const needle = query.value.trim();
  return expertCatalog.filter((item) => {
    if (mine.value && !item.mine) return false;
    if (category.value && item.category !== category.value) return false;
    if (!needle) return true;
    return item.name.includes(needle) || item.category.includes(needle) || item.guidance.includes(needle) || item.resources.includes(needle);
  });
});

function add(id: string) {
  if (currentExtras().experts.some(expert => expert.id === id)) { removeExpert(id); workbench.notice = ''; return; }
  if (addExpert(id)) workbench.notice = "expert";
}
</script>

<template>
  <section class="expert-catalog" data-testid="expert-catalog">
    <header class="expert-head">
      <div>
        <h1 data-testid="expert-catalog-title">{{ t("desktop.expertMarket") }}</h1>
        <p v-if="workbench.preview">{{ t('preview.boundary') }}</p>
        <p>{{ t('desktop.expertDisconnected') }}</p>
      </div>
      <button type="button" data-testid="experts-mine" :aria-pressed="mine" @click="mine = !mine">{{ t("desktop.expertsMine") }}</button>
    </header>
    <div class="toolbar">
      <Input v-model="query" type="search" :aria-label="t('desktop.expertSearch')" :placeholder="t('desktop.expertSearch')" />
      <button type="button" :aria-pressed="!mine" @click="mine = false">{{ t("desktop.expertsAll") }}</button>
      <button type="button" @click="emit('navigate', 'experts')">{{ t("desktop.manageExperts") }}</button>
    </div>
    <div class="category-chips" data-testid="expert-categories" role="list">
      <button type="button" :aria-pressed="!category" @click="category = ''">{{ t("desktop.expertsAll") }}</button>
      <button v-for="item in categories" :key="item" type="button" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
    </div>
    <p v-if="workbench.notice === 'expert'" role="status">{{ t("desktop.addedExpert") }}</p>
    <ul>
      <li v-for="expert in visible" :key="expert.id" class="expert-card">
        <div class="expert-card-head">
          <h2>{{ expert.name }}<template v-if="expert.comingSoon">（{{ t("desktop.expertOnTheWay") }}）</template></h2>
          <button v-if="!expert.comingSoon" type="button" class="expert-add" data-testid="expert-add" :aria-pressed="currentExtras().experts.some(item => item.id === expert.id)" :aria-label="t(currentExtras().experts.some(item => item.id === expert.id) ? 'desktop.removeExpert' : 'desktop.addExpert')" :title="t(currentExtras().experts.some(item => item.id === expert.id) ? 'desktop.removeExpert' : 'desktop.addExpert')" @click="add(expert.id)">{{ currentExtras().experts.some(item => item.id === expert.id) ? '✓' : '＋' }}</button>
          <span v-else class="expert-soon" data-testid="expert-coming-soon">{{ t("desktop.expertOnTheWay") }}</span>
        </div>
        <p>{{ expert.category }} · {{ expert.version }} · {{ t("desktop.demo") }}</p>
        <p>{{ expert.resources }}</p>
        <p>{{ expert.guidance }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.expert-catalog{display:grid;gap:16px;padding:8px 0 24px}
.expert-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
h1{margin:0;font-size:22px}
p{color:#68746e;line-height:1.6;margin:0}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.category-chips{display:flex;flex-wrap:wrap;gap:6px}
.category-chips button{padding:6px 10px;font-size:12px}
input{flex:1;min-width:160px;padding:8px 10px;border:1px solid #cdd6ca;border-radius:8px;background:#faf9f4}
button{border:1px solid #aebfb5;border-radius:8px;background:#e1ede6;padding:8px 10px;cursor:pointer;font:inherit}
button[aria-pressed="true"]{background:#d8e2d7;border-color:#91b6a0}
ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:0;padding:0;list-style:none}
.expert-card{display:grid;gap:6px;padding:14px;border:1px solid #dce2d9;border-radius:12px;background:#faf9f4;position:relative}
.expert-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.expert-card p:nth-of-type(1){font-size:12px;color:#526258}
.expert-add{flex:0 0 auto;width:28px;height:28px;padding:0;border-radius:8px;font-size:16px;line-height:1;color:#287b6c}
.expert-soon{flex:0 0 auto;font-size:11px;color:#8a7a4a;background:#fff5d6;border:1px solid #e6d59a;border-radius:8px;padding:4px 8px}
h2{margin:0;font-size:16px}
@media(max-width:760px){h1{font-size:20px}input{min-width:0;flex:1 1 100%}ul{grid-template-columns:1fr}}
</style>
