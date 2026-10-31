<script setup lang="ts">
import { computed } from "vue";
import { TreeItem, TreeRoot, type TreeItemSelectEvent as SelectEvent, type TreeItemToggleEvent as ToggleEvent } from "reka-ui";
import type { TreeNode } from "./types";
const props = defineProps<{ items: TreeNode[]; label: string; disabled?: boolean; manualExpand?: boolean }>();
const model = defineModel<string>();
const expanded = defineModel<string[]>("expanded", { default: () => [] });
const emit = defineEmits<{ select: [TreeNode]; toggle: [TreeNode, boolean] }>();
const selected = computed(() => {
  function find(nodes: TreeNode[]): TreeNode | undefined {
    for (const node of nodes) {
      if (node.id === model.value) return node;
      const child = find(node.children ?? []);
      if (child) return child;
    }
  }
  return find(props.items);
});
function select(event: SelectEvent<TreeNode>) {
  const node = event.detail.value;
  if (node) { model.value = node.id; emit("select", node); }
}
function toggle(event: ToggleEvent<TreeNode>) {
  if (!event.detail.value?.children) { event.preventDefault(); return; }
  if (props.manualExpand) event.preventDefault();
  if (event.detail.value) emit("toggle", event.detail.value, !event.detail.isExpanded);
}
</script>
<template>
  <TreeRoot v-slot="{ flattenItems }" v-model:expanded="expanded" class="eap-tree" :items="items"
    :get-key="node => node.id" :model-value="selected" :disabled="disabled" :aria-label="label" selection-behavior="replace">
    <TreeItem v-for="item in flattenItems" :key="item._id" v-slot="{ isExpanded }" v-bind="item.bind"
      class="eap-tree__item" :disabled="item.value.disabled" :data-testid="item.value.testId"
      :style="{ paddingInlineStart: `${(item.level - 1) * 16 + 8}px` }" @select="select" @toggle="toggle">
      <span class="eap-tree__marker" aria-hidden="true">{{ item.hasChildren ? (isExpanded ? '▾' : '▸') : '·' }}</span>
      <slot :node="item.value" :expanded="isExpanded">{{ item.value.label }}</slot>
    </TreeItem>
  </TreeRoot>
</template>
<style src="./tree.css"></style>
