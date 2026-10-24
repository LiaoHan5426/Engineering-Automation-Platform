# Handoff → Mission：未执行任务壳

状态：已确认。第一切片按本文件实施，只建立未执行任务壳。不授权调度、审批、取消、续跑、验证执行或仓库写入。日期：2026-10-24。

前置记录见 [P2 交接契约](p2-handoff-contract.md)。`eap.handoff` 只保存未执行意图。创建 Mission 是另一次显式操作，记录交接不会自动产生 Mission。

## 对象区别

| 对象 | 持久性 | 含义 | 完成意味着 |
|---|---|---|---|
| `eap.handoff` | PostgreSQL | 操作者提交的意图原文 | 已记录。没有完成态 |
| `eap.mission` | PostgreSQL | 由一条交接显式建立的任务壳 | 独立验证通过。执行进程成功不算完成。第一切片还没有完成态 |
| `eap.task` | PostgreSQL | 分析工作台的一次同步规划与能力运行 | 分析流程结束。工作台重新运行会再执行 |
| S1 会话 | 进程内存 | 当前对话 | 不恢复，也不是任务 |
| Builder 草稿与模拟审批 | 浏览器本地 | 原型编辑状态 | 不读取，不构成审批或授权 |

Mission 不写入 `eap.task`，不调用 `TaskService`、`DeterministicTaskPlanner`、模型或能力。会话 id 与 `builder-alpha` / `builder-beta` 仍只是交接上的来源标签。

## 显式创建与关联

创建请求只允许 `handoffId`。服务端读取已存在的交接；找不到则拒绝，不新建交接。Mission 保存平台生成的 `id` 和 `handoff_id`。摘要、来源与来源标签通过这条关联读取，不接受客户端改写，也不复制一份可分叉的目标。

同一条交接在第一切片里至多对应一条 Mission，由 `UNIQUE(handoff_id)` 保证。并发创建也靠这个约束，不能只做“先查再插”：两个请求同时通过查询时，后写入的一行会触发唯一冲突，服务端再读出已提交的那条并返回它，不插入第二行。先创建成功的响应可以是新建；冲突后的响应必须是同一 `id`。这与交接按钮的约定不同。交接在请求返回后再次点击会再记一条；Mission 对同一交接保持一条。

`UNIQUE(handoff_id)` 只适用于第一切片。终态之后允许再次创建，属于后续契约和一次新的迁移，用来替换这条全表唯一约束。本轮不实现 `previous_mission_id`，也不定义终态后的关联方式。

请求若带上 `status`、`execution`、`approval`、`verification`、`grant` 或其他字段，直接拒绝，不入库。

## 持久状态与完成条件

第一切片把状态列固定为：

| 列 | 固定值 | 含义 |
|---|---|---|
| `status` | `created` | 任务壳已建立 |
| `execution` | `not_started` | 没有执行记录 |
| `approval` | `not_requested` | 没有申请审批 |
| `verification` | `not_requested` | 没有验证入口，也没有验证结果 |
| `grant_state` | `none` | 没有授权 |

首版保存 `verification`，并用约束固定为 `not_requested`。当前没有验证入口。界面不得显示“已完成”或“验证通过”；成功文案只能表示任务壳已建立。返回值里的 `verification` 不是 `not_requested` 时，按创建未成功处理。

完成条件现在只定义、不实现：Mission 变为 `completed` 只能发生在独立验证记录为 `passed` 之后。执行结果 `succeeded`、分析任务 `completed`、模型返回文本、Builder 模拟审批，都不能把 Mission 标成完成。验证状态与执行状态分开，沿用 [P1 执行合同](p1-cli-codex-design.md)：执行服务可以报告进程结果，不能自行宣布业务完成。

## 创建与授权分离

创建 Mission 只插入上述任务壳。它不授予 `repository.write`，不读取 Manifest 里的 `mission.create` 申请，也不把 `GRANTS` 从空数组改为有内容。以后的授权必须是单独动作，默认仍是不执行、不授予。

## 审批、取消、失败、恢复与验证

这些边界属于后续切片，第一切片不提供对应接口：

- 审批是平台上的单独决定。默认 `not_requested`。Builder 的“记录一次模拟审批”不参与。
- 取消只作用在未来的执行或 Mission 终态上，必须幂等，且不删除交接、Mission 或已有证据。
- 执行失败属于某一次执行，执行使用新的 `executionId`，`ownerRef` 指向 Mission。失败不删除 Mission，也不把它标成完成。重试将来新建执行并关联上一次，不覆盖旧证据。创建请求失败不是这种执行失败。
- 第一切片没有在途工作。进程重启后，已创建的 Mission 仍是 `created` / `not_started` / `not_requested`，不会自动开始。以后若重启时发现未终结执行，标记为 `interrupted` 并保留证据；恢复必须再由操作者显式发起。
- 独立验证读取 diff、构建与测试结果，不信任执行方自报的完成。验证未做之前，Mission 不能进入 `completed`。第一切片没有验证入口。

## 创建请求失败

创建被拒绝或数据库报错时，Mission 仍是未开始或不存在。界面不得显示创建成功，也不得显示“已完成”或“验证通过”。

| 情况 | 响应 | 数据 |
|---|---|---|
| 交接不存在 | 404 | 不插入 Mission |
| 请求不是只含 `handoffId` 的 JSON 对象，或字段类型不对 | 400 | 不插入 Mission |
| 数据库连接、约束或写入失败 | 500 | 不把失败当成已创建。唯一冲突除外，按上面的并发规则返回已存在的同一 Mission |

## 第一实施切片

范围：新增 `eap.mission` 与只读关联；`POST` 仅接受 `handoffId`；并发或重复创建在唯一冲突后返回同一行；按 id 查询；非法字段与未知交接被拒绝。界面可以有单独的“创建 Mission”动作。数据库约束锁住 `status`、`execution`、`approval`、`verification`、`grant_state`。测试要证明没有新增 `eap.task`、没有能力调用、没有授权写入，并且没有 `previous_mission_id`。

验收：迁移与 `UNIQUE(handoff_id)` 在实际库生效；并发冲突返回同一 Mission；重启后同一 `handoffId` 仍指向它，来源摘要不变，`verification` 仍是 `not_requested`。交接不存在返回 404，非法请求返回 400，二者都不插入。数据库失败返回 500，界面不显示创建成功，也不显示“已完成”或“验证通过”。不验收调度、审批、取消、执行失败转移、终态后重建、重启后续跑、仓库写入或独立验证。

第一切片已按本文件实施。调度、审批、取消、续跑、验证执行、终态后重建和仓库写入仍未做。只读单步执行契约已确认，见 [Mission 单步执行契约](mission-single-step-execution-contract.md)，实施尚未授权。
