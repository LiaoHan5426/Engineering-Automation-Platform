<script setup lang="ts">
import { ref } from 'vue';
import { Textarea, Button } from "@eap/ui";
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
  <div v-else-if="node.kind === 'button'"><Button size="sm" variant="secondary" type="button" @click="clicks++">{{ node.props.label || 'Action' }}</Button><output v-if="clicks" aria-live="polite">{{ clicks }}</output></div>
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
.schema-section{display:grid;gap:12px;padding:12px;border:1px dashed var(--border-strong);border-radius:8px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.schema-heading{margin:0;overflow-wrap:anywhere;color:var(--text);letter-spacing:-.02em}h1.schema-heading{font-size:22px}h2.schema-heading{font-size:18px}h3.schema-heading{font-size:15px}.schema-link{color:var(--accent);font-weight:650;text-decoration:underline;cursor:pointer}output{margin-left:12px}textarea{min-height:64px;width:100%}.schema-list{margin:0;padding-left:1.25em;color:var(--text);line-height:1.55}.schema-list li{margin:2px 0}
</style>
