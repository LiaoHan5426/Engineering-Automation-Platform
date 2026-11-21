# 前端首屏入口基线与大 chunk 告警判读（P2 构建质量）

日期：2026-11-21。状态：**技术方案已确定并实施；离线产物分析与首屏入口回归通过；2026-11-22 追加破坏性重构切片，管理页按需加载已落地，入口下降约 35%。真实浏览器首屏性能、全站用户接受仍独立。** 本决定关闭 [P2 / 前端构建与质量台账](../planning-status.md) 中"生产构建报告大 chunk（含编辑器与设计器），先按实际入口测首屏/按需加载再决定拆包，不通过提高告警阈值掩盖问题"的缺口。第 1–2 节与第 3 节原始决定记录当时"不改产品组件"的判读；**第 6 节为后续修订**，按用户"重构可破坏旧架构"的取向，把同步管理页改为按需加载并实测收益。

## 1. 问题与现状

- `vp -C frontend/apps/web build`（exit 0）在产物中打印通用告警：`Some chunks are larger than 500 kB … Use build.rolldownOptions.output.codeSplitting … Adjust chunk size limit via build.chunkSizeWarningLimit`。该告警被记入 `independent-checks.json`，但原文**不含 chunk 名与归属**，容易被误读为"首屏要下载 6 MB 编辑器"。
- 构建工具为 vite-plus 1.5.1（底层 Rolldown），不是 Rollup：手动分块入口是 `build.rolldownOptions.output.codeSplitting`，仓库源码中**没有** `manualChunks` / `rollupOptions` / `chunkSizeWarningLimit` 配置。
- 台账的关闭条件不是"消灭所有 >500 kB 告警"，而是"先测实际入口再决定，且不靠抬高阈值掩盖"。因此先用产物事实回答"首屏到底加载什么"。

## 2. 实际入口测量（2026-11-21 产物）

来源：`frontend/apps/web/dist/index.html` 的 `<script type=module>` 与 `<link rel=modulepreload>`，以及对 `dist/assets/*.js` 的字节统计。

**首屏真正加载的 JS**（`index.html` 直接引用 + modulepreload）：

| 文件 | 大小 | 归属 |
|---|---|---|
| `index-*.js` | 1,303,273 B | 应用入口（App.vue + 同步管理页 + @eap/ui + plugin-table + i18n runtime） |
| `vue-i18n-*.js` | 329,244 B | 国际化 runtime |
| `src-*.js` | 91,300 B | 入口依赖 |
| `rolldown-runtime-*.js` | 极小 | 打包运行时 |

**>500 kB 的大 chunk 全部不在首屏清单**，且都是动态 `import()` 产物：

| 文件 | 大小 | 归属 | 加载触发 |
|---|---|---|---|
| `ts.worker-*.js` | 6,927,783 B | monaco TypeScript worker | 打开代码差异时 `monacoDiff.ts:65` 动态加载 |
| `editor.api-*.js` | 2,735,517 B | monaco 编辑器 API | 同上 |
| `vs-*.js` | 1,295,251 B | monaco standalone editor | 同上 |
| `css.worker-*.js` | 1,078,238 B | monaco CSS worker | 同上 |
| `grapes-*.js` | 1,070,197 B | GrapesJS 设计器本体 | `GrapesEditorScaffold.vue:558` `await import('grapesjs')` |
| `html.worker-*.js` / `json.worker-*.js` | 743,371 / 433,120 B | monaco 语言 worker | 按需 |

结构性证据（按需加载不是偶然，而是源码保证）：

- `App.vue:9-12`：`SkillManager` / `AppearanceSettings` 已是 `defineAsyncComponent(() => import(...))`。
- `BuilderWorkspace.vue:18`：`GrapesEditorScaffold` 为 `defineAsyncComponent`；`GrapesEditorScaffold.vue:558` 内部再 `await import('grapesjs')`。
- `ProjectBoard.vue:4`：`PreviewBoard` 为 `defineAsyncComponent`。
- `monacoDiff.ts:65`：`const monaco = await import('monaco-editor')`，调用方 `ProposalDiffView.vue` 在 `onMounted` 才触发。

## 3. 决定（硬边界）

- **不为编辑器/设计器大 chunk 拆包**：它们已按需加载、不在首屏，且拆分会改动组件边界与加载时机，收益为零、风险不为零。告警列出它们是 Rolldown 对"全仓 chunk"的机械提示，不是首屏性能问题。
- **不提高 `chunkSizeWarningLimit`**：保留 500 kB 告警作为持续可见的回归信号，不用抬高阈值掩盖 chunk 增长。
- **不改产品组件**：不把同步管理页改成异步、不引入 `manualChunks` / `codeSplitting` 人工编排。1.24 MB 入口是既有外壳，其进一步拆分涉及 ref 方法调用（`guardLeave` / `refresh` / `currentHash`）与未保存保护的时序，属独立重构，不在本片。
- **把结论固化为可重复的离线回归**：新增 `scripts/check-first-load.mjs`，读取任意一次 build 的 `dist/index.html` 与 `dist/assets`，断言"编辑器/设计器大 chunk 不在首屏、大 chunk 确实作为按需产物存在、首屏 JS 总量有界"，并输出证据 JSON。这样"先测再决定"成为每次构建可复验的合同，而非一次性口头结论。

## 4. 验证方式

- `node ./scripts/check-first-load.mjs`（须先 `vp -C frontend/apps/web build`）：离线、无需真实后端/用户。
- 断言分三类：① 首屏脚本/预加载清单中不含编辑器/设计器特征 chunk；② 这些大 chunk 存在于 `dist/assets`（证明是按需产物而非被删掉）；③ 首屏 JS 总字节 < 2 MB 上限。
- 证据输出到 `docs/evidence/frontend-batch/first-load-baseline.json`（可提交），含时间戳、首屏清单、大 chunk 清单与判定结果。
- 前端全量 `vp test --run` / `typecheck` / `fmt --check` / `stylelint` 保持通过——本片不改产品代码，仅验证不回归。

## 5. 仍为独立边界

- 真实浏览器 FCP/LCP、弱网首屏、全站缩放与用户产品接受不在本片；本片证明的是"构建产物入口结构"这一离线事实。
- 入口 1.24 MB 的进一步瘦身（同步管理页异步化、ref 时序与未保存保护回归）是独立重构，需单独评审，不因本片宣称已完成。
- 若未来出现"大 chunk 进入首屏清单"，本回归会失败，届时按实际入口重新决定拆包策略，而不是调整阈值。

## 6. 后续修订：破坏旧首屏结构（2026-11-22）

用户明确取向："重构原有内容可以考虑保留，但不是一定不可破坏架构，不然重构没有意义。"据此撤销第 3 节"不改产品组件 / 入口瘦身属独立重构"的保守边界，在同一 P2 切片内落地管理页按需加载。

**改动**：`App.vue` 中原先同步导入的 10 个非首屏管理页（CapabilityManager / ExpertManager / KnowledgeManager / DatabaseManager / RuleManager / ModelSettings / PluginCenter / ScenarioWorkspace / ProjectBoard / ExpertCatalog）改为 `defineAsyncComponent(() => import(...))`。保留 ChatWorkspace、DesktopNavigation、PluginSlot 同步（首屏 chat 视图与导航需要）。所有经 ref 调用的 `guardLeave` / `refresh` / `currentHash` 方法本就带 null 保护（`?.` 或 `&&` 判断），组件加载完成前 ref 为空不会误触发；各组件已 `defineExpose` 这些方法。

**实测收益**（同一脚本、同一告警阈值，见刷新的证据 JSON）：
- 入口 chunk `index-*.js`：1,303,273 B → 846,136 B（**−35%**），管理页代码已脱离首屏入口。
- 首屏 JS 总量：1,724,543 B → 1,493,801 B（**−13%**）；首屏文件 4 → 11（共享依赖 wire / presentation / runtime-core 被提升为 modulepreload chunk，浏览器并行加载）。
- 编辑器/设计器大 chunk 仍 7 个、全部懒加载、0 泄漏，三类断言保持通过；**未提高任何告警阈值**。

**测试适配**（不是削弱断言，而是对异步渲染正确建模）：
- `WorkspaceLeave.test.ts` / `DesktopNavigation.return.test.ts` 中被 mock 的管理页模块补 `__esModule: true`——vitest 5 对"被 mock 模块 + `defineAsyncComponent` 动态 import"需显式 ESM 标记，否则触发 `__v_isVNode` 检查错误；WorkspaceLeave 的 ProjectBoard mock 工厂去掉内部 `await import('vue')` 改为顶层 import。
- `DesktopNavigation.return.test.ts` 的 `click()` 从"固定 8 次 nextTick"改为 `vi.waitFor` 等待目标控件出现——异步视图不再假设固定微任务次数。
- 全量前端回归：185 文件 / 1128 项通过，无 unhandled error；typecheck / 构建 / fmt / stylelint 通过。

**仍成立的边界**：真实 FCP/LCP、弱网首屏与用户接受仍独立；本修订证明的是"产物入口结构"这一离线事实，不等于真实环境性能验收。
