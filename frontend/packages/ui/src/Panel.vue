<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
  /** Extra class on the root section (e.g. manager-list, panel-block). */
  panelClass?: string | string[] | Record<string, boolean>;
}>();
</script>

<template>
  <section class="eap-panel" :class="panelClass">
    <header v-if="title || $slots.actions || $slots.header">
      <div v-if="title || description || $slots.header">
        <slot name="header">
          <h2 v-if="title">{{ title }}</h2>
          <p v-if="description">{{ description }}</p>
        </slot>
      </div>
      <slot name="actions" />
    </header>
    <div class="eap-panel__body">
      <slot />
    </div>
  </section>
</template>
