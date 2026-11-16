<script setup lang="ts">
import { ref } from 'vue'
import classes from './smoke.module.css'
const count = ref(0)
import { onMounted, onUnmounted } from 'vue'
const counts = document.documentElement.dataset
onMounted(() => { counts.smokeMounts = String(Number(counts.smokeMounts ?? 0) + 1) })
onUnmounted(() => { counts.smokeUnmounts = String(Number(counts.smokeUnmounts ?? 0) + 1) })
</script>

<template>
  <main data-vue-smoke :class="classes.marker">
    <h1>Vue Host smoke</h1>
    <button data-increment @click="count++">Count {{ count }}</button>
  </main>
</template>

<style scoped>
[data-vue-smoke] { padding: 23px; }
</style>

<style>
[data-increment] { min-height: 37px; }
</style>
