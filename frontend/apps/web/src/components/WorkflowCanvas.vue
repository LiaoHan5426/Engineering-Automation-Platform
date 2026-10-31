<script setup lang="ts">
import { SvgActionPath, Button } from "@eap/ui";
import { computed, ref, useId } from "vue";
import { inspectGraph, type WorkflowNode, type WorkflowEdge } from "../lib/workflowGraph";
const props = defineProps<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>();
const emit = defineEmits<{ select: [id: string] }>();
const selected = ref(""),
  source = ref(""),
  feedback = ref("");
const drag = ref<{ id: string; x: number; y: number } | null>(null);
const marker = useId();
const canvas = ref<HTMLElement | null>(null);
const zoom = ref(1);
function fit() {
  if (canvas.value)
    zoom.value = Math.min(1, Math.max(0.25, (canvas.value.clientWidth - 20) / size.value.width));
}
const graph = computed(() => inspectGraph(props.nodes, props.edges));
const positions = computed(() => {
  const rows = new Map<number, number>();
  return new Map(
    props.nodes.map((node) => {
      const level = graph.value.levels.get(node.id) ?? 0;
      const row = rows.get(level) ?? 0;
      rows.set(level, row + 1);
      return [node.id, { x: node.x ?? 50 + level * 280, y: node.y ?? 70 + row * 170 }];
    }),
  );
});
function position(id: string) {
  return positions.value.get(id) ?? { x: 0, y: 0 };
}
const size = computed(() => ({
  width: Math.max(900, ...[...positions.value.values()].map((p) => p.x + 260)),
  height: Math.max(450, ...[...positions.value.values()].map((p) => p.y + 180)),
}));
function path(edge: WorkflowEdge) {
  const a = position(edge.source),
    b = position(edge.target);
  const x = a.x + 200,
    y = a.y + 60,
    endX = b.x - 8,
    endY = b.y + 60;
  const bend = Math.max(55, Math.abs(endX - x) / 2);
  return `M ${x} ${y} C ${x + bend} ${y}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}
function start(event: PointerEvent, node: WorkflowNode) {
  selected.value = node.id;
  emit("select", node.id);
  const p = position(node.id);
  drag.value = {
    id: node.id,
    x: event.clientX - p.x * zoom.value,
    y: event.clientY - p.y * zoom.value,
  };
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  const node = props.nodes.find((node) => node.id === drag.value?.id);
  if (node && drag.value) {
    node.x = Math.max(20, (event.clientX - drag.value.x) / zoom.value);
    node.y = Math.max(20, (event.clientY - drag.value.y) / zoom.value);
  }
}
function connect(target: string) {
  if (!source.value) {
    feedback.value = "请先点击源节点的输出端口";
    return;
  }
  const edge = { source: source.value, target };
  if (
    edge.source === target ||
    props.edges.some((e) => e.source === edge.source && e.target === target)
  ) {
    feedback.value = "不能自连或重复连接";
    return;
  }
  const errors = inspectGraph(props.nodes, [...props.edges, edge]).errors;
  if (errors.includes("流程存在循环连线")) {
    feedback.value = "该连接会产生循环，已阻止";
    return;
  }
  props.edges.push(edge);
  source.value = "";
  feedback.value = "";
}
function layout() {
  for (const node of props.nodes) {
    delete node.x;
    delete node.y;
  }
}
function removeEdge(index: number) {
  props.edges.splice(index, 1);
}
</script>
<template>
  <div class="canvas-tools">
    <span>输出 → 输入：箭头表示依赖方向，名称不决定顺序。</span
    ><Button size="sm" variant="secondary" @click="layout">自动布局</Button><Button size="sm" variant="secondary" @click="fit">查看全图</Button>
    <Button size="sm" variant="secondary"
      aria-label="缩小画布"
      :disabled="zoom <= 0.25"
      @click="zoom = Math.max(0.25, zoom - 0.1)"
    >
      −</Button
    ><span>{{ Math.round(zoom * 100) }}%</span
    ><Button size="sm" variant="secondary"
      aria-label="放大画布"
      :disabled="zoom >= 1.5"
      @click="zoom = Math.min(1.5, zoom + 0.1)"
    >
      ＋</Button
    ><Button size="sm" variant="secondary" @click="zoom = 1">原始大小</Button
    ><Button size="sm" variant="secondary"
      v-if="source"
      @click="
        source = '';
        feedback = '';
      "
    >
      取消连线
    </Button>
  </div>
  <p v-if="source" role="status">已选源节点，请点击目标节点左侧的输入端口。</p>
  <p v-if="feedback" role="alert">{{ feedback }}</p>
  <p v-if="nodes.length && graph.errors.length" class="graph-warning" role="status">
    {{ graph.errors.join("；") }}
  </p>
  <div ref="canvas" class="workflow-canvas eap-scrollbar">
    <div :style="{ width: size.width * zoom + 'px', height: size.height * zoom + 'px' }">
      <div
        class="canvas-surface"
        :style="{
          width: size.width + 'px',
          height: size.height + 'px',
          transform: 'scale(' + zoom + ')',
          transformOrigin: 'top left',
        }"
      >
        <svg :width="size.width" :height="size.height" aria-label="工作流依赖连线">
          <defs>
            <marker
              :id="marker"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
          </defs>
          <g v-for="(edge, index) in edges" :key="edge.source + '-' + edge.target">
            <path
              :d="path(edge)"
              fill="none"
              stroke="var(--accent)"
              stroke-width="3"
              :marker-end="'url(#' + marker + ')'"
            />
            <SvgActionPath :d="path(edge)" :label="'删除连线 ' + edge.source + ' 到 ' + edge.target" delete-key @activate="removeEdge(index)" />
          </g>
        </svg>
        <article
          v-for="node in nodes"
          :key="node.id"
          class="workflow-node"
          :class="{ selected: selected === node.id, connecting: source === node.id }"
          :style="{ left: position(node.id).x + 'px', top: position(node.id).y + 'px' }"
        >
          <Button size="sm" variant="icon"
            class="port input"
            :aria-label="'连接到 ' + (node.label || node.capability)"
            title="输入：点击接收连线"
            @click="connect(node.id)"
          >
            ●
          </Button>
          <div
            class="node-handle"
            @pointerdown="start($event, node)"
            @pointermove="move"
            @pointerup="drag = null"
            @pointercancel="drag = null"
          >
            <small>{{ edges.some((e) => e.target === node.id) ? "依赖完成后执行" : "入口" }}</small
            ><strong>{{ node.label || node.capability || "待选择能力" }}</strong>
          </div>
          <code>{{ node.capability }}</code>
          <Button size="sm" variant="link"
            class="node-properties"
            @click="
              selected = node.id;
              emit('select', node.id);
            "
          >
            配置节点
          </Button>
          <Button size="sm" variant="icon"
            class="port output"
            :aria-label="'从 ' + (node.label || node.capability) + ' 连线'"
            title="输出：点击开始连线"
            @click="
              source = node.id;
              feedback = '';
            "
          >
            ●
          </Button>
        </article>
      </div>
    </div>
  </div>
</template>
<style scoped>
.canvas-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
  font-size: 13px;
  flex-wrap: wrap;
}
.canvas-tools span {
  flex: 1;
}
.graph-warning {
  color: var(--warn-text);
  background: var(--warn-bg);
  padding: 10px;
  border-radius: 8px;
}
.workflow-canvas {
  height: 470px;
  overflow: auto;
  background-color: var(--surface-2);
  background-image: radial-gradient(var(--border-strong) 1px, transparent 1px);
  background-size: 20px 20px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
}
.canvas-surface {
  position: relative;
}
.workflow-node {
  position: absolute;
  width: 200px;
  height: 120px;
  background: var(--surface);
  border: 2px solid var(--focus-ring);
  border-radius: 10px;
  box-sizing: border-box;
  padding: 12px;
  display: grid;
  gap: 6px;
}
.workflow-node.selected,
.workflow-node.connecting {
  border-color: var(--accent);
}
.node-handle {
  cursor: grab;
  touch-action: none;
  display: grid;
  gap: 4px;
}
.node-handle small {
  color: var(--text-soft);
}
.node-handle strong {
  font-size: 14px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.workflow-node code {
  font-size: 11px;
  color: var(--text-soft);
}
.port {
  position: absolute;
  top: 44px;
  width: 24px;
  height: 28px;
}
.input {
  left: -14px;
}
.output {
  right: -14px;
}
svg {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
