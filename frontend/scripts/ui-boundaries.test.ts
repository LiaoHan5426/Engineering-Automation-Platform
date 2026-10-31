import { expect, it } from "vite-plus/test";
import { inspectUiStyles, inspectUiTemplate } from "./ui-boundaries";

it("rejects raw controls including nested templates but accepts design HTML data", () => {
  const source = `<script setup>const design = '<button>design data</button>';</script>
    <template><Button /><div><template v-if="true"><input /></template></div></template>`;
  expect(inspectUiTemplate(source, "test.vue")).toEqual([expect.stringContaining("<input>")]);
  expect(inspectUiTemplate(`<template><!-- <button> --><Button /><Collapse /></template>`, "test.vue")).toEqual([]);
});

it("rejects simulated controls, custom variants and dynamic native controls", () => {
  for (const source of ['<article role="button" />', '<div :role="\'menu\'" />', '<Button variant="custom" />', '<Button :variant="flag ? \'custom\' : \'ghost\'" />', '<component :is="\'input\'" />', '<div @click="open" />']) {
    expect(inspectUiTemplate(`<template>${source}</template>`, "test.vue").length).toBeGreaterThan(0);
  }
  expect(inspectUiTemplate('<template><ActionCard label="Open" @activate="open" /><DropdownMenu /><div @click.stop /><a href="#chat">Chat</a></template>', "test.vue")).toEqual([]);
});

it("checks host CSS while leaving editor content and CSS text alone", () => {
  expect(inspectUiStyles('.card { color:#fff; background:rgb(0 0 0 / 10%); }', 'page.css')).toHaveLength(2);
  expect(inspectUiStyles('/* color: #fff */ .card { color:var(--text); content:"white"; white-space:nowrap }', 'page.css')).toEqual([]);
  expect(inspectUiTemplate('<script setup>const design = "color:#fff";</script><template><Button /></template><style>.card { color: var(--text) }</style>', 'page.vue')).toEqual([]);
});

it("rejects a parallel modal shell", () => {
  expect(inspectUiTemplate(`<template><Teleport to="body"><div role="dialog" /></Teleport></template>`, "test.vue"))
    .toEqual([expect.stringContaining("parallel dialog shell")]);
});
