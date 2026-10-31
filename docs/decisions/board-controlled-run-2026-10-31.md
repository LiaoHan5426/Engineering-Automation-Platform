# 看板受控仓库检查与 Run 关联

2026-10-31，接续 [任务准备切片](board-task-preparation-2026-10-31.md)，对应 v1.6 §0B.11 RK-3～4 及 RK-6 的有限范围。用户授权按文档推进前后端，并于本轮授权使用内置 browser 验证。

## 实现范围

从已保存、信息完整的 ready 任务，显式确认服务端实际目录后启动一次只读 `git status`。任务标题、目标、验收条件、版本和请求身份持久关联既有 MissionExecution；后台执行、页面重读、输出与退出证据均已贯通。模型不会收到任务目标，没有自动生成源码或写仓库。Git 检查成功只表示该次检查成功，任务列保持 ready，独立验证与人工验收仍未完成。

复用 GitCapability、MissionGitExecutionService、MissionExecutionStore、RuntimeWorkspace 授权、现有进程超时/输出界限、Flyway/JDBC 和全部公共 UI。新增 BoardRunService 只负责任务快照、请求身份、任务锁和有限后台派发；未新增执行器、状态库、模型协议、调度依赖或 Hermes 服务。

| 落点 | 本轮职责 |
|---|---|
| `V6__board_task_runs.sql` | 将 board 来源加入内部 Handoff；新增 board_task_run 保存执行引用、任务版本、不可变快照和唯一请求身份，不重复存执行状态 |
| BoardRunService / BoardRunController | `/api/board/tasks/{taskId}/runs` 查询及启动，按 projectId 查任务，行锁协调领取，事务提交后派发 |
| MissionGitExecutionService / JdbcMissionExecutionStore | 预留既有执行记录、原子领取 CREATED、执行前重新授权和核对目录、复用既有执行及重启未知处理 |
| BoardTaskService | 返回 executionActive；存在未结束/结果未知 Run 时拒绝修改准备信息或移动任务 |
| runtime-client | BoardRunStart / BoardRun / BoardRunPage 以及查询和启动 API |
| `features/shell/BoardRunPanel.vue` / boardRunRequest | 领域界面与恢复记录，确认实际目录、有限轮询、快照及输出；由现有 PreviewBoard 组合 |
| `mock/boardBackend.ts` | 返回明确 unavailable，拒绝执行，不虚构模拟成功 |

UI 落点检查：已搜索并复用 Button、Badge、Collapse、ConfirmBox；判定为 L4 看板领域组件；没有新增原始基础控件、私有弹窗或通用共享类别；无需新增包/暂存登记；boundaries 通过。

## 状态、幂等与授权

- 启动须带 projectId、读取的 revision、UUID requestId 及用户已确认的服务端 workspacePath。路径仅用于核对，绝不替代 RuntimeWorkspace 授权；实际 cwd 由服务端决定，不采用浏览器分组中的路径偏好。
- 锁定任务后检查版本与 ready 条件，再按新事务快照检查活跃执行。等待行锁的并发请求不会因旧快照而漏看前一次已提交的 Run。不同请求不能同时领取同一任务；执行中任务字段不能修改。
- `(task_id,request_id)` 唯一；重复请求在版本检查前返回原 Run，包括原 Run 已结束或任务随后被编辑的情况。同一请求身份携带不同原版本/目录则 409，不会重复执行。
- 单个任务快照对应一次内部 Handoff/Mission；关联及执行预留在同一事务中完成，拒绝授权或目录变化会整体回滚。沿用旧 Mission 启动/取消端点操作 board 来源被拒绝，防止绕过看板领取合同。
- 后台派发最多 2 个 worker、16 个排队请求；队列满写入明确 FAILED/BOARD_QUEUE_FULL。数据库状态必须提交后才能派发。页面卸载不停止服务端 worker。
- worker 原子领取 CREATED 且 unconfirmed_reason 为空的记录；重复调用 worker 不重新执行。启动前再次核对授权、目录及可执行文件。服务重启将遗留 open Run 标为结果未知，未知记录不能领取且阻止新请求；不会擅自接管或终止旧进程。
- 看板暂不提供取消操作，并在 UI 中说明。既有执行器的超时/结果分类保留，取消请求不等同于已结束。本轮未扩展跨进程恢复、自动调度或无人值守。
- 前端将未确认启动请求存入按任务及真实/mock来源隔离的 sessionStorage。断线后先查询原请求的 Run；可重试同一请求，刷新/重开也不换身份。恢复记录无法保存时不发送。
- GET 返回最近 30 个 Run；页面最多每 2 秒查询一次、自动查询 60 次，然后显示手动刷新提示；结果未知停止自动轮询。旧页面/旧任务响应被丢弃，读取失败保留已知输出。

## 验证证据

数据库 V1～V6 全部应用，Flyway validate 成功；未修改已应用的 V1～V5。用户的 application.yml 保持原变更，未修改工作区授权配置。

- `rtk proxy pnpm --dir frontend test run`：71 个文件、252 项通过；typecheck、build、check:boundaries 通过。构建仍存在原主包/GrapesJS 大于 500 KB 的分块提示。
- 同时启用 `EAP_RUN_BOARD_PERSISTENCE=true`、`EAP_RUN_MISSION_GIT_ACCEPTANCE=true` 后运行 `rtk proxy mvn -f backend/pom.xml test`：298 项，293 通过、0 失败/错误、5 条件跳过。未启用真实供应商、Codex 配置读取、建删库 CLI/原型测试；schema probe 单独由 Flyway 当前库验证补充，不将跳过计为通过。
- 新增 BoardRunPersistenceTest：在现有已迁移 PostgreSQL 的随机自有任务和 `@TempDir` 隔离 Git 仓库验证真实输出与 cwd、结束后重复请求去重、任务快照保持、跨项目拒绝、不同/相同请求并发、运行期拒绝修改、授权回滚、目录变化回滚、旧端点拒绝、worker 重复调用、重启未知阻塞、队列拒绝及真实 Git 失败。6 项实际运行，不创建或删除数据库/schema，清理仅针对自身样例。
- 新增 BoardRunPanel.test.ts：确认后才启动、请求丢失与重开恢复、按请求身份核对已保存 Run、未知阻塞、轮询次数上限及读失败保留、项目切换忽略旧响应，共 6 项通过。
- 浏览器经运行中的 5173 + 8080 完成：确认实际工作目录→真实 git status→输出/退出码；故意丢失 POST 响应后 GET 找回原 Run；终态重试保持一个 Run；跨项目 404、旧 Mission 入口 409；刷新后 Run 仍可见；任务保持 ready；390px 详情可滚动且不越界；pageerror 为 0。浏览器使用独立 context 和随机项目，样例已定向清理。
- 用户重启 5173 后在该端口完成验收；临时 5174 服务已停止。内置 browser 已发出打开看板请求，但 computer-use 的本机 native pipe 不可连接，故未声明内置浏览器验收完成；以上行为证据来自独立 Playwright Chromium。
- `git diff --check` 通过。未提交/推送，未调用付费模型，未重启用户后端服务。

## 后续边界

RK-3 的本切片启动领取与幂等、RK-4 的一次确定性只读检查已验证；RK-6 的页面重读、失败/未知呈现及取消能力标注已覆盖。它们不表示通用开发任务执行已完成。下一步仍是 RK-5：原型设计版本→任务→Run→Diff→独立验证→人工验收的证据关联，以及相应受控源码执行。没有证据不能将任务推进 acceptance/done。Transfer/TreeSelect/虚拟树等原 UI 候选状态不因本轮业务开发改变。
