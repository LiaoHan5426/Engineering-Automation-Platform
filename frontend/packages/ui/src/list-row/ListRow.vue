<script setup lang="ts">
/**
 * 列表卡片行：图标徽标 + 标题/元信息 + 右侧状态。
 * 根节点是原生 button，因此键盘可达、可被 `.list button` 这类既有选择器命中；
 * 选中态只表达「当前打开的是这一条」，不代表任何权限或执行结果。
 */
withDefaults(
  defineProps<{
    /** 左侧徽标文字，通常是 2 个大写字母的短标识。 */
    badge?: string
    /** 徽标配色，按业务种类区分，不承载状态语义。 */
    badgeTone?: 'accent' | 'neutral'
    /** 右侧状态文字，例如「已启用」「部分索引」。 */
    status?: string
    /** 状态颜色，承载真实状态语义。 */
    statusTone?: 'neutral' | 'success' | 'warning' | 'danger'
    selected?: boolean
    disabled?: boolean
  }>(),
  { badgeTone: 'accent', statusTone: 'neutral' },
)
defineEmits<{ activate: [MouseEvent] }>()
</script>
<template>
  <button
    type="button"
    class="eap-list-row"
    :data-selected="selected || undefined"
    :data-badge-tone="badgeTone"
    :data-status-tone="statusTone"
    :disabled="disabled"
    :aria-current="selected || undefined"
    @click="$emit('activate', $event)"
  >
    <span v-if="badge" class="eap-list-row__badge" aria-hidden="true">{{ badge }}</span>
    <span class="eap-list-row__main">
      <span class="eap-list-row__title"><slot name="title" /></span>
      <span v-if="$slots.meta" class="eap-list-row__meta"><slot name="meta" /></span>
    </span>
    <span v-if="status || $slots.trailing" class="eap-list-row__trailing">
      <slot name="trailing">{{ status }}</slot>
    </span>
  </button>
</template>
<style src="./list-row.css"></style>
