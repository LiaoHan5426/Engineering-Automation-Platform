---
kind: upgrade-guide
description: "将开发者构建集成迁移至 Vite+ Pack 配置和结果 API。"
---

# Vite+ Pack 替代独立打包器配置

[English](guide.md) | 中文

## 变更

维护仓库 fork 或构建集成的开发者，使用 `vite.config.ts` 中的 Vite+ 1.7.0 `pack` 选项替代 `tsdown.config.ts`。命令为 `vp pack`；Client preset 位于 `packages/client/pack.client.ts`。程序构建返回包含 `bundles` 的对象。

## 迁移

1. 将包的 `tsdown.config.ts` 重命名为 `vite.config.ts`，从 `vite-plus` 导入 `defineConfig`，用 `defineConfig({ pack: options })` 包装选项。在赋值 `pack` 前求值阶段 helper；Client 形式为 `defineConfig({ pack: clientBundle(import.meta.dirname, entries)({ env: process.env }) })`。

2. 将独立打包器命令替换为 `vp pack`，preset 导入替换为 `packages/client/pack.client.ts`，构建及类型导入替换为 `vite-plus/pack`。产物与 watcher 消费方读取 `(await build(options)).bundles`。

3. 使用 `pnpm run build:artifacts` 执行完整产物流水线。它在独立的 Host 和 Client 进程中选择 `DSH_BUILD_FACE`。保留包的显式选项：`entry`、`format` 和其他已声明值整体替换根默认值；只有 `plugins` 数组在包插件之后追加默认插件，从而避免重复 ESM 构建。将 `entry: ""` 视为禁用 face：继承默认值后、调用 Pack 前将其筛除。将它传给 Pack 会触发源码入口发现，并可能在 Client 阶段覆盖 Host 产物。保留 external 运行时依赖和浏览器加载器请求列表，不依赖隐式依赖打包。

4. 运行 `pnpm run build:artifacts` 并确认 `lib/` 下的预期包产物，再运行 `node --import tsx scripts/verify-package-dependencies.ts`。配置继承与模块边界见[决策记录](../../../../.agents/notes/implemented/process/2026-11-17-vite-plus-pack-build-entry.zh.md)。
