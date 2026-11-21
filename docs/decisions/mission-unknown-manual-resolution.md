# Mission 未知执行的证据核对与人工解除

日期：2026-11-21。状态：**契约已确认，按本文件实施并验收。** 本文件补齐 [Mission 单步执行契约](mission-single-step-execution-contract.md#重启与残留进程)留下的「人工解除机制尚未实现」缺口；该节此前明确「未知执行会阻塞，直到它离开在途状态」，但没有入口。进度由[CT-02 台账](../planning-status.md#ct-02-chat-adaptation)之外的 [P1 / Mission UNKNOWN](../planning-status.md#next-work-register) 行维护。

## 1. 问题与边界

服务重启后，仍在途的 Mission 执行由 `MissionGitExecutionService.markRestartUnknown()` 写入未知原因，但状态保持在 `CREATED`/`RUNNING`/`CANCELLING`——未知是**观察**，不是存储状态（见 `MissionExecution` 构造器约束）。部分唯一索引让这条在途行挡住下一次 `start`，因此它「不会自动接管或重跑遗留进程」。

缺口：没有任何接口能把这条未知行移出在途状态，于是阻塞无法解除，也没有人工核对的证据落点。

红线（来自 P1 台账与本契约链）：

- **不虚构进程已退出**：人工动作不是执行器的退出证据。解除后 `exit_code` 必须保持 `null`，`exit_evidence` 必须保持原值（未知行本来没有退出证据），不得写 `SUCCEEDED`/`FAILED`/`TIMED_OUT`/`CANCELLED`/`INTERRUPTED` 里任何一种声称进程结束的终态。
- **不套用工具域 `CLOSED_UNKNOWN`**：工具域用独立终态 `CLOSED_UNKNOWN` + `Resolution(processTreeStopped)`，那表示该域已经核对过进程树。Mission 的未知多为「服务重启后无法确认进程树是否结束」，核对人不能证明进程树已停止，因此既不复用 `CLOSED_UNKNOWN` 这个 wire 值，也不引入 `processTreeStopped` 断言。
- **不写作取消或失败**：不复用 `CANCELLED`/`FAILED`/`REJECTED`，这些终态会改写任务的投影与「本次仓库检查的结果」，而人工核对证明不了这些结果。
- **不重复启动**：解除只改这一行的可启动性；它不重新拉起进程、不销毁残留进程，也不补写退出码。下一次 `start` 必须生成新的执行号，旧行和旧证据保持原样。

## 2. 人工解除的语义

新增一个 Mission 专属终态 `CLOSED_UNCONFIRMED`（wire 值同名），含义严格限定为：

> 操作者已对这条未知执行做人工证据核对，确认不再等待其进程结果；平台**不据此声称进程已退出**。

- `CLOSED_UNCONFIRMED` 不在 `active()` 集合，也不在 `blocking()` 集合（见下「阻塞语义」），因此解除后 `open(missionId)` 不再返回该行，下一次 `start` 可以插入新的在途行。
- 保留 `unconfirmed_reason` 原文与 `exit_code = null`、`exit_evidence = null`，让审计仍然能看到「这条曾被标为未知、核对时没有退出证据」。
- Mission 主记录投影：解除不是执行成功，`eap.mission.execution` 不写 `succeeded`；保留该行原有投影语义（未知行本就没有终态投影），界面不显示执行成功。

### 阻塞语义

`MissionExecutionStatus.active()` 仍是 `CREATED`/`RUNNING`/`CANCELLING`；`blocking()` 原本还含 `UNKNOWN`（观察态占位）。本切片给 `blocking()` 加上 `CLOSED_UNCONFIRMED` 的反面处理——它**不阻塞**。但要注意 `blocking()` 与 `active()` 的差别：`open(missionId)` 查的是 `active`，所以只要新终态不在 `active` 集合即可解除启动阻塞；`blocking()` 留给前端判断「是否仍需注意」，解除后也应为 false。保持 `UNKNOWN` 仍 blocking（它是仍未解除的观察）。

## 3. 审计数据

`V4__mission_unknown_resolution.sql` 只加列与 status 约束取值，不改 V1/V2/V3：

- `mission_execution.status` 的 CHECK 增加 `'CLOSED_UNCONFIRMED'`。
- 新增三列：`resolution_note text`、`resolution_operator varchar(64)`、`resolved_at timestamptz`。
- `resolution_note` 必填且非空白，长度 10–2000 字符（与工具域证据核对一致的量级），由服务端校验。
- `resolution_operator`：服务端审计标签（沿用 `runtime.operatorLabel()`，即 `local-operator`），不信任请求自报身份。
- `resolved_at`：服务端时间 `Instant.now()`，不信任请求时间。

领域模型 `MissionExecution` 增加 `Resolution(UUID executionId, String note, String operator, Instant resolvedAt)`（可空）；提供便利构造器保持现有 23 参数的调用点不变（resolution 默认 null）。`closeUnconfirmed()` 生成一个新行：status = `CLOSED_UNCONFIRMED`，resolution 填审计值，其余字段（含 unconfirmedReason、exitCode、exitEvidence、cancelRequested、startedAt 等）**逐字段保持不变**。

## 4. 可解除的条件与并发

只有同时满足以下条件才允许写入，否则拒绝：

1. 行存在且 `status = ANY(active)`（在途）；
2. 行带有非空的 `unconfirmed_reason`（确为未知观察，运行中但未标未知的行不可直接解除）。

存储层 `resolveUnconfirmed(...)` 用条件 UPDATE（`WHERE id = ? AND status = ANY(active) AND unconfirmed_reason IS NOT NULL AND resolution_note IS NULL`），返回受影响行数。服务层据此区分：

- 行不存在或不属于该 mission → 404 `MISSION_EXECUTION_NOT_FOUND`；
- 行已是终态、或未标未知、或已解除过（第二次解除）→ 409 `MISSION_UNKNOWN_NOT_RESOLVABLE`。重复解除是冲突，不是幂等成功，避免把「已核对」审计覆盖成新的一次。

条件 UPDATE 在事务内完成，投影（如有）与行更新同事务；不新增独立的「解除后重跑」路径。

## 5. HTTP 与前端

- `POST /api/missions/{missionId}/executions/{executionId}/resolve-unknown`，请求体 `{"note": "..."}`。字段白名单只收 `note`；其他字段视为 `MISSION_INPUT_INVALID`。
- 前端 `MissionExecutionRecord` 增加可选 `resolution` 字段与 status 取值；`isMissionExecutionStatusBlocking` 对 `CLOSED_UNCONFIRMED` 返回 false。
- BoardRunPanel 对带 `unconfirmedReason` 的在途行增加「核对并解除」入口：note 校验（10–2000 字符）、显式勾选确认、提交后刷新运行记录。文案明确这是人工核对、不代表进程退出、不代表任务完成。

## 6. 验证合同

必须有以下代码路径和测试，缺一不可宣称关闭本缺口：

- 领域：`closeUnconfirmed` 保持 `unconfirmedReason`/`exitCode`/`exitEvidence` 不变、status 与 resolution 正确；构造器仍拒绝 `UNKNOWN` 直接写入。
- 服务：可解除的条件（在途 + 已标未知）、note 校验、404/409 分支、审计取服务端值、解除后 `open(missionId)` 不再返回该行、下一次 `start` 生成新 executionId（重启不重复启动的正面证明）。
- 存储/DDL：隔离 schema 真 Postgres 上 V1→V4 迁移链、新终态约束、审计列、条件 UPDATE 的幂等与并发（第二次更新影响 0 行）。
- 前端：契约新值、blocking 判定、BoardRunPanel 解除入口与 note 校验的定向测试。
- 全量回归：后端 `mvn test`、前端 typecheck/build/定向测试全绿。

## 7. 明示不在范围

- 跨重启接管或销毁残留进程（能力边界，保持未实现）。
- 让 `UNKNOWN` 重新变成可执行、从中断处续跑（自动续跑不是本切片）。
- 把人工解除写成任务成功、验证通过或仓库写入完成。
- 工具域 `CLOSED_UNKNOWN` 的任何语义或 wire 值复用。
