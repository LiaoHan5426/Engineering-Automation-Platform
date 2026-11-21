# 聊天执行日志持久化与跨重启只读回放（CT-01）

日期：2026-11-21。状态：**技术方案已确定并实施；限定离线与隔离 schema 技术回归通过；真实模型、用户交互接受与进程级故障注入仍待。** 本决定关闭的是 [CT-01 台账](../planning-status.md) 中"执行日志进程内、重启后不能取回"的缺口，不改动 [CT-02 已发送消息图](deepseek-chat-adaptation.md)的权威边界。

## 1. 问题与现状

- `ChatExecutionJournal` 以进程内 `ConcurrentHashMap<UUID, ExecutionLog>` 保存执行事件；`open` / `Emitter.emit` / `snapshot` 全在内存完成。
- `GET /api/ai/conversations/{id}/executions/{executionId}/snapshot?afterSequence=` 只能补齐**同一 JVM** 内、尚未被容量淘汰的执行事件。
- 服务重启或日志被逐出后，`snapshot` 返回 `UNKNOWN_EXECUTION`，断线客户端无法读回已产生事件。这是 [SSE 执行事件合同](chat-engineering-task-slice.md#聊天-sse-执行事件与取消2026-11-07-限定离线与mock交互已验)明确声明的既有边界，现予收敛。

## 2. 目标与非目标（硬边界）

**目标**

- 每条执行的**事件日志持久化**：执行头（身份、会话、状态、完成标记、时间）与有序事件（游标、类型、正文、错误码、状态、payload）落 Postgres。
- **跨重启只读回放**：新进程用同一 `executionId` 调 `snapshot(afterSequence)` 能读回已落库事件，游标、去重与非法游标语义不变。
- 未完成执行在重启后如实返回 `complete=false`、`status=UNKNOWN`，供前端按既有"悬空 RUNNING 收敛为 UNKNOWN、不自动重试"合同处理。

**非目标（不得越界）**

- **不接管运行中的推理**。模型调用、取消标志与 exclusive 轮次都在进程内，进程终止即不可恢复；跨重启"续跑"只能靠重放历史工具/重复发起模型调用，违反"重复点击、响应丢失和切换分支不得重复启动""不重放历史模型工具、旧候选应用或 UNKNOWN 写入"的既有合同。持久日志是**只读回放证据**，不是执行续约。
- **不伪造终态**。重启后未完成执行不标记为 SUCCEEDED/FAILED/CANCELLED；只标记 UNKNOWN 或保留原未完成状态且 `complete=false`。
- 不改变 `final.payload`（完整消息信封）、SSE 帧序、`ChatExecutionEvent` 契约或前端消费方式；不改 CT-02 消息图。
- 不把执行日志当作审批/工具/候选/Run 的权威来源；这些仍归现有所属域。
- payload 中正文在落库前已按既有红线脱敏；不新增原文入日志的路径。

## 3. 权威与数据流

| 数据 | 权威归属 | 说明 |
|---|---|---|
| 活跃执行的事件追加重连 | `ChatExecutionJournal` 进程内 log | 事件先在内存生成与定序，再同步 best-effort 落库，随后推送 SSE 观察者；落库失败仅记诊断，不阻塞执行与终态 |
| 已完成/重启后执行的事件读回 | Postgres `chat_execution` / `chat_execution_event` | `snapshot` 内存命中走内存；内存缺失（重启/淘汰）走 DB 回放 |
| 消息正文、分支、执行关联 | 后端消息图（CT-02） | 不变；执行日志只承载过程证据，不承载已发送消息正文权威 |

写入顺序：`open` 先插执行头；`emit` 每条事件在写内存后追加事件行（`final` 帧到位或 `complete/fail/recordRefusal` 时更新执行头状态与完成标记）。落库异常被吞并记诊断，不中断模型执行或 SSE——与"断线观察者不中止执行"一致。因此日志是**最终一致的证据**：极端落库失败会缺事件，但绝不反过来制造成功终态。

读回顺序：`snapshot` 先查内存；未命中则查 DB 执行头与 `sequence > afterSequence` 的事件。DB 中 `complete=false` 或状态为活跃态时，回放快照强制 `status=UNKNOWN`、`complete=false`，避免把中断执行误判为可继续。

## 4. 存储契约（增量迁移 V3，不改 V1/V2）

- `eap.chat_execution`：`id`(PK)、`conversation_id`、`status`、`complete`、`opened_at`、`closed_at`；事件数受既有 `MAX_EVENTS` 约束由写入侧保证。
- `eap.chat_execution_event`：`execution_id`、`sequence`、`event_id`、`type`、`text`、`code`、`status`、`payload`(`jsonb`)、`occurred_at`；`(execution_id, sequence)` 唯一，`event_id` 唯一。
- 事件行 append-only（update/delete 触发器拒绝）；执行头只允许更新状态/完成/关闭时间。
- 会话存在性由消息图 `chat_conversation` 外键约束；无会话的孤立执行头不允许写入。
- schema 前缀可注入，隔离 schema 用同一 SQL 跑 DDL 契约测试，生产固定 `eap`。

## 5. 与既有合同的关系

- 前端 `eventProjector` 仍按 `executionId+sequence` 去重；跨重启回放复用同一快照协议，无需新端点或新字段。
- "UNKNOWN 只核对、不重放、不自动重试"的既有规则原样适用；本决定不提供 SQL/源码交付 UNKNOWN 的自动解除。
- 工作区恢复、模型上下文、跨重启进程接管等缺口不在本决定关闭范围，仍按 [规划台账](../planning-status.md#待推进问题与关闭条件)分别验收。

## 6. 验证口径

- 隔离 schema 真 Postgres DDL 契约：迁移可应用、事件行 append-only、游标唯一、跨会话外键约束。
- 跨重启回放：新 `ChatExecutionJournal` 实例注入同一 store，按 `afterSequence` 读回完整事件序列且 `final` 与终态一致；未完成执行回放为 UNKNOWN。
- 现有 `ChatExecutionJournalTest` / `ChatExecutionStreamTest` 内存语义保持不变（无 store 时退化为纯内存）。
- 落库失败不中断执行：store 抛异常时 emit/send 仍成功且 SSE 终态正常。
- 不宣称真实模型流式、真实进程崩溃注入或用户交互接受已通过。
