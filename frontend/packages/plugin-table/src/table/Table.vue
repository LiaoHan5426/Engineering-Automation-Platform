<script setup lang="ts" generic="T extends object">
import { computed, ref, watch } from "vue";
import { VxeColumn, VxeTable } from "vxe-table";
import { Button } from "@eap/ui";
import type { TableColumn, TableOverflow } from "./columns";

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: T[];
    rowKey: string;
    empty?: string;
    pageSize?: number;
    /** How a cell treats text that does not fit. `ellipsis` is the default. */
    overflow?: TableOverflow;
  }>(),
  { empty: "没有数据", pageSize: 20, overflow: "ellipsis" },
);

const page = ref(1);
const pageCount = computed(() =>
  props.pageSize > 0 ? Math.max(1, Math.ceil(props.rows.length / props.pageSize)) : 1,
);
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});
const visibleRows = computed(() => {
  if (props.pageSize <= 0 || props.rows.length <= props.pageSize) return props.rows;
  const start = (page.value - 1) * props.pageSize;
  return props.rows.slice(start, start + props.pageSize);
});

function typed(row: object) {
  return row as T;
}
function columnOverflow(column: TableColumn) {
  return column.overflow ?? props.overflow;
}

function columnClass(column: TableColumn) {
  return [
    column.mono ? "eap-table__mono" : "",
    columnOverflow(column) === "wrap" ? "eap-table__wrap" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Native tooltip, only when the line is actually clipped. Avoids the vxe-pc-ui tooltip. */
function revealClipped(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const cell = target.closest(".vxe-body--column > .vxe-cell");
  if (!(cell instanceof HTMLElement)) return;
  const wrapper = cell.querySelector(".vxe-cell--wrapper");
  if (!(wrapper instanceof HTMLElement)) return;
  const clipped = wrapper.scrollWidth > wrapper.clientWidth + 1;
  if (!clipped) {
    cell.removeAttribute("title");
    return;
  }
  const text = wrapper.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text) cell.title = text;
}

function text(row: T, key: string) {
  const value = (row as Record<string, unknown>)[key];
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
</script>

<template>
  <div class="eap-table" @mouseover="revealClipped">
    <VxeTable
      :data="visibleRows"
      :row-config="{ keyField: rowKey, isHover: true }"
      :empty-text="empty"
      :show-overflow="false"
      size="small"
      border="none"
    >
      <VxeColumn
        v-for="column in columns"
        :key="column.key"
        :field="column.key"
        :title="column.title"
        :width="column.width"
        :min-width="column.minWidth"
        :show-overflow="columnOverflow(column) === 'ellipsis' ? 'ellipsis' : false"
        :class-name="columnClass(column)"
      >
        <template #default="{ row }">
          <slot :name="column.key" :row="typed(row)">{{ text(typed(row), column.key) }}</slot>
        </template>
      </VxeColumn>
    </VxeTable>
    <nav v-if="pageCount > 1" class="eap-table__pager" aria-label="表格分页">
      <Button type="button" size="sm" variant="secondary" :disabled="page <= 1" @click="page -= 1">
        上一页
      </Button>
      <span>{{ page }} / {{ pageCount }}</span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        :disabled="page >= pageCount"
        @click="page += 1"
      >
        下一页
      </Button>
    </nav>
  </div>
</template>

<style src="./table.css"></style>
