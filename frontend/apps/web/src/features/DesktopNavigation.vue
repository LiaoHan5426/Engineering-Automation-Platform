<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
const props = defineProps<{ activeView: string; pages: { id: string; name: string }[] }>();
const emit = defineEmits<{ navigate: [id: string] }>();
const { t } = useI18n();
type Area = 'code' | 'work' | 'scenes' | 'experts' | 'settings';
const area = ref<Area>('code');
const lastView = new Map<Area, string>();
const ids: Record<Area, string[]> = { code: ['chat', 'sql'], work: [], scenes: ['builder-alpha', 'builder-beta'], experts: ['experts'], settings: ['model-settings', 'plugins', 'rules', 'knowledge', 'databases', 'capabilities'] };
watch(() => props.activeView, id => {
  const match = id === 'scenes' || id === 'work' ? id : (Object.keys(ids) as Area[]).find(key => ids[key].includes(id));
  if (match) { area.value = match; lastView.set(match, id); }
}, { immediate: true });
const items = computed(() => ids[area.value].flatMap(id => props.pages.filter(page => page.id === id)));
function select(next: Area) {
  area.value = next;
  const previous = lastView.get(next);
  if (previous && (previous === 'scenes' || previous === 'work' || props.pages.some(page => page.id === previous))) {
    emit('navigate', previous);
    return;
  }
  const first = ids[next].find(id => props.pages.some(page => page.id === id));
  emit('navigate', next === 'scenes' ? 'scenes' : first ?? next);
}
</script>

<template>
  <div class="desktop-navigation">
    <nav class="activity-bar" :aria-label="t('desktop.navigation')">
      <button v-for="(path, key) in { code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16', work: 'M9 6V4h6v2M3 7h18v13H3zM3 11l9 3 9-3m-9 1v4', scenes: 'm12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5', experts: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8', settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2' }" :key="key" type="button" :class="{ active: area === key }" :aria-current="area === key ? 'page' : undefined" @click="select(key)"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path :d="path" /></svg>{{ t('desktop.' + key) }}</button>
    </nav>
    <aside class="desktop-sidebar">
      <h2 class="rail__eyebrow">{{ t('desktop.' + area) }}</h2>
      <p v-if="area === 'scenes'" class="hint">{{ t('desktop.flow') }}</p>
      <button v-if="area === 'scenes'" class="nav" :class="{ active: activeView === 'scenes' }" @click="emit('navigate', 'scenes')">{{ t('desktop.prototype') }}</button>
      <button v-for="item in items" :key="item.id" class="nav" :class="{ active: activeView === item.id }" @click="emit('navigate', item.id)">{{ item.name }}</button>
      <p v-if="area === 'work'" class="hint">{{ t('desktop.workPending') }}</p>
    </aside>
  </div>
</template>

<style scoped>
.desktop-navigation{display:flex;min-height:0;height:100%;overflow:hidden;color:#43534c}
.activity-bar{width:64px;flex:0 0 64px;display:flex;flex-direction:column;gap:8px;padding:10px 6px;background:#e1e6df}
.activity-bar button{display:grid;gap:5px;justify-items:center;border:0;background:transparent;padding:9px 0;border-radius:10px;color:#64746b;font-size:10px;line-height:1.3;cursor:pointer;min-width:0}
.activity-bar button svg{width:22px;height:26px}
.activity-bar button:hover{background:#d5dfd6}.activity-bar button.active{background:#cbded5;color:#287b6c}.activity-bar button:last-child{margin-top:auto}
.desktop-sidebar{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;overflow:auto;padding:22px 14px;background:#ebece4;border-right:1px solid #dce0d7}
.desktop-sidebar h2{margin:0 10px 20px;color:#69776e;font-size:12px;letter-spacing:.04em;font-weight:600}
.hint{padding:0 10px;font-size:12px;color:#68746e;line-height:1.7}
.desktop-sidebar .nav{width:100%;border:0;padding:10px 12px;border-radius:9px;text-align:left;background:transparent;color:#526258;font-size:13px;font-weight:500;cursor:pointer}
.desktop-sidebar .nav:hover{background:#e1e5dc}.desktop-sidebar .nav.active{background:#d8e2d7;color:#286e5d;font-weight:600}
button:focus-visible{outline:2px solid #398b7a;outline-offset:2px}
</style>
