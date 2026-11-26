# Vue 工作台布局

从 `@eap/layout` 按需导入 `Layout`、`LayoutHeader`、`LayoutAside`、`LayoutContent` 和 `LayoutFooter`。这些组件支持单独使用。省略任何区域后，其余区域自动占用可用空间。

```vue
<script setup lang="ts">
import { Layout, LayoutAside, LayoutContent, LayoutHeader } from '@eap/layout'
</script>

<template>
  <Layout>
    <LayoutHeader>项目</LayoutHeader>
    <Layout direction="horizontal">
      <LayoutAside style="--eap-layout-aside-width: 16rem">
        <nav>项目导航</nav>
      </LayoutAside>
      <LayoutContent>工作区内容</LayoutContent>
    </Layout>
  </Layout>
</template>
```

`Layout` 默认纵向排列。用 `direction="horizontal"` 组合横向内容和侧栏。`LayoutContent` 默认渲染为 `main`，嵌套内容可用 `as="section"` 或 `as="div"`。需要页脚时加入 `LayoutFooter`。

## 工作台组合

从 `@eap/layout` 导入 `WorkbenchFrame`。组件会加载布局样式。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { WorkbenchFrame } from '@eap/layout'

const collapsed = ref(false)
</script>

<template>
  <WorkbenchFrame
    right-seated
    :right-collapsed="collapsed"
    right-label="详情"
    close-right-label="关闭详情"
    @close-right="collapsed = true"
  >
    <template #topbar>
      <button type="button" @click="collapsed = !collapsed">切换详情</button>
    </template>
    <template #navigation="{ inert }">
      <nav :inert="inert">项目导航</nav>
    </template>
    <section>工作区内容</section>
    <template #right>详情内容</template>
  </WorkbenchFrame>
</template>
```

- 默认插槽进入主滚动区。`fullSurface` 启用 `surface` 插槽，适合内部自带导航的设计器。
- `topbar` 提供 `rightOverlay` 和 `rightNarrow`，`navigation` 提供 `inert`。右栏在视口宽度大于 1024px 时停靠。进入窄屏覆盖时，组件处理遮罩、Escape 和焦点恢复。
- 插件写入型右栏由宿主传入 `rightId`、`rightSeated`、`rightCollapsed` 和 `rightAttrs`。其 DOM 节点跨工作区切换持续挂载。其他插件目标放在 `outlets`。
- 还可以通过 `overlays`、`notice`、`before-main`、`inspector` 和 `status` 组合应用壳。
