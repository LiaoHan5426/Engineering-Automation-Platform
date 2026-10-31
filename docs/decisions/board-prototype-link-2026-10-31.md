# 原型版本、看板任务与 Run 快照关联

后续进展：已在 [Run 仓库审阅切片](board-run-review-2026-10-31.md) 接入采集当时的基线、Diff 和空白检查快照；其归因与完整验收限制见该记录。以下保留本切片交付时事实。

2026-10-31，接续 [受控执行切片](board-controlled-run-2026-10-31.md)，实现 v1.6 §0B.11 RK-5 中“保存的设计版本 → 任务 → Run”这一段。Diff、独立验证与人工验收仍待后续实施，不能将关联成功或只读 Git 检查成功解释为开发任务完成。

## 实现范围与复用

任务详情可选择、预览、关联或移除服务端已保存的原型版本。普通任务仍可不关联。每次 Run 在同一事务内记录当时的版本 ID、标题、来源、保存时间与服务端内容哈希；任务后来换版、解除关联，都不改变历史 Run。旧快照缺少原型字段时按“未记录原型版本”读取。

沿用 PrototypeVersionService/JDBC 不可变版本、BoardTaskService 的项目范围/revision/任务行锁、BoardRunService 的事务/请求去重、既有 Mission Git 执行器及受控语义预览。没有新增版本库、执行器、依赖或平行 UI 原语；没有移除原型编辑与交付功能。

| 落点 | 职责 |
|---|---|
| `V7__board_prototype_reference.sql` | 为 board_task 添加可空 prototype_version_id 外键；不改写已应用的 V1～V6 |
| BoardPrototypeService / BoardPrototypeController | `POST /api/board/tasks/{taskId}/prototype`，只接受 projectId、revision、versionId（明确 null 表示解除） |
| BoardTaskService / BoardRunService | 返回当前关联；启动 Run 时从服务端版本读取可信摘要并写入不可变任务快照 |
| runtime-client / mock/boardBackend | 同一 DTO/API；mock 校验版本存在、项目、revision 与字段，不模拟 Run 成功 |
| `features/shell/BoardPrototypePanel.vue` | 任务关联选择、冲突核对、版本列表与保存；未保存的选择阻止启动 Run |
| `features/shell/PrototypeVersionViewer.vue` | 任务和历史 Run 共用查看器，语义预览与已保存正文；历史 Run 哈希不符时阻止预览 |
| PreviewBoard / BoardRunPanel | 组合领域面板、展示当前关联和历史快照，并保留待验收提示 |

UI 落点检查：

- [x] 已搜索并复用 `@eap/ui` Button、Select、Dialog、Collapse 及既有 PrototypeSchemaPreview。
- [x] 判为 L4 看板/原型领域组件，统一放在现有 `features/shell`，未把 API 编排放入 UI 包。
- [x] 页面控件通过公共组件；标准结构元素仍承担排版；色彩读取现有 Token。
- [x] 没有新增共享类别、包或暂存实现，无需新增边界表条目；本记录说明职责与复用。
- [x] boundaries、类型检查、行为测试及桌面/窄屏浏览器验证通过。

## 一致性与边界

- 服务端拒绝额外正文/哈希等字段；关联 ID 必须确实存在。关联不复制客户端正文，不更改任务目标/验收条件，不授予仓库权限，不确认设计验收，也不启动执行。
- 同一任务的关联修改与 Run 启动使用既有任务行锁和 revision。运行中或结果未知时禁止变更；过期 revision 返回 409，不覆盖其他修改。同一版本重复选择不增加 revision。
- 返回响应丢失或冲突时前端重读任务，保留待核对选择，要求明确采用当前关联后再修改；不盲目重发。任务刷新造成 revision 改变也要求核对，未保存选择不能成为隐式执行输入。保存关联期间新输入的目标/备注等草稿也保留，沿用现有冲突核对，不被关联响应覆盖。
- 重新提交原 requestId 仍返回原 Run，包括任务已换版的情况。旧 Run 保存的原型摘要不能被最新任务关联覆盖。
- 版本列表复用现有 builder-alpha/builder-beta 服务端版本来源；若已关联版本不在最近列表，会按 ID 补读。当前仍是本地共享版本库，任务的 projectId 校验不等于版本库的多租户隔离。版本检索/分页和项目归属另行规划。
- 保存的 `eap-prototype-v1` 正文经既有 Schema 校验后使用 Vue 组件预览；不注入保存的 HTML。历史/不支持正文只以转义文本展示。查看历史 Run 时比较保存的哈希与快照；这是记录一致性检查，不是完整源码/产物验收。
- 本轮 Run 仍只有显式确认目录后的只读 git status；未增加源码生成、Diff 审阅、构建执行或人工验收端点，任务不能据此进入 acceptance/done。

## 验证证据

在用户运行的 5173/8080 服务和现有开发 PostgreSQL 验证。Flyway 当前版本为 7，7 个迁移 validate 通过；没有 clean/repair/baseline、创建或删除数据库。用户的 application.yml 原变更保持不动。

- `rtk proxy pnpm --dir frontend test run`：72 文件、261 项通过。新增 7 项关联/预览行为测试、1 项草稿并发回归及 1 项 mock 合同测试，覆盖只传 ID、解除、并发冲突显式核对、活跃执行禁用、旧版本补读、语义预览、哈希不符与 HTML 转义。草稿并发回归先复现保存关联响应覆盖新输入目标，再验证修复后的保留与显式核对。
- `rtk proxy pnpm --dir frontend typecheck`、`rtk proxy pnpm --dir frontend build`、`rtk proxy pnpm --dir frontend check:boundaries` 全部通过。构建仍提示主包约 1.03 MB、GrapesJS 约 1.07 MB 超过 500 KB，未把该提示计为构建失败或性能验收通过。
- 同时设置 `EAP_RUN_BOARD_PERSISTENCE=true` 与 `EAP_RUN_MISSION_GIT_ACCEPTANCE=true` 后运行 `rtk proxy mvn -f backend/pom.xml test`：303 项，298 通过、0 失败/错误、5 条件跳过。真实供应商、Codex 配置读取、建删库 CLI/原型测试未启用；schema probe 由上述当前库 Flyway validate 补充，不将跳过计为通过。
- 定向 `BoardRunPersistenceTest,BoardTaskPersistenceTest,BoardPrototypeControllerTest,BoardTaskServiceTest,SchemaAndWiringTest`：27 项通过、无跳过。BoardRunPersistenceTest 共 9 项，新增覆盖换版/解除后历史引用不变、原请求重试保持旧引用、并发关联只有一个成功、缺失版本和跨项目拒绝、旧 Run JSON 无原型字段仍可读取；controller 拒绝伪造元数据及不完整/错误类型请求。
- 独立 Playwright Chromium 访问正在运行的 5173/8080：选择未保存时禁止启动 → 嵌套弹窗中交互预览 A → 保存关联 → 真正执行 git status 并记录 A → 换版 B → 历史 Run 仍预览 A → 刷新持久保持 → 390px 窄屏查看 B → 解除关联后历史仍保留 A。页面异常为 0，桌面与窄屏截图已目视复核。使用独立浏览器上下文，不声称本轮完成内置浏览器验证。
- 浏览器样例使用随机自有项目及确切版本清单；完成后定向清理 2 个样例任务、1 个 Run 及其内部 Mission/Handoff、4 个版本。持久化测试也仅清理自身样例，没有清空已有用户数据。
- `git diff --check` 通过。本轮未提交/推送，没有调用付费模型，没有重启用户前后端。

## 下一步

RK-5 仍需将已授权源码变更的 Diff、执行验证结果和人工验收决定关联到具体 Run；复用既有原型交付门禁与证据模型，先确定最小真实交付合同，再实现状态推进。不能以新增关联字段替代上述证据。未定交互契约的 Transfer、TreeSelect、虚拟树等候选继续保留待实现。
