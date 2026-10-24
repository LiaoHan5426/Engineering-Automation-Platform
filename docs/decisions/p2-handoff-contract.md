# P2 交接记录：Chat / Builder → 持久意图

状态：本文件是 P2 的最小契约，并已按它实现记录接口。它不是 Mission 调度，也不把原型里的模拟卡片变成自主执行。日期：2026-10-24。

## 现状

| 对象 | 持久性 | 实际生命周期 | 不能当成 |
|---|---|---|---|
| `eap.task` 与 `eap.task_observation` | PostgreSQL | `POST /api/tasks` 同步规划并可能执行能力；工作台「重新运行」会用同一目标再执行 | Mission、交接、审批 |
| S1 对话 | 进程内存 | 重启或离开页面后界面不恢复 | 任务源 |
| Builder 草稿、按钮次数、模拟审批 | 浏览器 `eap.plugin.instance.*` | 只在本机原型存储中恢复 | 授权或执行 |
| Mission Runtime | 不存在 | 无调度、无重启恢复、无审批状态机 | 已交付能力 |

插件 Manifest 里的 `mission.create` 与 `repository.write` 仍只是申请。`GRANTS` 继续为空。

## 持久源与边界

P2 的持久源是新表 `eap.handoff`，不是 `eap.task`。这样分析工作台的重新运行不会把一条交接拿去执行。

一条交接只保存：`id`、`source`（`chat` 或 `builder`）、`sourceRef`、脱敏后的 `summary`、`createdAt`。状态列由数据库约束固定为 `recorded` / `not_started` / `not_requested` / `none`。没有执行接口，没有观察记录，不调用模型、规划器或能力。

`sourceRef` 只是来源标签：对话用当前会话 id，没有会话时用 `draft`；Builder 用 `builder-alpha` 或 `builder-beta`。它不授予仓库，也不指向文件系统。请求体只允许 `source`、`sourceRef`、`summary`。带上 `status`、`execution`、`approval` 或 `grant` 的请求直接拒绝，不会入库。

同一次点击在请求返回前会挡住后续点击，所以双击只产生一条记录。返回之后再次点击是一次新的显式提交。服务端失败，或返回的状态不是 `recorded` / `not_started` / `not_requested` / `none` 时，界面不显示已记录，对话输入和 Builder 草稿保持不变。

模拟任务卡片和「记录一次模拟审批」仍只改本地草稿，不调用交接接口。记录交接是旁边单独的按钮，操作者当次提交的文本才进入 `summary`。

## 未做

完整 Mission 的规划、执行、审批、恢复和看板调度仍未做。外部 Agent、Electron、GrapesJS 和仓库写入仍未做。
