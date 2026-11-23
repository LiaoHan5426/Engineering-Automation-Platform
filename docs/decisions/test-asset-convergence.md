# 测试资产收敛

日期：2026-11-23。状态：**有效**。授权范围：精简 AGENTS + 全面收敛低价值测试资产（含 F1–F3、B1–B2）。

## 问题

存量测试与 AGENTS 流程仪式叠压，导致改动维护面过大、agent 切片过细。量化基线（收敛前）：前端单测文件约 197、`it` 约 748；browser 脚本约 66；后端 `*Test.java` 约 228 / `@Test` 约 1023，其中 `eap-full-application` 约 164 类。

## 保留（风险矩阵）

必须保留并能在相关改动中定向回归：

- 授权、审批、UNKNOWN、取消、去重、恢复、草稿保护
- 领域状态机 / 错误码 / wire 合同
- 包边界与模块归属门禁

## 降级与禁止新增

| 类别 | 政策 |
|---|---|
| `*-visual.mjs` 与纯截图对齐 | **删除或不再提交**；不进默认 `vp test`；T1 用一张受影响页截图即可 |
| 现行 `*-live.mjs` + 风险 `*AcceptanceTest` | **冻结**：已门控、默认跳过；不为新外观/文案扩写；仅 T3 同域风险回归时可按需重跑 |
| 历史设计交付 Acceptance / 批跑 live | **已移出树**；索引 [archived-acceptance-index](../records/archived-acceptance-index.md) |
| 无新风险的细粒度 DOM/文案用例 | **禁止新增**；改实现优先改既有意图，不平行堆用例 |
| full-app Persistence | **冻结扩写**；ungated 仅保留风险类；门控实库类为并发/CAS 权威，禁止再增快乐路径宿主类 |

## 已执行批次

### A + visual（第一批）

三级 AGENTS 短表；§3.6 连贯切片；删未跟踪 visual 与 `editor-display-visual.mjs`。

### F1+F2

| 动作 | 结果 |
|---|---|
| F1 Navigation | `DesktopNavigation.return` 并入主测 |
| F2 PreviewBoard / chatSession / TaskComposer.layout | 按风险裁剪装饰与重叠用例 |

### B1（Persistence）

审计结果：ungated `ExecutionLogPersistenceTest` / `WorkingMemoryPersistenceTest` 为恢复与 UNKNOWN 风险测，保留。门控 Persistence（BoardTask/ExpertBehavior/Skill/Code* 等）含并发、CAS、回滚，与模块 mock 测互补而非快乐路径重复，**保留并冻结扩写**。宿主 `src/test/README.md` 已写明边界。

### B2（Acceptance / live）

Acceptance **25→8**；`*-live.mjs` **37→6**。移出清单与保留表见 [archived-acceptance-index](../records/archived-acceptance-index.md)。

### F3（切面合并）

| 动作 | 结果 |
|---|---|
| ChatWorkspace.* | 7 个共用 `mockChatStartup` 切面并入 `ChatWorkspace.test.ts` |
| PluginCenter.dependency + runtime | 并入 `PluginCenter.test.ts` |
| 保留独立 | `PluginSlot.lifecycle`、`BuilderWorkspace.version`（夹具/主题不同） |

## 验证

- F1/F2：定向 5 文件 179 通过；PreviewBoard 2 项既有基线失败仍在。
- B1/B2/F3：定向跑合并后的 ChatWorkspace / PluginCenter；后端以编译/门控跳过为准（未开实库门控）。
