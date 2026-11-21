# SQL 专家未知执行的证据核对与人工解除

日期：2026-11-21。状态：**契约已确认，按本文件实施并验收。** 本文件关闭[台账 P1 / EX-01 SQL UNKNOWN](../planning-status.md#next-work-register)「人工闭环缺口」：已有只读核对与不重放围栏，但没有把未知执行移出在途的入口，也没有独立的操作者证据审计与 Run/Task 投影。进度仍由台账该行维护。

## 1. 问题与边界

SQL 专家的写操作经人工批准后由 `CodeChangeService` 落地；写前失联或写后确认失联会使 `eap.expert_agent_run.state` 收敛到 `unknown`，`eap.task.status` 同步为 `unknown`。`ExpertAgentApprovalService.inspect()` 只做证据协调（候选已是 `APPLIED`/`FAILED` 时投影），`review()` 对未知行直接返回 `inspect()`；重启恢复 `recoverInterruptedApprovals()` 也只读核对、不重放。

缺口有两层：

1. 未知行没有解除入口，Run 与 Task 都停在需要人工注意的状态；
2. 通用源码核对 `SourceWriteReview.close()` 只把 `code_proposal` 关成 `CLOSED_UNKNOWN`，**不触碰** `expert_agent_run` 与 `task`，所以「候选已核对」不等于「专家 Run/Task 已恢复」。

红线：

- **不重放、不自动重试**：解除不是再次执行模型、工具或文件写入；`UNKNOWN` 仍只观察，不因解除变成可执行。
- **不伪造写入结果**：不写 `applied`/`failed`/`completed`，不改 `result`，不把候选改成 `APPLIED`；操作者核对的是「不再等待这次执行」，不是「SQL 已成功落盘」。
- **不复用其他域终态**：不写工具域 `CLOSED_UNKNOWN`，不写 Mission 的 `CLOSED_UNCONFIRMED` wire 值；专家域有自己的取值。
- **不关闭候选**：`code_proposal` 的处置仍走通用源码核对，本动作只解除专家 Run/Task，两者互不代替。
- **不续跑**：解除后原执行号保持终态；如仍要尝试，必须提交新的 Task/Run，不从中断处继续。

## 2. 人工解除的语义

给 `ExpertAgentState` 增加专属终态 `CLOSED_UNCONFIRMED`（wire 值 `closed-unconfirmed`），含义严格限定为：

> 操作者已对这条未知专家执行做人工证据核对，确认不再等待其写操作结果；平台**不据此声称文件已写入或 SQL 已执行**。

- 新值不在 `active()`，也不在 `blocking()`；`UNKNOWN` 仍 blocking，未解除的观察不得被当成已处理。
- 保留 `proposal_id`、`approval_digest`、`decision`、`result`、`checkpoint` 与 `code_proposal.status` 原样；只改 `state`、审计列与 `updated_at`。
- Run/Task 必须同事务投影：`eap.expert_agent_run.state='closed-unconfirmed'`，`eap.task.status='closed-unconfirmed'`，`decision` 保留 `needs-review`，让列表仍显示「需人工核对过」。
- `eap.task.status` 无 CHECK 约束，不需要为它扩约束。

### 阻塞与新执行

解除只影响这一行的可观察性：原执行号不再出现在需要处理的列表里，但不会变成可恢复执行。任何新的尝试生成新的 Task/Run，旧记录及其证据保持只读。跨重启进程接管、取消标志恢复、从中断处继续，均不在本切片。

## 3. 审计数据

新增增量迁移 `V5__expert_agent_unknown_resolution.sql`，不改 V1～V4：

- 替换 `eap.expert_agent_run.state` 的取值约束，加入 `'closed-unconfirmed'`；保留原有的 `state='running'` 与 `owner` 互斥约束。
- 新增三列：`resolution_note text`、`resolution_operator varchar(64)`、`resolved_at timestamptz`。
- `resolution_note` 必填非空白，去首尾空格后 10–2000 字符，服务端校验。
- `resolution_operator` 取 `RuntimeWorkspace.OPERATOR_LABEL`（服务端标签），`resolved_at` 取服务端时间；请求体不接受身份或时间字段。

滚动部署兼容：未跑到 V5 的库没有这三列。`inspect()` 按需探测列是否存在，缺列时不返回审计字段；`resolveUnknown` 在缺列时拒绝并返回稳定错误码，不能让新代码在旧 schema 上报 `BadSqlGrammar`。

## 4. 可解除条件与并发

只有 `state='unknown'` 且 `expert_id` 匹配的行可解除。存储动作是单条条件 UPDATE：

```text
UPDATE eap.expert_agent_run
   SET state='closed-unconfirmed', resolution_note=?, resolution_operator=?, resolved_at=now(), updated_at=now()
 WHERE task_id=? AND expert_id=? AND state='unknown'
```

返回受影响行数：

- 0 行：行不存在/专家不符/已解除/本来不是未知 → 409 `AGENT_UNKNOWN_NOT_RESOLVABLE`；不存在但与 expert 不匹配时由既有 `journal.get()` 路径给 404 `AGENT_RUN_NOT_FOUND`。
- 1 行：同事务写 `eap.task` 投影，然后返回刷新后的详情。

重复解除是冲突而非幂等成功，避免第二次请求覆盖第一次的核对说明。解除与 Task 投影必须同事务，不允许出现「Run 已解除但 Task 仍 unknown」。

## 5. HTTP 与前端

- `POST /api/experts/{expertId}/agent-runs/{executionId}/resolve-unknown`，请求体仅收 `{"note": "..."}`；其他字段一律 `AGENT_INPUT_INVALID`，非字符串同样拒绝。
- 前端契约 `contracts/expertAgent.ts` 增加 `CLOSED_UNCONFIRMED`，`isExpertAgentStateBlocking` 对新值返回 false。
- `createExpertAgentApi` 增加 `resolveExpertAgentUnknown(expert, id, note)`。
- ExpertAgentPanel 对 `state === 'unknown'` 的运行增加「核对并解除」入口：note 10–2000 字符校验、显式勾选确认；提交后刷新详情。文案必须写明这是人工核对、不代表文件写入成功、不会续跑原执行。

## 6. 验证合同

- 领域/wire：新终态不在 active/blocking，非法值不被吞掉；后端与前端取值一致。
- 服务：note 校验、非未知行拒绝、二次解除冲突、审计取服务端值、条件 UPDATE 与 Task 投影同事务、失败时不留半投影。
- 控制器：字段白名单、非字符串 note、空体、服务错误码透传。
- DDL：隔离 schema 真 Postgres 上 V1→V5 迁移链、新状态可接受、审计列存在、条件 UPDATE 第二次影响 0 行、非未知行不可解除、旧状态保持。
- 既有写前/写后失联与重启故障注入（写中断 UNKNOWN 不重放）必须继续通过，作为「不得靠自动重试解除」的反证；本切片不新增自动重试路径。
- 前端：契约新值与 blocking 判定、API 调用、面板解除入口与 note 校验的定向测试。
- 全量：后端 `mvn test`、前端 typecheck/build/定向回归全绿；文档链接与 `git diff --check` 通过。

## 7. 明示不在范围

- 跨重启接管残留进程、恢复取消标志或从中断处续跑。
- 把人工解除写成文件写入成功、SQL 执行成功或候选 `APPLIED`。
- 通用源码候选 `CLOSED_UNKNOWN` 的任何语义复用；两个动作各自独立。
- 真实模型调用、真实数据库写入效果与用户产品接受。
