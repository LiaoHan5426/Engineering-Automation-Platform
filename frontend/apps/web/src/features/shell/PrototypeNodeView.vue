<script setup lang="ts">
import { ref } from 'vue';
import { Textarea } from '@eap/ui';
import type { PrototypeNode } from './prototypeSchema';
defineProps<{ node: PrototypeNode }>();
const clicks = ref(0), value = ref('');
function listItems(node: PrototypeNode): string[] {
  const raw = node.props.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item)).filter(Boolean).slice(0, 50);
}
</script>
<template>
  <section v-if="node.kind === 'page' || node.kind === 'section'" class="schema-section" :style="node.props.style as Record<string, string>">
    <PrototypeNodeView v-for="child in node.children" :key="child.id" :node="child" />
  </section>
  <p v-else-if="node.kind === 'text'" :style="node.props.style as Record<string, string>">{{ node.props.text }}</p>
  <component
    :is="Number(node.props.level) === 2 ? 'h2' : Number(node.props.level) === 3 ? 'h3' : 'h1'"
    v-else-if="node.kind === 'heading'"
    class="schema-heading"
    :style="node.props.style as Record<string, string>"
  >{{ node.props.text }}</component>
  <div v-else-if="node.kind === 'button'"><button type="button" @click="clicks++">{{ node.props.label || 'Action' }}</button><output v-if="clicks" aria-live="polite">{{ clicks }}</output></div>
  <a
    v-else-if="node.kind === 'link'"
    class="schema-link"
    href="#"
    :title="String(node.props.href || '#')"
    @click.prevent="clicks++"
  >{{ node.props.label || 'Link' }}<output v-if="clicks" aria-live="polite"> {{ clicks }}</output></a>
  <Textarea v-else-if="node.kind === 'input'" v-model="value" :placeholder="String(node.props.placeholder || '')" :aria-label="String(node.props.placeholder || 'Input')" />
  <component
    :is="node.props.ordered ? 'ol' : 'ul'"
    v-else-if="node.kind === 'list'"
    class="schema-list"
    :style="node.props.style as Record<string, string>"
  >
    <li v-for="(item, index) in listItems(node)" :key="index">{{ item }}</li>
  </component>
  <p v-else role="alert">Unsupported: {{ node.kind }}</p>
</template>
<style scoped>
.schema-section{display:grid;gap:12px;padding:12px;border:1px dashed #cdd8cb;border-radius:8px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.schema-heading{margin:0;overflow-wrap:anywhere;color:#243028;letter-spacing:-.02em}h1.schema-heading{font-size:22px}h2.schema-heading{font-size:18px}h3.schema-heading{font-size:15px}button{padding:8px 14px;border:1px solid #b2c8bc;border-radius:8px;background:#e1ede6;color:#286e5d;cursor:pointer}.schema-link{color:#287b6c;font-weight:650;text-decoration:underline;cursor:pointer}output{margin-left:12px}textarea{min-height:64px;width:100%}.schema-list{margin:0;padding-left:1.25em;color:#243028;line-height:1.55}.schema-list li{margin:2px 0}
</style>
