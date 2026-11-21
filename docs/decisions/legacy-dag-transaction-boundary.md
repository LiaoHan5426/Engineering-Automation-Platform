# 旧固定 DAG 执行的短事务分段边界（2026-11-21）

## 状态与范围

有效合同，关闭台账 `P1 / BM 旧DAG执行` 中"90 秒 REPEATABLE_READ 事务包住工具与模型调用"这一静态架构风险。

**只做一件事**：把 `ExpertExecutionService.execute` 从"一个长事务包住所有事"改成三段边界——短只读事务取快照、无事务执行外部调用、短写事务提交前复检并写回。

**明确不做**（仍为独立关口，不能因本片宣称完成）：

- 不把旧 DAG 变成后台任务、可恢复运行或可跨重启续跑；`FixedWorkflowRunner` 的 45 秒节点预算仍是唯一的时间上限，没有运行期取消端口。
- 不拆 workflow 模块对 SQL/MCP/JDBC 的依赖（跨模块拆分单独评审）。
- 不引入检查点、重放、从中断处续跑，也不改变"模型输出仅为待验证观察、不代表效果提升"的判定语义。
- 不替代 SQL Agent / Mission 的持久恢复与人工 UNKNOWN 解除；那些是另一条入口。

## 问题

改造前 `execute` 带 `@Transactional(isolation=REPEATABLE_READ,timeout=90)`，`definitions.require`、策略与规则包解析、知识授权查询、每个 `CapabilityHandler.handle`（CLI 进程 / MCP 网络 / 知识库 JDBC）、`policy.enhance`（模型 HTTP）以及末尾 `tasks.save` 全部落在同一个 90 秒事务里。后果是：一次慢模型或慢工具调用期间，数据库连接与 REPEATABLE_READ 快照一直被占用；且整个流程结束后才写回，执行期间专家定义被改/被禁用也无法在写回时发现。

这是静态架构风险，不是已复现故障；本片以离线测试证明分段边界，不声称已做真实慢调用压测。

## 决定

### 三段边界

1. **段 A｜短只读快照**（`ShortTransactionRunner.inRead`，`REPEATABLE_READ / readOnly / 10s`）
   读取并校验专家定义、解析专业行为策略与规则包、生成执行 id 与目标。产出不可变快照 `Run`。任何拒绝（定义不可用、agent 必须先走 Agent 入口、输入非法、策略缺失、图校验失败）都发生在此段，且**不打开任何执行资源**。

2. **段 B｜无事务外部调用**
   在正常事务边界之外打开 `ExecutionResourceScope`，运行 `FixedWorkflowRunner`（每个节点经 `CapabilityHandlerRegistry.resolveFor` 做专家级授权）、`policy.judge`、`policy.enhance`。工具/进程/网络/模型调用全部在此段，不持有数据库连接。45 秒节点预算、节点失败传播、规则缺证据标注、观察脱敏等语义原样保留。`try-with-resources` 仍保证本段结束即关闭本执行的 MCP 会话。

3. **段 C｜短写事务，提交前复检 + 写回**（`ShortTransactionRunner.inWrite`，`10s`）
   在同一短写事务内重新读取专家定义并与快照比对：定义被改动或在执行期间被禁用，则以 `EXPERT_REVOKED`（409）拒绝，**不写任何行**。复检通过后才调用 `tasks.save`，写回的 status/decision/modelEnhancement 与响应字段来自同一次计算，仍不分成两次写。

### 保持的语义（不得因分段改变）

- 45 秒调度预算包含授权/准备阶段；预算耗尽后不调用后续节点，包括可选节点。
- 专家级授权：`resolveFor` 的声明/开关检查、`knowledgeGrants` 过滤、`switchedOff` 检查与 `agent` 入口守卫原样保留。
- 失败恢复：节点失败或写回失败仍关闭本执行的 MCP 会话；写回失败不再持有会话（会话在段 B 结束即关闭）。
- 不重放、不自动重试、不伪造终态；模型调用仍受"仅当证据不足或显式请求时"约束，输出仍是 unverified。
- HTTP 请求字段、URL、响应结构与错误码不变；`execute(String,Request)` 签名不变。

### 兼容性

`ExpertExecutionService` 保留原 6 参数构造器，现有直接构造的测试与调用方不必修改；通过可选 setter 注入 `PlatformTransactionManager`，内部据此构造两个受限 `TransactionTemplate`（段 A 只读 REPEATABLE_READ/10s，段 C 读写 READ_COMMITTED/10s）。未注入事务管理器的组合仍可运行，段 A/C 退化为直接执行、各自按底层 auto-commit——这不改变业务结果，也不重新引入长事务。

## 测试与证据口径

- 新增边界测试用真实的 `TransactionTemplate` 包裹假事务管理器，在段 B 的 handler 回调与段 C 的写回回调里读取 `TransactionSynchronizationManager.isActualTransactionActive()`：handler 执行时为 false、写回时为 true，以此离线证明外部调用不在事务内（无事务即无连接绑定）。
- 复检失败必须零写回；授权失效仍在执行前阻断且零外部调用；写回失败仍关闭 MCP 会话；45 秒预算、规则缺证据标注沿用既有回归。
- 本片不验证真实数据库连接占用曲线、真实慢模型/工具压测、跨重启进程接管、用户产品接受；这些保持独立关口。

## 指针

台账 `P1 / BM 旧DAG执行`、`docs/decisions/agent-runtime-evolution.md` 的 EA-04 表与边界说明同步本决定；`docs/audits/extension-capability-audit.md` 中"90 秒同步事务"的风险描述按本片更新为已分段、但同步请求与后台运行能力仍不同。
