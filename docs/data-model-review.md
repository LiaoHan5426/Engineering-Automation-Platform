# 数据模型评审：库表与目标架构的对齐

> 状态：架构评审与调整建议（2026-11-21）。本文评审现行 `V1__initial_schema.sql`（29 张表），
> 指出「已建表但支撑不了目标运行」的部分，给出调整方向。**不直接改写已应用的 V1 基线**——
> 任何结构调整走增量迁移，并按 [architecture-method.md](architecture-method.md) §1 的三条公理判定。
>
> 上位：[架构方法总纲](architecture-method.md) §2/§3/§4/§5 · 事实源：[running-context.md](running-context.md)
> 实现基线：当前 `V1__initial_schema.sql`（2026-11-13 合并 V1–V37，29 表约束）· 真实代码见 `backend/`

---

## 0. 评审结论（先看这一段）

现行 29 张表按「是否支撑目标架构」分四类：

| 类别 | 数量 | 判定 | 处理 |
|---|---|---|---|
| **A 支撑运行的核心表** | 26 张 | 有真实读写路径、约束与设计一致 | 保留，仅补文档对齐 |
| **B 名义已开发、实际是固定值壳** | `handoff`、`mission` | 所有状态列被 CHECK 锁死为单一值，「没有后续状态机 / 没有完成态 / 没有验证入口 / 不授予权限」 | **收敛为一张事件表或降级为纯记录**，不再声称是运行时 |
| **C 结构落后于实际用途** | `mission_execution` | 表被 Board 系列当通用执行载体，但 CHECK 与写入都写死 `capability='git-status'`、`principal='local-operator'`、`approval='NOT_REQUIRED'` | **去硬编码**，让约束反映真实的多能力执行；或明确它就是 git 专用并停止复用 |
| **D 支撑 superagent/subagent 的表缺失** | — | 目标架构 §4 的委派合同、子任务状态、独立验证结论、跨任务工作记忆没有对应持久化 | 按落地路线**增量新增**，不预判、不空建 |

一句话：**问题不在表少，而在几张表用「固定值约束」伪装成已经实现的运行时，同时目标多 Agent 编排所需的数据模型尚未进入 schema。** 本次调整以「拆穿壳、去掉硬编码、按需补表」为原则。

---

## 1. 判定方法（为什么这些表算「不支撑运行」）

一张表要算「支撑运行」，必须同时满足三条；缺任一条就是名义实现：

1. **状态可变**：状态列有真实的迁移路径，不是被 CHECK 锁成单一常量。
2. **有执行/验证接口**：有服务或控制器真正推进状态，而不只是 insert + list。
3. **约束与设计一致**：CHECK/注释描述的能力范围，与实际写入的值一致。

用这三条核对 schema 里的自述注释与代码写入值，结论如下。

---

## 2. A 类：支撑运行的核心表（保留）

这些表有真实读写、约束与设计一致，是平台的实际事实基础：

| 表 | 支撑的能力 | 关键设计（可复用内容） |
|---|---|---|
| `eap.task` | 一次分析运行 | 重跑新增行不覆盖 → "这次和上次差在哪"可回答；`model_enhancement` 区分 NULL/skipped/unverified-observation/unavailable |
| `eap.task_observation` | 能力执行证据 | 原始 stdout/stderr 脱敏后留存，可独立核对 |
| `eap.knowledge_base` / `document` / `chunk` | 知识检索 | deny-by-default 授权；分段可定位引用；FTS + 关键词，无向量 |
| `eap.expert_definition` | 专家定义 | 配置不是代码；manifest 携带 behavior 版本、steps/edges、资源引用 |
| `eap.rule_pack` | 规则包 | 规则是数据，改 manifest 不改代码；`requires.capabilities` 与事实词表校验 |
| `eap.expert_knowledge_grant` / `database_grant` / `mcp_grant` | 授权 | 只在启用时写入、停用即撤销；草稿引用不授权 |
| `eap.database_profile` | 脱敏结构快照 | 不连业务库、不执行用户 SQL |
| `eap.mcp_server` / `capability_setting` / `cli_program` / `cli_channel` / `cli_operation` | 能力目录与管理 | 缺省即启用、停用≠缺失、在用不能关；MCP 专家级授权 |
| `eap.skill_version` | Skill 文本版本 | 不可变版本 + 乐观 CAS 启停；digest 绑定来源 |
| `eap.scenario_definition` | 场景配置 | CAS revision + 删除墓碑，配置≠执行/授权 |
| `eap.prototype_version` | 原型版本 | 不可变、幂等请求身份 `request_id`，响应丢失可只读核对 |
| `eap.prototype_delivery` | 可审阅交付单 | 一个版本至多一张（唯一约束）；注释明确「不绑定仓库、不调用 Agent、不是交接」，语义单一而非状态机壳 |
| `eap.board_task` / `board_task_run` | 工作台任务与运行 | Board 任务主记录与逐次运行；权威执行态在此与 `mission_execution`，不在 `mission` 壳 |
| `eap.code_generation` / `code_proposal` | 源码候选与交付 | 不可变源证据 + 人工审批 + 基线/UNKNOWN 互锁 + 触发器防篡改 |
| `eap.expert_agent_run` | SQL 只读 Agent 续跑 | 检查点/租约/预算/审批 digest，跨 JVM 恢复；UNKNOWN 不重放 |
| `eap.tool_execution` | 受控工具执行 | 在途/UNKNOWN 互锁 + 人工 closure，不归属虚构 Mission |
| `eap.chat_conversation` / `chat_message`（V2） | 已发送消息图的后端权威 | 不可变追加树：编辑/重生成新增节点不覆盖旧节点；同级 `version` 标识兄弟分支；复合外键保证父子同会话；`execution_id` 仅挂助手节点；触发器禁止 UPDATE/DELETE。见 [本地历史迁移方案](decisions/local-chat-history-migration.md)——旧本机记录不导入、不伪造执行身份 |

> 注：`knowledge_chunk.embedding_model` / `embedding_version` 两列是为将来向量检索预留、当前恒为 `not-embedded` 的字段。
> 它们不是壳表，但属于「为未来概念预建列」——按 [总纲 §5.6](architecture-method.md#sec-5-6-rules)
> 的原则，**向量列应在检索评测证明词法不足后再增**，不应先占位。建议保留现状但在文档中标注为「未启用，非承诺」，或后续增量迁移移除。

---

## 3. B 类：固定值壳表（需要收敛）

### 3.1 `eap.handoff` — 只有记录，没有后续

schema 自述（原文）：

- `status` CHECK 固定 `recorded`，注释「固定 recorded。没有后续状态机。」
- `execution` 固定 `not_started`，注释「本表没有执行接口。」
- `approval` 固定 `not_requested`，「记录交接不是审批。」
- `grant_state` 固定 `none`，「记录交接不产生授权。」

代码核对：`HandoffService.record()` 把四个字段写死为 `"recorded"/"not_started"/"not_requested"/"none"`（第 39–42 行），
只提供 `record/list/detail`，没有任何推进方法。

**判定**：这不是任务运行时，只是一个带固定尾巴的「交接备注」。它本身无错——问题在于名字和四个字段暗示了一个不存在的状态机。

**调整建议（二选一，按总纲 §4.6 阶段择机）**：

- **收敛（推荐）**：去掉四个固定列，表退化为 `handoff(id, source, source_ref, summary, created_at)` 的纯事件记录；
  文档明确「交接是操作者留下的意图标记，不驱动任何执行」。
- **或废弃合并**：把 `source/source_ref/summary` 并入 `task` 的一个可选 `origin` 字段，取消本表。

### 3.2 `eap.mission` — 未执行任务壳

schema 自述（原文）：

- 「由一条交接显式建立的未执行任务壳。没有调度、审批、取消、续跑或验证执行。」
- `status` 固定 `created`（「本表没有完成态」）、`approval` 固定 `not_requested`、
  `verification` 固定 `not_requested`（「本表没有验证入口」）、`grant_state` 固定 `none`。

代码核对：`MissionService.create()` 的 `shell()` 把状态写死（第 65–70 行），只有 `create/list/detail`。

**判定**：与 `handoff` 同为壳，且 `handoff` → `mission` 是一条"两次 insert、状态都不动"的空转链。真正的执行证据在 `mission_execution` 与 `board_task_run`，不在这里。

**调整建议**：`mission` 表是历史遗留的第一切片外壳。**并入或废弃**：让 Board 任务（`board_task`）直接引用执行记录，不再经过 `handoff → mission → mission_execution` 三层外壳；若短期不能动代码，至少在文档中标注「mission 是兼容壳，权威执行态在 mission_execution / board_task_run」，不再作为目标架构的运行时介绍。

---

## 4. C 类：结构与用途冲突的表

### 4.1 `eap.mission_execution` — 表被泛化使用，约束仍写死 git-status

冲突证据：

| 位置 | 内容 |
|---|---|
| schema CHECK | `mission_execution_capability CHECK (capability = 'git-status')`、`mission_execution_principal CHECK (principal = 'local-operator')`、`mission_execution_approval CHECK (approval = 'NOT_REQUIRED')` |
| schema 自述注释 | 表注释「Mission 的一次只读 git-status。进程成功不表示任务壳完成。」；`capability` 列注释「固定为 git-status」；`approval` 列注释「固定 NOT_REQUIRED，不能写成 APPROVED」——**表结构自己就承认是单能力专用** |
| `JdbcMissionExecutionStore.insertOpen` | SQL 写死 `'git-status'`, `'local-operator'`, `false`, `'NOT_REQUIRED'`（第 40 行） |
| 实际调用方 | `BoardRunService` / `BoardVerificationService` / `BoardDeliveryService` / `BoardReviewService` / `WorkspaceInterlock` 等把它当作**通用执行记录载体** |

**判定**：这是最典型的「已开发但不能支撑目标」——表在服务层已经被当成多用途执行日志，但数据库约束把它钉死在一个 2026-10 阶段的 git-status 单一能力上。名称（`mission_execution`）与实际语义（Board 运行/验证/交付各阶段的通用执行行）也已脱节。

**调整建议**（去硬编码 ≠ 删安全约束，三列要区别对待）：

- **只放宽 `capability`**：改为受控枚举（`git-status / git-diff / board-verification / board-delivery / board-review`），
  写入端由服务传值而非 SQL 常量；**不要改成无约束的自由文本**。
- **`principal` 保留服务端语义**：去掉「必须等于 `local-operator`」的值硬编码，但仍由服务端写入、不接受请求参数
  （列注释「服务端常量，不来自请求」是正确的安全语义，必须保留）。
- **`approval` 不放宽**：列注释明确「不能写成 APPROVED」，这是「记录交接不产生授权」的安全边界；
  若将来 Board 真有审批流程，应另开列或另表，而不是把本列扩成审批态。
- **正名**：在文档与后续迁移中把它描述为「工作台执行记录」（统一执行日志），`mission` 仅作为可选来源标签；
  或拆分为独立的 `board_execution` 表，让 `mission_execution` 回归 git 专用。
- **不变量等价保留**：`mission_execution_status`、`mission_execution_terminal_evidence`（CANCELLED/INTERRUPTED
  必须有退出证据）、在途互锁、UNKNOWN 不重放——一个都不能因泛化而删掉。

---

<a id="sec-5-target-tables"></a>
## 5. D 类：目标多 Agent 架构缺失的表（按路线增量新增）

[总纲 §4](architecture-method.md#sec-4-agents) 的目标架构需要以下持久化，当前 schema 没有对应结构。**这不是缺陷，因为该能力仍在规划态**；列出是为了让后续切片有明确的落点，避免空建。

| 目标概念 | 建议表（落点，未实现） | 关键字段 | 前置条件 |
|---|---|---|---|
| 委派合同 | `agent_delegation` | parent_run、child_run、goal、input_snapshot、allowed_tools/budget（JSON）、状态 | Superagent 监督层成型后 |
| 子任务运行 | 复用/扩展 `expert_agent_run` | 增加 parent_delegation_id、role（super/sub） | 近期：Subagent 泛化切片 |
| 独立验证结论 | `verification_result` | run_id、checks、evidence_hash、verdict、验证者身份 | 独立于执行者的验证服务落地 |
| 跨任务工作记忆 | `task_working_memory` | task_id、constraints/facts、来源/版本、失效标记 | 记忆与撤权合同确定后 |

**硬约束**：这些表必须在对应 roadmap 关口通过后、随实现一起增量新增；不得先建空表充数。每新增一张表，同步更新本文 A 类清单与 [总纲 §7 文档地图](architecture-method.md#sec-7-map)。

---

## 6. 与三大诉求的对应关系

| 诉求 | 本文结论 |
|---|---|
| 前后端规范 | schema 是后端唯一事实：`principal`/`workspace_path` 等由服务端绑定，禁止浏览器提供（与 [总纲 §3.4](architecture-method.md#sec-3-4-contract) 一致） |
| superagent/subagent | 现行表只支撑「单 Agent 续跑」；委派/子任务/独立验证表按 §5 增量新增，不在本轮空建 |
| 知识库/规则本地执行、简单任务不调模型 | `knowledge_*`/`rule_pack`/`task.model_enhancement` 已支撑本地确定性路径；向量列标注为未启用，不为未来概念预建执行能力 |

---

## 7. 建议增量迁移草案（未应用，仅供评审）

> **状态：消息图（V2）已在用户显式授权后落地；M1/M2/M3 仍为草案、未建迁移文件。**
> V2 落点：`V2__chat_message_graph.sql`（已应用到 fresh schema 由 Flyway 验证，隔离 schema DDL 契约测试通过）。
> 以下 M1/M2/M3 是「库表也可以调整」的其余可落地骨架，供评审与后续切片取用。
> 硬约束：不改已应用的 `V1__initial_schema.sql`；每个调整单独一个 `V2+` 迁移；执行前须用户显式授权；
> 先迁移写入方代码，再改约束；按 [running-context.md](running-context.md) 禁用自动 clean/repair/baseline。

### 7.1 M1 — `mission_execution` 去硬编码（优先，可独立交付）

```sql
-- 建议文件：V2__mission_execution_capability_decouple.sql（未应用）
-- 只放宽 capability；principal / approval 的安全语义保持不动。

ALTER TABLE eap.mission_execution
    DROP CONSTRAINT mission_execution_capability;

ALTER TABLE eap.mission_execution
    ADD CONSTRAINT mission_execution_capability
    CHECK (capability IN (
        'git-status', 'git-diff',
        'board-verification', 'board-delivery', 'board-review'
    ));

COMMENT ON TABLE eap.mission_execution IS
    '工作台执行记录。capability 标识本次执行的能力；进程成功不等于任务完成。';
COMMENT ON COLUMN eap.mission_execution.capability IS
    '本次执行的能力标识，由服务端写入；枚举外的值被拒绝。';

-- 明确不改变：mission_execution_status
--             mission_execution_terminal_evidence（CANCELLED/INTERRUPTED 必须有证据）
--             mission_execution_principal（服务端常量，不来自请求）
--             mission_execution_approval（固定 NOT_REQUIRED，不能写成 APPROVED）
```

配套代码改动（必须同切片完成）：`JdbcMissionExecutionStore.insertOpen` 的 `capability` 改为入参，
由各 Board 服务传入；`principal`、`approval` 仍由服务端常量写入，不接受请求参数。

验收门禁：① 现有 git-status 路径回归通过；② 负例——写入枚举外 capability 被约束拒绝；
③ 取消/中断终态仍强制 `exit_evidence` 非空；④ 在途互锁与 UNKNOWN 不重放回归通过。

### 7.2 M2 — `handoff` / `mission` 收敛（需先停写，风险较高）

```sql
-- 建议文件：V3__handoff_mission_converge.sql（未应用）
-- 方案 A（推荐，破坏性最小）：handoff 退化为纯事件记录。
-- DROP COLUMN 会级联删除依赖它们的四个固定值 CHECK
-- （handoff_status_recorded / handoff_execution_not_started /
--   handoff_approval_not_requested / handoff_grant_none）；handoff_source 保留。
ALTER TABLE eap.handoff
    DROP COLUMN status,
    DROP COLUMN execution,
    DROP COLUMN approval,
    DROP COLUMN grant_state;

COMMENT ON TABLE eap.handoff IS
    '操作者留下的交接意图标记（纯记录）。不驱动执行、不产生授权、没有状态机。';
```

```sql
-- 方案 B（二选一，需单独授权）：废弃 mission 壳，board_task 直接引用执行记录。
-- 本草案刻意不提供 DROP TABLE：旧数据处置、mission_execution.mission_id 外键重建、
-- 以及调用方迁移须先完成并单独评审，避免在线删表丢失历史。
-- 此处仅登记为待办，不写成可执行语句。
```

前置条件：`HandoffService` / `MissionService` 写入路径先迁移；明确旧行是保留、归档还是迁移，
**禁止静默丢弃**。这也是 §8 风险提示「壳表收敛要先停写」的原因。

### 7.3 M3 — 目标多 Agent 表（随实现增量，不空建）

[§5](#sec-5-target-tables) 列出的 `agent_delegation`、
`verification_result`、`task_working_memory` 与 `expert_agent_run` 扩展**不在此轮建**。
前置条件与增量原则见 §5 硬约束：随对应 roadmap 关口通过后的实现切片一起新增；
每新增一张，同步回写本文 A 类清单与 [总纲 §7 文档地图](architecture-method.md#sec-7-map)。

### 7.4 草案自检

| 检查 | 结论 |
|---|---|
| 是否改写了已应用 V1？ | 否，全部为 V2+ 新增迁移 |
| 是否为「通用」删掉安全约束？ | 否，principal / approval / terminal_evidence / status 均保留 |
| 是否先空建目标表？ | 否，M3 明确不建 |
| 是否含不可逆破坏性语句？ | 否，未含 DROP TABLE；删列前要求先停写与数据处置评审 |
| 是否需要显式授权？ | 是，三个迁移均标注未应用 |

---

## 8. 调整顺序与风险

```text
1. 文档层（本轮，零风险）：在总纲与本文标注 B/C 类的真实状态，停止把壳表当运行时介绍
2. 约束对齐（后续切片）：mission_execution 去硬编码 + 等价保留安全不变量（需迁移 + 回归）
3. 壳表收敛（后续切片）：handoff 去固定列 / mission 并入 board_task（需代码同步 + 数据处置）
4. 目标表（按路线）：superagent/subagent 相关表随实现增量新增，不空建
```

风险提示：

- **不要为了"通用"删安全约束**：放宽 capability CHECK 时，UNKNOWN 不重放、在途互锁、终态证据必填必须等价保留。
- **壳表收敛要先停写**：`handoff`/`mission` 仍有 Controller 与写入路径，改结构前须先迁移调用方并明确旧数据处理，不能在线改约束。
- **物理迁移需显式授权**：按 [running-context.md](running-context.md)，禁用自动 clean/repair/baseline；任何结构调整走增量迁移，历史版本不改写。
- **向量列不是承诺**：`embedding_*` 恒为 not-embedded，不得据此宣称具备语义检索。
