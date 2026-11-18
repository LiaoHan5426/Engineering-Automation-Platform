# Agent Note: 工作区构建使用统一的 Vite+ Pack 入口

Status: implemented

[English](2026-11-17-vite-plus-pack-build-entry.md) | 中文

## 问题

包构建、watcher 和测试需要共享配置与依赖边界。第二套配置加载器可能改变默认值继承：声明单入口的包会意外获得根入口 glob。浏览器加载器只提供声明过的模块标识，因此浏览器 bundle 需要比 Node 包更严格的 external 规则。

## 决策

Vite+ 1.7.0 统一构建入口。包配置位于 `vite.config.ts` 的 `defineConfig({ pack: ... })` 中；命令使用 `vp pack`，程序调用从 `vite-plus/pack` 导入。[根配置](../../../../vite.config.ts) 将包选项展开为一个数组。[共享读取器](../../../../scripts/pack-config.ts) 使用 Vite 的 native 加载器；根配置绑定包工作目录，并禁用二次配置与工作区发现。

根默认值填补缺省选项。包显式声明的选项（包括 `entry` 和 `format`）整体替换对应默认值。只有 `plugins` 数组在包插件之后追加默认插件。这既保留显式入口，也避免拼接格式数组导致重复 ESM 构建。

空字符串 `entry` 是仓库级的禁用 face 标记。应用默认值后，根配置先筛除所有 `entry` 为 `""` 的配置，再将数组提交给 Pack。Pack 将空字符串视为缺省入口并发现 `src/index.ts`；若透传此标记，Client 阶段就会在未执行 Host 装饰器降级转换的情况下重新构建仅含 Host 的包，并覆盖其 Host 产物。

Host 与 Client 在独立进程中运行，由 `DSH_BUILD_FACE` 选择。包配置先求值 helper，再向 `pack` 提供对象或数组，因此 native 模块缓存不会在后续 Client 调用中保留 Host 选择。Desktop 打包依赖 Host 输出；Client 编译位于这些打包之后，因为拆分的编译 face 会重写共享编译产物。

[Client preset](../../../../packages/client/pack.client.ts) 使用显式的 `deps.neverBundle` 与 `deps.alwaysBundle` 策略。Node 生产依赖保持 external。浏览器加载器提供的请求保持 external；其他已准入依赖内联。纯度检查仍拦截未声明的跨模块导入：切换打包器既不允许复制共享运行时标识，也不允许生成加载器满足不了的浏览器 `require` 调用。

构建 API 返回包含 `bundles` 的对象。Watcher 与测试消费 `(await build(options)).bundles`；产物检查与 watcher 生命周期管理操作这些 bundle 记录，而不把外层结果当数组。

## 考虑过的替代方案

保留两套配置会让开发、测试和产物构建分散维护权威配置。隐式工作区发现会把继承和工作目录行为隐藏在另一套加载器中。在同一缓存模块图中求值两个 face，会让阶段选择依赖导入顺序。显式读取器和进程边界让这些契约在所属调用位置可见。

## 后果

开发者按[升级指南](../../../../docs/upgrade-guide/v0.2.2-rc.3/vite-plus-pack-config/guide.zh.md) 迁移文件名、命令和构建结果访问方式。Native 加载依赖 Node TypeScript 类型剥离。显式依赖策略保留运行时标识，并要求跨模块导入遵循 manifest 与加载器契约。

[产物与检查拆分](2026-10-11-build-artifacts-check-split.zh.md)和[壳层与动态包边界](../architecture/2026-08-15-client-shells-and-dynamic-packages.zh.md)仍然有效：本文改变打包器集成，不改变其调度或归属理由。两项决策都未被完整取代。

## 验证

集成期间迁移定向检查已通过。`node --import tsx scripts/verify-package-dependencies.ts` 对 101 个包检查通过。这些是有明确范围的结果，不代表完整仓库构建已经完成。
