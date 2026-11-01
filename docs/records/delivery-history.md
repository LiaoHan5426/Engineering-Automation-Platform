# 任务、源码与交付证据总览

## 当前结论与阅读方式

任务准备 → 受控只读Run → 原型引用 → 仓库审阅 → 独立验证 → 源码交付 → 生成前基线/持久应用 → POST_HOC/PREBOUND。已落地的是这些有限切片；真实供应商在EAP内改造自身页面、多文件开发及用户最终接受仍未完成。Git Run不是源码作者，UNKNOWN/APPLYING继续阻塞，未完成项以[接续台账](../planning-status.md)为准。

以下按主题合并完整阶段记录，日期保留在记录中而不再作为文件名。记录中的“本轮/未提交/下一步”和测试数字仅代表当时快照；不得覆盖上面的当前结论、有效产品合同或用户授权。原文完整保留（只调整标题层级、锚点及链接），后续更新本总览，不另建日期报告。

## 记录索引

| 原记录 | 完整章节 |
|---|---|
| `docs/decisions/board-task-preparation-2026-10-31.md` | [看板任务准备与并发更新切片](#board-task-preparation) |
| `docs/decisions/board-controlled-run-2026-10-31.md` | [看板受控仓库检查与 Run 关联](#board-controlled-run) |
| `docs/decisions/board-prototype-link-2026-10-31.md` | [原型版本、看板任务与 Run 快照关联](#board-prototype-link) |
| `docs/decisions/board-run-review-2026-10-31.md` | [Run 仓库审阅快照与空白检查](#board-run-review) |
| `docs/decisions/board-run-verification-2026-10-31.md` | [Run 独立验证：实施合同与进度](#board-run-verification) |
| `docs/decisions/board-source-delivery-2026-11-01.md` | [源码交付证据与人工验收切片](#board-source-delivery) |
| `docs/decisions/code-generation-baseline-2026-11-01.md` | [生成前持久基线（PB-02 最小切片）](#code-generation-baseline) |
| `docs/decisions/code-proposal-application-2026-11-01.md` | [持久候选与受控单文件应用（PB-03）](#code-proposal-application) |
| `docs/decisions/board-application-evidence-2026-11-01.md` | [Chat 应用证据与看板交付的事后关联](#board-application-evidence) |
| `docs/decisions/code-task-prebinding-2026-11-01.md` | [生成前 Task 绑定与交付归因最小切片](#code-task-prebinding) |

---

<a id="board-task-preparation"></a>

## 看板任务准备与并发更新切片

来源：`docs/decisions/board-task-preparation-2026-10-31.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/board-task-preparation-2026-10-31.md -->
<a id="board-task-preparation--看板任务准备与并发更新切片"></a>
### 看板任务准备与并发更新切片

日期：2026-10-31。对应 v1.6 §0B.11 的 RK-1、RK-2，以及 RK-3 中草稿状态更新的部分。该记录描述已实现和已验证范围，不将待处理视为已领取、已运行或已验收。

<a id="board-task-preparation--能力与依赖审查rk-1"></a>
#### 能力与依赖审查（RK-1）

| 当前能力 | 本轮决定 | 后续边界 |
|---|---|---|
| `eap.board_task` / BoardTaskService | 复用为按项目隔离的任务准备记录，补目标、验收条件、请求身份 | 不是第二个执行器 |
| `eap.task` / TaskService | 保留分析运行及 Observation 模型 | 不把分析 Run 当看板草稿 |
| MissionService / MissionGitExecutionService / mission_execution | 保留 Handoff 关联、执行记录、授权检查、确定性 Git 执行 | 下一切片建立看板到既有执行合同的明确关联，不能直接改列伪造 Run |
| Spring JDBC、PostgreSQL、Flyway | 复用现有事务、唯一约束、行锁及增量迁移 | 不增加另一份状态库或任务调度服务 |
| Vue、原生拖放与 `@eap/ui` | Button、Input、Textarea、Select、Dialog、ConfirmBox、Collapse 均复用公共入口；禁用状态由服务端合同驱动，拖放仍提交同一受检 API | 无新增拖放库、状态机库或 Hermes 服务依赖；当前交互不需要这些依赖 |

单一状态归属：看板准备状态由 BoardTaskService 写入；执行状态仍属既有 Mission/Execution。二者尚未连接，不能从草稿数据推导执行成功。`projectId` 是当前本地项目分组范围，不是多用户权限或仓库写入授权。

<a id="board-task-preparation--已实现的前后端合同"></a>
#### 已实现的前后端合同

- 创建记录包含标题、目标 `goal`、文本验收条件 `acceptanceCriteria`、项目、可选会话及 `requestId`。目标、条件、补充说明分别最多 4000 字符。创建和保存不启动任何进程。
- `planned` 允许信息不完整；进入或保持 `ready` 必须具有非空目标及验收条件。已有不完整 ready 记录可返回 planned 或补齐；服务端返回 `preparationIssues`、`allowedColumns`，页面显示原因并禁用不可用动作。
- 更新必须包含 `projectId` 和读取时的 `revision`。服务端在事务中按项目读取并锁定任务，先检查版本再写入。同版本并发更新只有一次成功；真正无变化的提交不增加版本或事件。跨项目更新返回 404。
- 创建使用 `(project_id, request_id)` 唯一约束与原始请求摘要。相同请求重试返回同一个任务的当前状态；同一身份附带不同内容返回 409。摘要不随任务后续编辑改变。此去重仅涉及创建，不代表执行领取已经实现。
- 页面不乐观伪造列移动。拒绝后保留服务端状态；保存冲突刷新服务端内容，同时保留草稿及其原始版本。对照最新内容后，用户可采用服务端版本，或明确保留草稿按新版本继续编辑再保存。再次发生冲突仍会拒绝。
- 未提交编辑和未确认创建请求按真实/mock来源及任务/项目保存在 sessionStorage。创建结果未知时冻结原请求并提供重试；刷新/离开再返回也使用同一请求身份。创建前无法写入恢复记录时显示错误且不发送请求。清除浏览器存储会失去本机恢复信息；服务器记录仍保留。
- 搜索覆盖目标和验收条件；“准备任务草稿”带入标题、目标和条件，不自动发送、不授予仓库权限。备注标签改为“补充说明”，与验收条件分开。
- Mock 合同独立在 `mock/boardBackend.ts`；只模拟内存状态，不表示数据库持久化。真实与模拟使用同一页面及 runtime-client 类型。

本轮 UI 落点检查：已搜索公共原语；判定为 L4 看板领域表单；实现在现有 shell feature；无需新增共享类别/包或暂存登记；边界检查通过。未新增原始基础控件或私有弹窗壳。

<a id="board-task-preparation--迁移与真实验证"></a>
#### 迁移与真实验证

新增 V4（目标、条件、请求身份及唯一约束）和 V5（看板表与各列的数据库注释）。未修改已应用的 V1～V3；V4 被用户应用后也未改写。首次检查发现运行库仍保留旧 V5～V18 历史，未进行 reset、repair 或伪造 baseline。用户完成迁移后，重新验证当前 V1～V5 全部 SUCCESS，Flyway validate 通过，看板 HTTP 恢复 200。V5 已由开发服务自动应用。

`BoardTaskPersistenceTest` 门控 `EAP_RUN_BOARD_PERSISTENCE=true`：连接已经迁移的本地 PostgreSQL，只创建随机 `board-test-*` 项目下的自身样例并定向清理，不创建、删除、重置数据库/schema。实测重读、创建重试、不同内容拒绝、跨项目拒绝、同时创建去重、同时更新仅一次成功及事件顺序。

全量回归另发现既有 MissionGitAcceptanceTest 依赖旧数据库两条固定 ID。已改为自建/清理的隔离哨兵样例，新增显式 `EAP_RUN_MISSION_GIT_ACCEPTANCE=true` 门控，并实际启用验证，未以跳过掩盖错误。

验证结果：

- 前端 `rtk proxy pnpm --dir frontend typecheck`、`test run`、`check:boundaries`、`build` 通过；70 个文件、246 个测试通过。构建仍提示既有主包/GrapesJS 分块超过 500 KB。
- 后端在同时启用上述两个本地数据库门控后运行 `rtk proxy mvn -f backend/pom.xml test`：292 项，287 通过、0 失败/错误、5 条件跳过。看板真实数据库 3 项和 Git 执行验收 3 项均实际运行。其余真实供应商/CLI建删库等既有门控未启用，不计为通过。
- 浏览器通过运行中的 5173 前端与 8080 后端：填写目标及条件→保存→待处理→刷新重开；另一请求更新后冲突与草稿刷新恢复；切项目不串数据；服务器创建成功但浏览器丢失响应后刷新重试仍只有一条记录；变更请求身份内容、越过执行直接完成均返回 409；390px 详情边界正常；无 pageerror。浏览器测试使用独立 context 和随机项目，样例已定向清理。
- `git diff --check` 通过。没有修改用户的 application.yml；没有调用付费模型、重启用户前后端进程或提交/推送。

<a id="board-task-preparation--后续切片"></a>
#### 后续切片

RK-2 的任务准备闭环已实测；RK-3 仅草稿移动、创建去重和版本并发已验证。执行领取、Run 创建幂等、后台执行与恢复仍未接通，不能将 RK-3 全部标完成。下一步按 RK-4～6 关联既有受控执行器、Run 与原型版本，贯通 Diff、独立验证和人工验收，之后再开放相应运行/验收列。当前 running/acceptance/done 持续禁止手工推进；无人值守提示保持未接通。

后续更新：同日已完成一次受控只读检查的领取、Run 关联、后台执行与结果重读，见 [后续切片](#board-controlled-run)。本文件上面的未完成项描述该次任务准备交付时的范围。
<!-- record:end docs/decisions/board-task-preparation-2026-10-31.md -->

---

<a id="board-controlled-run"></a>

## 看板受控仓库检查与 Run 关联

来源：`docs/decisions/board-controlled-run-2026-10-31.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/board-controlled-run-2026-10-31.md -->
<a id="board-controlled-run--看板受控仓库检查与-run-关联"></a>
### 看板受控仓库检查与 Run 关联

后续进展：保存版本→任务→Run 的关联、预览与不可变引用已在 [原型关联切片](#board-prototype-link) 实现。以下保留本切片交付时的范围与证据；源码 Diff、独立验证和人工验收仍未完成。

2026-10-31，接续 [任务准备切片](#board-task-preparation)，对应 v1.6 §0B.11 RK-3～4 及 RK-6 的有限范围。用户授权按文档推进前后端，并于本轮授权使用内置 browser 验证。

<a id="board-controlled-run--实现范围"></a>
#### 实现范围

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

<a id="board-controlled-run--状态幂等与授权"></a>
#### 状态、幂等与授权

- 启动须带 projectId、读取的 revision、UUID requestId 及用户已确认的服务端 workspacePath。路径仅用于核对，绝不替代 RuntimeWorkspace 授权；实际 cwd 由服务端决定，不采用浏览器分组中的路径偏好。
- 锁定任务后检查版本与 ready 条件，再按新事务快照检查活跃执行。等待行锁的并发请求不会因旧快照而漏看前一次已提交的 Run。不同请求不能同时领取同一任务；执行中任务字段不能修改。
- `(task_id,request_id)` 唯一；重复请求在版本检查前返回原 Run，包括原 Run 已结束或任务随后被编辑的情况。同一请求身份携带不同原版本/目录则 409，不会重复执行。
- 单个任务快照对应一次内部 Handoff/Mission；关联及执行预留在同一事务中完成，拒绝授权或目录变化会整体回滚。沿用旧 Mission 启动/取消端点操作 board 来源被拒绝，防止绕过看板领取合同。
- 后台派发最多 2 个 worker、16 个排队请求；队列满写入明确 FAILED/BOARD_QUEUE_FULL。数据库状态必须提交后才能派发。页面卸载不停止服务端 worker。
- worker 原子领取 CREATED 且 unconfirmed_reason 为空的记录；重复调用 worker 不重新执行。启动前再次核对授权、目录及可执行文件。服务重启将遗留 open Run 标为结果未知，未知记录不能领取且阻止新请求；不会擅自接管或终止旧进程。
- 看板暂不提供取消操作，并在 UI 中说明。既有执行器的超时/结果分类保留，取消请求不等同于已结束。本轮未扩展跨进程恢复、自动调度或无人值守。
- 前端将未确认启动请求存入按任务及真实/mock来源隔离的 sessionStorage。断线后先查询原请求的 Run；可重试同一请求，刷新/重开也不换身份。恢复记录无法保存时不发送。
- GET 返回最近 30 个 Run；页面最多每 2 秒查询一次、自动查询 60 次，然后显示手动刷新提示；结果未知停止自动轮询。旧页面/旧任务响应被丢弃，读取失败保留已知输出。

<a id="board-controlled-run--验证证据"></a>
#### 验证证据

数据库 V1～V6 全部应用，Flyway validate 成功；未修改已应用的 V1～V5。用户的 application.yml 保持原变更，未修改工作区授权配置。

- `rtk proxy pnpm --dir frontend test run`：71 个文件、252 项通过；typecheck、build、check:boundaries 通过。构建仍存在原主包/GrapesJS 大于 500 KB 的分块提示。
- 同时启用 `EAP_RUN_BOARD_PERSISTENCE=true`、`EAP_RUN_MISSION_GIT_ACCEPTANCE=true` 后运行 `rtk proxy mvn -f backend/pom.xml test`：298 项，293 通过、0 失败/错误、5 条件跳过。未启用真实供应商、Codex 配置读取、建删库 CLI/原型测试；schema probe 单独由 Flyway 当前库验证补充，不将跳过计为通过。
- 新增 BoardRunPersistenceTest：在现有已迁移 PostgreSQL 的随机自有任务和 `@TempDir` 隔离 Git 仓库验证真实输出与 cwd、结束后重复请求去重、任务快照保持、跨项目拒绝、不同/相同请求并发、运行期拒绝修改、授权回滚、目录变化回滚、旧端点拒绝、worker 重复调用、重启未知阻塞、队列拒绝及真实 Git 失败。6 项实际运行，不创建或删除数据库/schema，清理仅针对自身样例。
- 新增 BoardRunPanel.test.ts：确认后才启动、请求丢失与重开恢复、按请求身份核对已保存 Run、未知阻塞、轮询次数上限及读失败保留、项目切换忽略旧响应，共 6 项通过。
- 浏览器经运行中的 5173 + 8080 完成：确认实际工作目录→真实 git status→输出/退出码；故意丢失 POST 响应后 GET 找回原 Run；终态重试保持一个 Run；跨项目 404、旧 Mission 入口 409；刷新后 Run 仍可见；任务保持 ready；390px 详情可滚动且不越界；pageerror 为 0。浏览器使用独立 context 和随机项目，样例已定向清理。
- 用户重启 5173 后在该端口完成验收；临时 5174 服务已停止。内置 browser 已发出打开看板请求，但 computer-use 的本机 native pipe 不可连接，故未声明内置浏览器验收完成；以上行为证据来自独立 Playwright Chromium。
- `git diff --check` 通过。未提交/推送，未调用付费模型，未重启用户后端服务。

<a id="board-controlled-run--后续边界"></a>
#### 后续边界

RK-3 的本切片启动领取与幂等、RK-4 的一次确定性只读检查已验证；RK-6 的页面重读、失败/未知呈现及取消能力标注已覆盖。它们不表示通用开发任务执行已完成。下一步仍是 RK-5：原型设计版本→任务→Run→Diff→独立验证→人工验收的证据关联，以及相应受控源码执行。没有证据不能将任务推进 acceptance/done。Transfer/TreeSelect/虚拟树等原 UI 候选状态不因本轮业务开发改变。
<!-- record:end docs/decisions/board-controlled-run-2026-10-31.md -->

---

<a id="board-prototype-link"></a>

## 原型版本、看板任务与 Run 快照关联

来源：`docs/decisions/board-prototype-link-2026-10-31.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/board-prototype-link-2026-10-31.md -->
<a id="board-prototype-link--原型版本看板任务与-run-快照关联"></a>
### 原型版本、看板任务与 Run 快照关联

后续进展：已在 [Run 仓库审阅切片](#board-run-review) 接入采集当时的基线、Diff 和空白检查快照；其归因与完整验收限制见该记录。以下保留本切片交付时事实。

2026-10-31，接续 [受控执行切片](#board-controlled-run)，实现 v1.6 §0B.11 RK-5 中“保存的设计版本 → 任务 → Run”这一段。Diff、独立验证与人工验收仍待后续实施，不能将关联成功或只读 Git 检查成功解释为开发任务完成。

<a id="board-prototype-link--实现范围与复用"></a>
#### 实现范围与复用

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

<a id="board-prototype-link--一致性与边界"></a>
#### 一致性与边界

- 服务端拒绝额外正文/哈希等字段；关联 ID 必须确实存在。关联不复制客户端正文，不更改任务目标/验收条件，不授予仓库权限，不确认设计验收，也不启动执行。
- 同一任务的关联修改与 Run 启动使用既有任务行锁和 revision。运行中或结果未知时禁止变更；过期 revision 返回 409，不覆盖其他修改。同一版本重复选择不增加 revision。
- 返回响应丢失或冲突时前端重读任务，保留待核对选择，要求明确采用当前关联后再修改；不盲目重发。任务刷新造成 revision 改变也要求核对，未保存选择不能成为隐式执行输入。保存关联期间新输入的目标/备注等草稿也保留，沿用现有冲突核对，不被关联响应覆盖。
- 重新提交原 requestId 仍返回原 Run，包括任务已换版的情况。旧 Run 保存的原型摘要不能被最新任务关联覆盖。
- 版本列表复用现有 builder-alpha/builder-beta 服务端版本来源；若已关联版本不在最近列表，会按 ID 补读。当前仍是本地共享版本库，任务的 projectId 校验不等于版本库的多租户隔离。版本检索/分页和项目归属另行规划。
- 保存的 `eap-prototype-v1` 正文经既有 Schema 校验后使用 Vue 组件预览；不注入保存的 HTML。历史/不支持正文只以转义文本展示。查看历史 Run 时比较保存的哈希与快照；这是记录一致性检查，不是完整源码/产物验收。
- 本轮 Run 仍只有显式确认目录后的只读 git status；未增加源码生成、Diff 审阅、构建执行或人工验收端点，任务不能据此进入 acceptance/done。

<a id="board-prototype-link--验证证据"></a>
#### 验证证据

在用户运行的 5173/8080 服务和现有开发 PostgreSQL 验证。Flyway 当前版本为 7，7 个迁移 validate 通过；没有 clean/repair/baseline、创建或删除数据库。用户的 application.yml 原变更保持不动。

- `rtk proxy pnpm --dir frontend test run`：72 文件、261 项通过。新增 7 项关联/预览行为测试、1 项草稿并发回归及 1 项 mock 合同测试，覆盖只传 ID、解除、并发冲突显式核对、活跃执行禁用、旧版本补读、语义预览、哈希不符与 HTML 转义。草稿并发回归先复现保存关联响应覆盖新输入目标，再验证修复后的保留与显式核对。
- `rtk proxy pnpm --dir frontend typecheck`、`rtk proxy pnpm --dir frontend build`、`rtk proxy pnpm --dir frontend check:boundaries` 全部通过。构建仍提示主包约 1.03 MB、GrapesJS 约 1.07 MB 超过 500 KB，未把该提示计为构建失败或性能验收通过。
- 同时设置 `EAP_RUN_BOARD_PERSISTENCE=true` 与 `EAP_RUN_MISSION_GIT_ACCEPTANCE=true` 后运行 `rtk proxy mvn -f backend/pom.xml test`：303 项，298 通过、0 失败/错误、5 条件跳过。真实供应商、Codex 配置读取、建删库 CLI/原型测试未启用；schema probe 由上述当前库 Flyway validate 补充，不将跳过计为通过。
- 定向 `BoardRunPersistenceTest,BoardTaskPersistenceTest,BoardPrototypeControllerTest,BoardTaskServiceTest,SchemaAndWiringTest`：27 项通过、无跳过。BoardRunPersistenceTest 共 9 项，新增覆盖换版/解除后历史引用不变、原请求重试保持旧引用、并发关联只有一个成功、缺失版本和跨项目拒绝、旧 Run JSON 无原型字段仍可读取；controller 拒绝伪造元数据及不完整/错误类型请求。
- 独立 Playwright Chromium 访问正在运行的 5173/8080：选择未保存时禁止启动 → 嵌套弹窗中交互预览 A → 保存关联 → 真正执行 git status 并记录 A → 换版 B → 历史 Run 仍预览 A → 刷新持久保持 → 390px 窄屏查看 B → 解除关联后历史仍保留 A。页面异常为 0，桌面与窄屏截图已目视复核。使用独立浏览器上下文，不声称本轮完成内置浏览器验证。
- 浏览器样例使用随机自有项目及确切版本清单；完成后定向清理 2 个样例任务、1 个 Run 及其内部 Mission/Handoff、4 个版本。持久化测试也仅清理自身样例，没有清空已有用户数据。
- `git diff --check` 通过。本轮未提交/推送，没有调用付费模型，没有重启用户前后端。

<a id="board-prototype-link--下一步"></a>
#### 下一步

RK-5 仍需将已授权源码变更的 Diff、执行验证结果和人工验收决定关联到具体 Run；复用既有原型交付门禁与证据模型，先确定最小真实交付合同，再实现状态推进。不能以新增关联字段替代上述证据。未定交互契约的 Transfer、TreeSelect、虚拟树等候选继续保留待实现。
<!-- record:end docs/decisions/board-prototype-link-2026-10-31.md -->

---

<a id="board-run-review"></a>

## Run 仓库审阅快照与空白检查

来源：`docs/decisions/board-run-review-2026-10-31.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/board-run-review-2026-10-31.md -->
<a id="board-run-review--run-仓库审阅快照与空白检查"></a>
### Run 仓库审阅快照与空白检查

2026-10-31，接续 [原型关联切片](#board-prototype-link)。RK-5 新增可持久回放的仓库观察：具体 Run → 采集时基线 → 已跟踪文件 Diff → 实际 `git diff --check` 结果。Run 的原型/任务快照继续保留。本轮不包含源码生成、构建/类型/测试执行或人工验收，不能据此宣称完整 RK-5 已完成。

<a id="board-run-review--用户行为与实现"></a>
#### 用户行为与实现

在任务详情的 Run 上选择“查看 Diff 与检查”，可重读已有记录，或显式确认实际目录后采集一份快照。快照展示采集起止时间、基线及结束时 HEAD、差异、Git 状态、空白检查、实际命令/退出状态和记录哈希。已有快照不可覆盖；响应丢失后先重读，重复 POST 返回原快照。采集失败也保留步骤与失败原因，重新观察新的仓库状态需新 Run。

这是采集当时的工作区观察，不是该 Run 实施变更的证明。基线取自采集开始时的 HEAD，并非补造运行开始时的基线。已有只读 git-status Run 本来不产生源码；页面明确说明时间和归因边界，不会推进任务到 acceptance/done。

| 落点 | 职责与复用 |
|---|---|
| `V8__board_run_review.sql` | 在既有 board_task_run 增加可空 review_snapshot JSON；旧 Run 没有记录时返回空，不自动补采集 |
| BoardReviewService / BoardReviewController | GET/POST `/api/board/tasks/{taskId}/runs/{executionId}/review`；复用任务项目范围、行锁、事务及 Mission 执行身份 |
| GitReviewCapture / GitCapability | 固定只读 Git 步骤、输出限额、脱敏、变化检测与记录哈希；复用 DefaultProcessExecutor 的超时、进程树清理和退出证据 |
| runtime-client | BoardReviewPage/BoardReviewEvidence 与读取/采集调用，POST 90 秒客户端超时 |
| `features/shell/BoardRunReview.vue` | 领域审阅面板，用公共 Dialog/ConfirmBox/Button/Badge/Collapse 组装，Diff 为转义文本；由 BoardRunPanel 打开 |
| mock/boardBackend | 无真实 Run 时明确 404，不制作假的 Diff 或成功检查 |

保留既有 CodeChangeService/CodeVerificationService 与原型交付单。它们的会话候选、可选验证和交付记录并不是可直接冒充 Run 产物的持久证据，因此本轮不复制其执行器，也不把会话成功状态写入看板。未增加调度器、依赖、基础组件或包。

<a id="board-run-review--合同与限制"></a>
#### 合同与限制

- POST 只接受 `projectId`、`workspacePath`，拒绝客户端 Diff、检查结果、命令、哈希等字段；执行 ID 必须属于该项目下的任务。路径用于核对既有 Run，不提供新授权。
- 新采集要求 Run 已成功结束且无未知原因、任务无活跃执行、当前服务端目录与 Git 程序仍匹配原 Run。分别检查 git-status/git-diff 的既有能力注册、处理器与开关以及 RuntimeWorkspace 授权；读取已保存记录仍按任务项目范围校验。
- 与任务编辑/Run 启动共用任务行锁。采集和保存处于同一事务，两个并发请求只形成一份记录；重复读取/POST 不重新扫描仓库。重启不会接管正在采集的请求，未提交记录不能被当作成功；客户端可重读并显式重试。
- 固定执行仓库根、过滤器配置键、HEAD、状态、Diff、空白检查及前后复读。必须确认实际仓库根等于授权工作目录，拒绝通过子目录向父仓库扩散读取。
- 参数数组不经过 shell；禁止外部 diff、textconv、fsmonitor 和内容 clean/process 过滤器；禁用 Git optional locks。保留正常系统/用户换行配置，避免 Windows `core.autocrlf` 失效造成整文件假变更。只读配置键最多 100 个，无法安全解析或输出截断时停止。存在过滤器配置即提示停用及需另行核对，含全局 LFS 配置时也采取这个保守标注。
- 全局最多同时采集 2 份。复用每命令默认 20 秒超时；30 秒后不再派发下一步，已启动命令仍受自己的超时/清理约束；不是严格 30 秒整次 SLA。事务上限 90 秒。未添加无人值守/跨重启恢复或后台调度。
- ProcessExecutor 每输出流限 1 MiB；持久 Diff 限 131072 字符、状态 32768、检查输出 8192、每步错误 4096。截断、脱敏、未跟踪文件、二进制或过滤器停用均明确列出缺口，不呈现为完整产物。哈希针对保存的脱敏记录，不是未脱敏补丁或仓库完整内容哈希。
- Diff 是基线 HEAD 到当前工作区的合成差异，不单独保存暂存区的另一份内容；未跟踪文件内容、子模块与二进制正文不展开。没有 Diff 文本不表示所有代码都无变化。
- 前后复读 HEAD、Git 状态及 Diff，可以发现状态仍为 M 但内容已变的情况；变化时标记 CHANGED/STALE。它不是仓库原子快照，不能取代后续按确定源码版本运行构建/测试。失败/超时/未知退出与输出截断不被判为检查通过。
- `git diff --check` 仅检查空白错误；即使 PASSED，也不等于类型、构建、业务测试或人工验收通过。界面明确展示后续缺口，不新增“完成任务”捷径。

UI 落点检查：已搜索公共原语 → 判定 L4 领域面板 → 落入现有 `features/shell` → 无新增共享类别/暂存登记 → boundaries、类型和行为验证通过。没有原生控件或私有 Dialog；样式沿用主题 Token。

<a id="board-run-review--验证证据"></a>
#### 验证证据

- V8 已由现有开发服务应用；当前 Flyway 版本 8、8 个迁移 validate 通过。未改 V1～V7，未 clean/repair/baseline，也未重建数据库；application.yml 原有修改未动。
- `rtk proxy pnpm --dir frontend test run`：73 文件、266 项通过；`rtk proxy pnpm --dir frontend typecheck`、`rtk proxy pnpm --dir frontend build`、`rtk proxy pnpm --dir frontend check:boundaries` 通过。构建主包约 1.03 MB、GrapesJS 约 1.07 MB，现有大于 500 KB 提示仍保留。
- 同时启用 `EAP_RUN_BOARD_PERSISTENCE=true` 和 `EAP_RUN_MISSION_GIT_ACCEPTANCE=true`，执行 `rtk proxy mvn -f backend/pom.xml test`：314 项，309 通过、0 失败/错误、5 条件跳过。未启用真实付费模型、Codex 本机配置读取及建删库 CLI/原型门控；数据库 schema probe 由当前库 Flyway validate 补充，不将跳过计为通过。
- GitReviewCaptureTest 5 项真实隔离 Git 测试：暂存/未暂存合成 Diff、真正空白错误、内容变化但状态不变、二进制/脱敏/截断、父仓库拒绝、未知退出、CRLF 归一化，以及配置的 clean filter 不产生文件副作用。未知/截断路径采用受控 executor 结果注入，其余使用实际 Git。
- BoardRunPersistenceTest 由 9 项增至 13 项，实际 PostgreSQL + 隔离 Git 全部运行：持久重开、仓库/任务/原型后续改变不影响快照、相同 Run 并发只存一份、跨项目/跨任务拒绝、活跃执行/目录变化/能力停用拒绝、缺 HEAD 留失败记录。
- BoardReviewControllerTest 2 项验证严格字段与身份传递；BoardRunReview.test.ts 5 项覆盖确认后采集、只传身份、转义文本、响应丢失恢复、变化/截断提示、禁用态及切 Run 后忽略迟到响应。
- 独立 Playwright Chromium 访问用户运行的 5173/8080：真实 git-status Run → 确认采集 → 实际 Diff 与空白检查 → 故意丢失 POST 响应后 GET 找回 → 同请求重复返回相同记录 → 跨项目 404/伪造 Diff 400 → 刷新回放相同哈希 → 390px 无弹窗越界；任务仍 ready、pageerror 为 0。桌面与窄屏截图已目视复核，不声称完成内置浏览器验证。
- 截图复核曾发现隔离 Git 系统配置导致 CRLF 假变更，修复后实际工作区检查为 PASSED，Diff 回到局部修改；最终快照正确标注 FILTERS_DISABLED、CONTENT_REDACTED、UNTRACKED_NOT_INCLUDED，未触发截断。缺口仍意味着需要后续补证。
- 两次浏览器样例的 2 个随机项目任务、2 个 Run/审阅记录及各自内部 Mission/Handoff 已按确切清单定向清理；测试也只清理自有样例。验收采集未操作用户任务或写入目标仓库源码。
- `git diff --check` 通过。本轮不提交/推送，不调用付费模型，不重启用户服务。

<a id="board-run-review--下一阶段"></a>
#### 下一阶段

先把按明确源码范围和版本执行的构建、类型检查、相关测试作为独立证据关联 Run，再接人工审阅/验收决定及任务状态推进。当前保留的都是只读观察，尚不具备原型驱动源码交付的完整验收链路。Transfer、TreeSelect、虚拟树等未定 UI 候选不受本轮影响。
<!-- record:end docs/decisions/board-run-review-2026-10-31.md -->

---

<a id="board-run-verification"></a>

## Run 独立验证：实施合同与进度

来源：`docs/decisions/board-run-verification-2026-10-31.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/board-run-verification-2026-10-31.md -->
<a id="board-run-verification--run-独立验证实施合同与进度"></a>
### Run 独立验证：实施合同与进度

状态：本阶段实现、自动回归、真实前端工程验证、V10 数据库互锁及最终独立复核通过（2026-11-01）。承接 `board-run-review-2026-10-31.md` 下一阶段及 v1.6 §0B.7/§0B.11；不是完整规划或人工验收已完成。

<a id="board-run-verification--最小切片"></a>
#### 最小切片

保留 Task/Mission/Run 事实源、现有执行器与固定五入口。在 Run 的独立验证面中，用户先准备验证计划，查看本地目录、源码范围与哈希、固定命令、执行副作用，再显式确认启动。页面轮询/刷新只读取持久记录，不重跑命令。此切片仅支持服务绑定仓库的 `frontend` Vite+ 工程；不扩展通用 shell、后台调度、模型或代码生成。

复用 `DefaultProcessExecutor`（不是另写 ProcessBuilder），以有界时长执行固定 `vp exec vue-tsc --build`、`vp test run`、`vp build`。Vite+ 来自既有 CLI 通道 `vp` 的本机解析，Windows 必须为可直接执行的 exe/com，不拼 cmd/shell。执行源码、依赖和构建配置具有代码执行能力，可能生成缓存/构建产物及访问网络；目录绑定不是沙箱，确认框必须说明。不得静默安装缺失工具或依赖。

源码证据绑定 `frontend` 下有界常规工程文件（含未跟踪文件），保存相对路径/字节数/SHA-256，不保存正文；跳过依赖、输出、缓存、隐藏和凭据文件并明确列出排除规则。符号链接/越界、文件数或字节上限、读取失败须阻塞，不能截断为完整快照。执行前重新核对计划，执行后重新取哈希；前后变化为 STALE，不称通过。HEAD、路径、命令、范围哈希共同参与计划哈希。依赖目录、外部输入及执行中修改后又恢复无法由此快照证明，须明确边界。

<a id="board-run-verification--api-合同已实现"></a>
#### API 合同（已实现）

统一前缀 `/api/board/tasks/{taskId}/runs/{executionId}/verification`。

- `GET ?projectId=`：`Page { record: Record|null, prepareAllowed: boolean, reason: string }`；读取不会扫描源码或启动验证。
- `POST /plan`：仅 `{projectId, workspacePath}`，返回 `Plan`，在明确操作时读取本机源码；不能接受客户端命令、结果或哈希。
- `POST`：仅 `{projectId, workspacePath, planHash}`，返回 `Record`；重复请求返回此 Run 的原记录，工作目录必须一致，已有记录的不同 planHash 拒绝。每 Run 一次验证，失败后另一次 Run 才能再验证，不悄悄覆盖旧证据。
- `Plan { planHash, workspacePath, baseCommit, source: Source, commands: Command[] }`
- `Source { scope, contentHash, files: {path, contentHash, bytes}[], exclusions: string[] }`
- `Command { id, command: string[], workingDirectory, timeoutSeconds }`
- `Record { id, status, reason, plan: Plan|null, workspacePath?: string|null, checks: Check[], sourceAfter: Source|null, startedAt, finishedAt: string|null }`；仅预检查清理未知时允许无计划，工作目录独立保存；旧记录目录仍可从 plan 读取。
- `Check { id, command: string[], workingDirectory, status, exitCode: number|null, stdout, stderr, truncated, processTreeCleanup, startedAt, finishedAt: string|null }`；RUNNING 检查的 finishedAt 为 null。
- `status`：QUEUED/RUNNING/PASSED/FAILED/STALE/UNKNOWN；检查项另允许 TIMED_OUT。UNKNOWN 不意味着进程结束，应阻塞后续任务编辑与启动。

使用既有 `board_task_run` 增量 JSON 列，事务保存启动记录再派发。串行领取用条件更新，任务行锁与现有 Run 启动/任务编辑/原型修改/审阅采集共用；同时应阻止多个任务在同一本机目录重叠验证。进程执行不持有长数据库事务，逐条保存检查结果。重启遗留 QUEUED/RUNNING 标为 UNKNOWN，不自动接管或再次执行。未确认进程树清理不得释放阻塞。完成与失败均不改任务列，验证不归因为原 git-status Run 产生源码。

预检查异常补丁：plan/start 在独立事务内持有既有任务/目录锁；遇到 `BOARD_VERIFICATION_PROCESS_UNKNOWN` 保存无计划、无哈希的 UNKNOWN，提交后才向请求抛错，外层请求回滚不能抹除身份。V10 增量迁移扩展约束与目录唯一索引，兼容 V9 的已有计划记录，不改写 V9。前端准备失败会重读持久记录。已通过事务模拟、真实 PlanSupport + Fake 进程、SQL 合同检查及 Vue 回放；父任务另补真实 PostgreSQL 两入口用例：外层事务回滚后 UNKNOWN 仍存在，无伪造计划，任务编辑/同目录其他任务验证被阻止，唯一索引拒绝第二条活跃记录。V10 约束与索引已在真实库可用，未手动修改或修复 Flyway；未故意制造实际遗留进程，未知进程来自故障注入。

<a id="board-run-verification--前端落点"></a>
#### 前端落点

L4 `features/shell/BoardRunVerification.vue`，由既有 Run 面板显式打开。复用公共 Dialog/ConfirmBox/Button/Badge/Collapse，不将三类检查输出常驻堆在任务准备页。调用只经 runtime-client；mock 无真实 Run 时返回明确 404/不可用，不伪造通过。处理中可关闭页面并重读；响应丢失先查询，迟到响应不能串 Run。中英文文案同步。

<a id="board-run-verification--验证与未完成项"></a>
#### 验证与未完成项

覆盖计划过期、源码变化、并发去重、跨项目/Run 拒绝、超时/未知/重启、输出脱敏与限额、刷新回放。保留用户 application.yml，不读取凭据、不调用付费模型、不启停用户 Java 服务。按用户最新授权，每个阶段验证及独立审查通过后自动提交推送；application.yml 持续排除。

仍后置：通用后端 Maven/其他仓库验证配置、源码实现 Run、完整原型多文件交付、人工验收决定与完成状态、Skill/MCP 真实接入、桌面产品化。它们不因本切片通过而消失。

<a id="board-run-verification--2026-11-01-接续核验"></a>
#### 2026-11-01 接续核验

- 接续基线为 `032af1d` 加现有未提交验证切片。先复现后端凭据文件漏排除、前端旧成功文案与真实错误码不一致；修复后重验。数据库测试手动构造 ReviewService 未经过 Spring 事务代理，已用真实 TransactionTemplate 保持锁合同，未削弱生产锁。
- 独立审查发现 `tokens.css` 被凭据关键词误排除，以及入队后能力停用被记为永久 UNKNOWN。新增 RED→GREEN：设计 tokens 纳入源码哈希；明确拒绝且没有未确认进程时保存 FAILED/具体原因，真正清理未知仍 UNKNOWN。标准源码清单不包含任意隐含/外部输入，排除项公开。
- 真实 Windows 验证首次失败：受限环境未含 PATHEXT，`vp exec vue-tsc` 无法解析本机已安装的 `.cmd` shim。最小探针确认只加 PATHEXT 即可成功；现固定 `.COM;.EXE;.BAT;.CMD`，不继承自定义后缀、不恢复 NODE_OPTIONS 或供应商凭据。EAP 仍以参数数组直接启动原生 vp.exe，不拼 shell；vp 内部执行可信项目代码的风险照常需确认。
- 最终前端：`rtk proxy pnpm --dir frontend test run` 75 文件/295 项通过；`typecheck`、`check:boundaries`、`build` 通过。大包与 Node localStorage 实验警告仍保留。
- 最终后端：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 71 类/406 项，400 通过、6 跳过、0 失败/错误。真实数据库 Run 测试 19 项，包含事务、并发、互锁与回放；验证命令在持久化测试中用 Fake，不冒充真实构建。5 项既有外部/建删库条件跳过，另 1 项符号链接夹具因 Windows 权限跳过。
- 真实运行：用户的 5173→8080 服务，V9 列/索引在真实持久化测试中可用；没有自行 clean/repair/reset 数据库。内置预览通过实际鼠标操作走完任务→执行审阅→验证计划→确认，第一条失败如实持久化。桌面 DOM bridge 不响应，因此用 computer-use 操作内置预览，独立 Chromium 补 API、刷新与视口量测，两类证据不混称。
- 首次失败记录：Run `1af31e60-5220-408d-b975-d5842e380070` / verification `397ee840-3ff9-4f27-9831-5c3f045ff4e6`，退出 1、清理已确认，保留未覆盖。
- 修复后的新 Run `8596cfe5-fb9c-4166-9cc2-120159d4021c` / verification `046c6243-c6d8-498d-b7aa-20a21ea2bcb9`：在浏览器显式确认后三项真实命令均退出 0、进程树清理 true、未截断；最终 PASSED。源码清单 316 文件，含 `frontend/packages/style/src/tokens.css`，前后哈希相同。页面重新加载后回放同一 ID，不能重复启动。关联任务 `727e6430-d0e4-4860-9eb6-0ece0199d480` 仍 ready、executionActive=false，未标完成。
- 验证计划弹窗在 1440×900、1280×800、1024×640、708×640 下页面/弹层无横向溢出；不把 CSS 尺寸当成系统缩放或用户最终验收。

<a id="board-run-verification--下一关口非已实现"></a>
#### 下一关口（非已实现）

最终独立复核未发现阻塞缺陷：核对预检查 UNKNOWN 独立事务、Task→workspace 锁序、V10 旧计划兼容和无计划索引、前端 nullable DTO/失败回读。复核为只读代码及测试报告审查，未冒充再次执行全套测试。

先形成真实源码交付证据，再实现人工接受/拒绝，不能给 git-status 成功直接加“开发完成”。允许最小切片记录明确标注的人工/外部交付，服务端采集允许范围的 Diff/哈希并关联同一源码快照的独立验证；不能接受客户端伪造结果或倒造生成前快照。普通任务更新继续禁止任意推进 done。平台受控源码实现另做持久基线/候选/写入意图/读回证据与工作目录互锁，不能将现有内存 CodeChangeService 直接包装成可靠多文件交付。
<!-- record:end docs/decisions/board-run-verification-2026-10-31.md -->

---

<a id="board-source-delivery"></a>

## 源码交付证据与人工验收切片

来源：`docs/decisions/board-source-delivery-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/board-source-delivery-2026-11-01.md -->
<a id="board-source-delivery--源码交付证据与人工验收切片"></a>
### 源码交付证据与人工验收切片

状态：本阶段实现、回归、独立审查及真实服务交付/测试决定回放通过。承接 v1.6 §0B.7、§0B.11 及 Run 独立验证；仅 EXTERNAL_MANUAL 交付，不是平台自动源码实现或用户最终产品验收。

<a id="board-source-delivery--实施与审查状态"></a>
#### 实施与审查状态

前后端已实现初版并由父任务重跑：前端 77 文件/316 项通过；后端 426 项，420 通过、6 条件跳过；类型、边界、构建通过。真实浏览器已验证旧源码验证快照提交新修改返回 `BOARD_DELIVERY_SOURCE_STALE`，无交付记录、草稿保留；四视口无页面横向溢出。这不是成功交付/用户接受证据。

独立审查发现的四项缺陷已补 RED→GREEN：① Windows CRLF 检出采用安全的有限 Git EOL 语义判定，原始源码哈希仍保留；② 基线/工作区复用同一路径与扩展排除规则；③ 父级仅同步无本地修改的草稿 revision，脏草稿保留；④ GET 同 requestId 不当作成功，仅原请求 POST 被服务端接受后核对回读，明确内容冲突保留原载荷。类型、边界、构建及全量复跑通过：前端 78 文件/354 项；后端 452 项、446 通过、6 条件跳过。最终复核与真实成功链路仍待收口。

真实成功联调需要一个明确且小于 8 文件的基线：当前实现本身超过范围，不能扩大交付上限或用不完整选择绕过保护。实现代码经独立复核后先形成本地检查点，再在该基线上建立明确标记的临时 HTML 交互样例，用真实 Run/三项验证/源码采集/脚本化测试决定走通链路。仅测试样例允许代理执行 ACCEPT/REJECT，说明必须写明不是用户产品验收。最终联调与文档完成后再推送；application.yml 不进入任何提交，临时样例不进入产品提交。

再次复核发现两个边界未闭合：前端冲突测试采用非真实错误码、Git autocrlf 显式空字符串与无值布尔混淆。前者父任务已将提交/决定及本地日志校验统一为后端真实 `BOARD_DELIVERY_REQUEST_CONFLICT`，先复现 3 项失败，再修复至相关 53 项通过、类型通过；后者正在补真实 Git 回归。此前全量通过不覆盖这两个未测边界，阶段继续保持未交付。

<a id="board-source-delivery--最终结果覆盖上述过程状态"></a>
##### 最终结果（覆盖上述过程状态）

- 两项最后缺陷已修并经独立只读复核通过：真实冲突码持久保护；空 autocrlf 按 Git typed bool 区分，4 项实 Git 回归，未执行任何自定义转换 helper。
- 父任务最终命令：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test`：456 项，450 通过、6 条件跳过、0 失败/错误。真实数据库 Run 27 项，真实 Git 采集 41 项。`rtk proxy pnpm --dir frontend test run`：78 文件/354 项；typecheck、check:boundaries、build、diff --check 均通过。保留大 chunk 和 Node 实验警告。
- 本地实现检查点 `a63d27e` 后，创建唯一未跟踪 `frontend/apps/web/delivery-acceptance-fixture.html`，页面明确“非产品验收”，真实浏览器点击计数到 1。分别从两条测试任务启动只读 Run、确认真实 typecheck/test/build，三项均退出 0、清理已确认、源码前后相同；没有 Fake 验证结果注入生产。
- ACCEPT 样例：Task `c2c423ad-6a85-4907-858d-0e46a0ed3d7e`，Run `2bd6ee1c-de18-471c-bb49-4868a3064735`，verification `64fb1fa7-5294-44b0-b304-a17617249af1`，delivery `48e56a8c-5f0b-4695-a2da-f12d35271cad`，decision `8542f58d-5833-4423-8aa8-5b82616af995`。提交后 revision=2、acceptance，原窗口勾选可用；显式测试决定后 done/revision=3。说明固定写明代理自动化测试，不代表用户最终验收。
- REJECT 样例：Task `e6261f07-3a27-4acf-9d5e-78158e6c0b80`，Run `3a462c95-f962-48cd-bb6d-c636574064ef`，verification `9b08eb45-d4a3-47b8-96c0-7f9ada2741dd`，delivery `b02d7597-0ab0-490a-8380-e8e0f6d8f738`。保存后故意改变临时源码；接受返回 `BOARD_DELIVERY_SOURCE_STALE`，原证据不变；填写理由后拒绝成功，decision `73fb2623-31aa-4716-8511-0f86a8bffbcf`，task ready/revision=3。
- 两条记录重新加载页面均回放原决定ID，无提交按钮，不重跑执行。浏览器为本机独立 Chromium；本阶段不冒充内置预览的完整点击验收。临时 HTML 已定向移除，未提交；其源码与哈希保留在测试交付记录，仅代表当时快照。
- application.yml 未修改/提交；未调用模型、未启停用户服务、未手工重置或修复数据库。V11/V12 已由开发环境应用，并经实库 CRUD/约束测试验证。

<a id="board-source-delivery--范围与归属"></a>
#### 范围与归属

复用 Task/Run、PostgreSQL/Flyway、GitCapability、ProcessExecutor、源码快照及验证记录。先支持 `EXTERNAL_MANUAL` 来源：人工/外部已完成的前端源码修改，由 EAP 采集、独立验证、审阅和接受。不得称 git-status Run 实施了修改；不意味着平台自动代码生成已完成。不新增执行调度器，不改变五入口。

每个 Run 最多一份不可变交付证据和一次接受/拒绝决定。只有完整交付、同源验证 PASSED、任务与原型版本未变化、当前源码未过期且无活跃/未知执行，才能提交验收。接受才到 done，拒绝回 ready；普通任务 update 不开放任意状态转换。预览/勾选是操作者陈述而非自动测试事实；不伪造用户最终接受。

<a id="board-source-delivery--接口约定"></a>
#### 接口约定

前缀 `/api/board/tasks/{taskId}/runs/{executionId}/delivery`。

- GET `?projectId=` → `Page { record: Delivery|null, prepareAllowed:boolean, reason:string }`，不执行进程或重采集。
- POST → 请求 `{ projectId, revision, workspacePath, requestId, paths:string[], note:string }`。服务端采集基线/差异/哈希；不接受可信结果/内容/hash。幂等重试使用原 requestId 与原内容；不同内容冲突。保存证据并进入 acceptance，增加任务 revision。
- POST `/decision` → `{ projectId, revision, requestId, deliveryId, decision:'ACCEPT'|'REJECT', criteriaConfirmed:boolean, previewConfirmed:boolean, comment:string }`。接受须两项人工声明都为 true，拒绝必须有理由；事务保存决定和列变化，重复身份只读原结果。
- `Delivery { id, source:'EXTERNAL_MANUAL', requestId, taskRevision, submittedRevision, workspacePath, baseCommit, verificationId, sourceHash, prototypeVersionId:string|null, goal, acceptanceCriteria, note, files:File[], createdAt, decision:Decision|null }`
- `File { path, beforeHash, afterHash, before:string, after:string }`，前端逐文件对比。不生成装饰性增删行数。
- `Decision { id, requestId, decision:'ACCEPT'|'REJECT', criteriaConfirmed, previewConfirmed, comment, operator:'local-operator', createdAt }`。

DTO 以实际 Java record 为准，同步 runtime-client 与 mock。Mock 无真实执行/验证时返回明确不可用，不构造成功交付。

<a id="board-source-delivery--边界"></a>
#### 边界

- 首版限 1–8 个 frontend 内常规 UTF-8 文本源码（vue/ts/tsx/js/jsx/mjs/cjs/css/html）；路径必须逐字合法、存在于有界源码清单，不允许链接、凭据、包管理配置、删除、重命名、二进制或子模块。大小写别名和路径归一化不能绕过限制。
- 基线固定为验证计划的 Git HEAD；不接受任意客户端 revision。保存原始字节哈希及文本比较；新增文件 beforeHash 为 absent。通过安全 Git argv 读取基线 blob，禁用 helper、限制输出、脱敏导致正文不完整则阻止交付。
- 允许文件须覆盖 frontend 范围内待交付变化；不得把未选择的源码修改静默算进交付。其他范围/排除项不冒充验证覆盖。
- 采集前后重验全 frontend 源码清单与验证记录一致，HEAD 不变；接受前再次核对。旧审阅 snapshot 的 hash 不是源码清单 hash，不能混用。
- Task→workspace 锁序保持一致。所有读取进程的未知清理必须有持久阻塞，不得随 HTTP 回滚丢失；不能为了本片绕开已有预检查保护。
- 源码变化后拒绝仍允许回 ready，接受必须失败。任务处于 acceptance 时禁止普通编辑/原型换版；证据和历史决定保留。
- 不读取用户 application.yml 或凭据，不改变绑定根，不代替用户真实人工验收。不自动推送用户交付源码；本仓库阶段提交推送遵循用户单独授权。

<a id="board-source-delivery--前端工作面"></a>
#### 前端工作面

Run 操作区增加独立“源码交付与验收”对话框，L4 领域组合复用 @eap/ui Dialog/ConfirmBox/Button/Input/Textarea/Checkbox/Collapse/Select。准备、提交确认、逐文件对比、独立验证 ID、范围边界、接受/拒绝分开。不在任务准备面堆叠所有证据。禁用不满足条件的动作；响应丢失先重读，切任务/Run 丢弃迟到响应。

<a id="board-source-delivery--验证关口"></a>
#### 验证关口

先 RED→GREEN：空/越界/假结果/不完整差异、已验证源码变化、任务/原型变化、跨项目/Run、重复请求、并发决定、未知执行阻塞、拒绝回 ready、不能从只读 Run 直接完成。隔离 Git 真实采集 + 真实 PostgreSQL 事务验证；前端状态回放与真实服务浏览器。完整自动原型到源码仍需后续受控写入关口，不能在此宣布全规划完成。
<!-- record:end docs/decisions/board-source-delivery-2026-11-01.md -->

---

<a id="code-generation-baseline"></a>

## 生成前持久基线（PB-02 最小切片）

来源：`docs/decisions/code-generation-baseline-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/code-generation-baseline-2026-11-01.md -->
<a id="code-generation-baseline--生成前持久基线pb-02-最小切片"></a>
### 生成前持久基线（PB-02 最小切片）

状态：本切片实现、最终全量回归和独立复核通过。承接源码交付阶段 a63d27e / ca3b0a2 和完整接续台账。不表示完整 PB-02/03 或真实供应商自动开发已完成。

<a id="code-generation-baseline--问题与边界"></a>
#### 问题与边界

旧 Chat code 路径在模型调用前仅附带最多 4000 字源码节选，模型返回之后才重新读取 before/baseHash。模型依据的源码与允许应用的基线可能不是同一份，生成期间的用户编辑可能被当成新基线。此切片先固定单个明确目标，不扩展多文件执行器、Agent 工具循环或第二任务系统。

<a id="code-generation-baseline--最小合同"></a>
#### 最小合同

- 模型调用之前，服务端持久保存不可变生成快照，绑定 conversation、真实 workspace、逐字合法的 targetPath、完整有界源码及哈希、时间和可选原型版本 ID/hash。不能用浏览器提供的哈希冒充采集结果。
- 模型消费的源码必须来自这份快照。缺目标、读取/持久化失败、内容超限或安全策略拒绝时，不调用模型，不静默截断再生成完整替换文件。
- 候选仅允许这一目标；生成期间当前文件改变即拒绝候选，保留用户修改。新增文件 absent→已存在也算冲突。后续应用仍检查原基线。
- Proposal 增加可选 generation 摘要：id、targetPath、baseHash、capturedAt、prototypeVersionId、prototypeContentHash。旧/模拟候选没有持久快照则明确说明；不得补造 ID 或声称已验证。
- 前端在候选区用既有 Collapse 呈现采集身份，不把生成证据与写入/测试/人工验收混为一谈。源码变化错误不得误导用户切换模型；保留草稿，显式重新生成。
- 普通聊天保持既有行为，模型关闭时确定性能力仍可用。离线测试使用明确的 Fake ChatModel；真实付费模型调用另需授权。

<a id="code-generation-baseline--验证与后续"></a>
#### 验证与后续

必须覆盖：同一源码内容传入模型；生成期间修改拒绝；目标缺失/范围外候选拒绝；持久存储失败关闭；原型哈希关联；旧候选诚实展示；错误码不被当成模型配置故障；真实数据库读取与不可变保存。

本片不解决：候选/应用记录持久化、文件写入意图与故障恢复、所有 Chat 写入口工作目录互锁、Task/Run 实现归因、多文件事务、完整原型自动交付。PB-03 应在本片通过后接续，不以生成快照持久化宣称以上完成。

UI 落点：已复用公共 Collapse/Button/Feedback；GenerationBaseline 为 chat 单域 L4 组件，无新共享包或平行原语。新增中英文文案及 runtime-client DTO。mock 不伪造持久生成证据。

<a id="code-generation-baseline--当前实现与验证"></a>
#### 当前实现与验证

- V13 `code_generation` 与 JdbcCodeGenerationStore：独立事务插入、调用模型前读回核对；无存储时失败关闭，不自动回退内存。时间固定微秒精度，避免 PostgreSQL 回读精度不同误拒绝。离线测试显式提供 InMemoryCodeGenerationStore，生产不注入。
- 完整单文件源码上限 24000 UTF-8 字节，严格 UTF-8、敏感内容/凭据路径/不完整原型引用拒绝；新增文件采用 absent。保留既有读取路径 API，生产 code 发送改用持久快照；模型结果限定一个精确路径。
- Fake ChatModel 在调用期间修改实际临时目标，证明会拒绝候选而不覆盖修改；空白内容完整传入，跨会话/额外文件拒绝。未调用真实供应商。
- 父任务执行 `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test`：465 项、0 失败/错误、6 条件跳过。CodeGenerationPersistenceTest 实际通过：独立数据库连接在模型边界前可读、外层事务回滚后保留、重建 adapter 回读、重复 ID 拒绝。V13 表在用户热更服务的本机库中可用，无 reset/repair/手工迁移。
- 父任务执行 `rtk proxy pnpm --dir frontend test run`：79 文件/361 项通过；typecheck、check:boundaries、build、diff 检查通过（大包警告保留）。新增错误码分类先复现4项失败，修复后不再把生成基线冲突误当模型切换或未配置。
- 浏览器单组件夹具明确标“模拟展示、不调用模型、不写仓库”，真实展开公共 Collapse 查看快照/原型/边界；1440×900与708×640无夹具横溢，随后卸载移除。仅证明展示，不冒充完整 Chat/付费模型生成成功或内置预览验收。
- 尚无公开历史快照浏览入口；generation ID 随候选保留在当前客户端历史。快照保留期、任务/Run关联、模型失败记忆处理仍需后续。

<a id="code-generation-baseline--独立审查修正"></a>
#### 独立审查修正

审查发现方法参数中的 sk- 密钥字面量尚未被源码拒绝规则覆盖、旧模型回答 16384 字符静默截断与完整源码输入不匹配，后端正补回归和修复；不得将上述旧全量数字当成新缺口已通过。普通 code 入口已增加明确单目标相对路径输入，无需原型，附件不自动授权；真实 TaskComposer→chatSession→请求 DTO 测试先失败再通过。新增文件显示“目标不存在”，不把 absent 称为 SHA-256。浏览器真实普通聊天→动作→代码模式→手填目标→关闭菜单保留输入，708px 无页面横溢，未发送、未调用模型，测试后恢复原空目标/chat模式。

最终修复：源码准入与回答脱敏共用 SensitiveData 的 sk- 字面量识别，合成方法参数用例证明保存/模型前拒绝；补边界避免 task-context/mask-image 误判。code 回答保留完整有界 JSON（上限 `6 * 160000 + 16384` 字符，考虑 JSON 转义膨胀），解码后源码仍 ≤160000 字符；超限返回明确 CODE_PROPOSAL_TOO_LARGE 而非半截 JSON。普通聊天和工具摘要维持16384字符上限。前端同时覆盖 HTTP400 与响应体 FAILED 两种超限，保留草稿并说明缩小范围。

上述修复后父任务重跑：后端474项、0失败/错误、6跳过；前端79文件/365项通过，类型、边界、构建与 diff 检查通过。最终独立只读复核通过，无已确认阻塞问题。未付费调用模型；Fake大响应与真实数据库证明的范围分别保留，不合并为真实供应商交付验收。
<!-- record:end docs/decisions/code-generation-baseline-2026-11-01.md -->

---

<a id="code-proposal-application"></a>

## 持久候选与受控单文件应用（PB-03）

来源：`docs/decisions/code-proposal-application-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/code-proposal-application-2026-11-01.md -->
<a id="code-proposal-application--持久候选与受控单文件应用pb-03"></a>
### 持久候选与受控单文件应用（PB-03）

状态：最小持久单文件应用切片实现、全量回归、实库/隔离文件验证与独立审查通过；承接已推送 f6aed04 的生成前持久快照。真实模型到完整任务交付与用户产品验收仍未完成。

<a id="code-proposal-application--当前关口"></a>
#### 当前关口

后端 V14、持久候选/意图/结果和共享 WorkspaceInterlock 已落地，独立静态复核未发现阻塞项。首次实库失败因 V14 未加载；用户 IDEA 启动暴露 JdbcCodeGenerationStore 的 final 阻止 CGLIB repository 代理，父任务同时修复两个 JDBC adapter 并补真实代理构造 RED→GREEN（此前直接new的持久化测试未覆盖此启动差异）。用户再次启动后 8080 返回200，V14结构经真实持久化用例确认可用；没有手工 reset/repair 或绕过迁移。

前端已补 status/afterHash/reason DTO，APPLIED回放展示读回哈希；新增3项不一致状态/结果测试先失败再修复，GET不可核对时不开放写入。未知状态不会反复POST。application.yml未修改。

<a id="code-proposal-application--本阶段验证"></a>
#### 本阶段验证

- 父任务 `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test`：494项，0失败/错误、6条件跳过；CodeProposalPersistenceTest 5项、BoardRunPersistenceTest 29项实际运行，覆盖真实DB并发/意图提交/互锁/结果回放/失败恢复及隔离文件写入；CodeStoreProxyTest通过。跳过项仍为外部模型、建删库等既有条件及Windows符号链接权限。
- 前端 `rtk proxy pnpm --dir frontend test run`：80文件/375项通过；typecheck、check:boundaries、build、diff --check通过，大包警告保留。ProposalApplication 10项含响应丢失后只GET、不重复POST、失败禁写、迟到响应和状态/result一致性。
- 真实5173→8080新GET端点对未知会话返回404 UNKNOWN_CONVERSATION；未人为插入生产候选，未调用付费模型。
- 独立浏览器加载真实组件，用显式“模拟夹具、不调用后端、不写仓库”测试UNKNOWN禁写、确认后POST响应丢失→GET APPLIED、只调用一次模拟POST；1440×900/708×640无夹具横溢，测试后还原API并卸载。第一次夹具错误导入HMR模块仅验证了读失败阻止写入，修正模块URL后通过；这些证据不冒充生产源码写入或内置预览验收。
- 独立只读审查无确证阻塞缺陷；其非阻塞建议（DTO补字段、状态一致性测试）已由父任务补齐并回归。
- 现有文件使用ATOMIC_MOVE，不支持则未知阻塞，不静默降级；新增不覆盖move。最后检查仍不是对外部编辑器的OS CAS，保留外部并发修改风险。会话过期仍404，持久候选不等于持久Chat会话；未知人工核对/解除和Task/Run归因未在本片实现。

<a id="code-proposal-application--范围"></a>
#### 范围

复用现有 CodeChangeService、真实工作区绑定、单目标生成快照和 PostgreSQL。生产候选先持久再返回；明确确认后，写入意图先落盘，再实施单文件操作并读回哈希，最后保存结果。应用不意味着测试通过或任务完成，暂不伪造 Task/Run 源码实现归因。

<a id="code-proposal-application--状态与交互合同"></a>
#### 状态与交互合同

- PROPOSED：可审阅确认；APPLYING：已有持久意图，禁止重复启动；APPLIED：可回放结果，不重写；FAILED：明确失败；UNKNOWN：无法证明结果，保持目录阻塞。
- 读取接口 `/api/ai/conversations/{conversation}/proposals/{proposal}` 按同一身份返回 proposal/status/result/reason，不执行写入或自动恢复。
- 应用继续使用既有 POST apply，只允许服务端保存的单目标与明确确认、非只读策略。相同已应用候选返回原结果；不能由客户端替换内容、基线或路径。
- 写入与看板 Run/独立验证/交付采集共享同一目录互锁；持久活跃/未知意图在请求结束或服务重启后继续阻塞，不只依赖 JVM synchronized。
- 写后数据库失败、未确认文件结果不盲目重跑或回滚用户文件。外部编辑器不受平台锁控制，不能宣称普通文件系统已具备事务CAS。
- 不复用旧自动验证 ProcessBuilder 来冒充独立验证；现有看板检查仍显式确认。

<a id="code-proposal-application--前端"></a>
#### 前端

ProposalApplication 属 chat L4，复用 Button/Checkbox/Badge/Feedback。加载/刷新先只读核对，读取失败不开放写入。显式确认后 POST，成功或响应丢失均重新 GET，只有持久 APPLIED 才向父级投影已写入；APPLYING/UNKNOWN/FAILED不显示第二次写入。切换候选忽略迟到响应。旧/mock候选保留旧展示，不伪造服务端持久证据，mock GET 明确404不可用。

<a id="code-proposal-application--验收要求"></a>
#### 验收要求

先RED→GREEN：跨身份拒绝、只读拒绝、基线冲突、幂等重放、并发领取、与既有Run/验证双向互锁、写后保存失败/重启未知、路径与链接边界；实际数据库仅自有样例行，实际文件仅隔离临时样例。前端测试覆盖回放、不重复POST、失败后重读和迟到响应；随后全量及独立复核，阶段完成后提交推送，持续排除 application.yml。
<!-- record:end docs/decisions/code-proposal-application-2026-11-01.md -->

---

<a id="board-application-evidence"></a>

## Chat 应用证据与看板交付的事后关联

来源：`docs/decisions/board-application-evidence-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/board-application-evidence-2026-11-01.md -->
<a id="board-application-evidence--chat-应用证据与看板交付的事后关联"></a>
### Chat 应用证据与看板交付的事后关联

状态：最小事后关联切片实现、父任务全量回归、实库关联协议、浏览器阻塞交互及独立复核通过。承接 f614272 持久单文件应用；复用现有交付、独立验证与人工决定，不新增实现Run或调度系统。不代表生成前任务归因或真实模型产品闭环验收。

<a id="board-application-evidence--事实边界"></a>
#### 事实边界

此片 `CHAT_APPLIED_POST_HOC` 证明一个 Chat 持久候选已经受控应用，操作者随后将其与当前 Task/Run 的交付关联。不能证明生成时绑定了任务，不能把 git-status Run 写成代码实现者，也不能断言整个 Git diff 都由 Chat 创作。生成前工作树基线和交付 Git 基线分别展示。完整预绑定任务归因是后续关口，不能倒写已有 generation。

<a id="board-application-evidence--合同"></a>
#### 合同

现有交付 POST 增加可选 `applicationRef:{conversationId,proposalId}`。不传保留 EXTERNAL_MANUAL 及旧请求指纹；传入仅单文件，服务端从持久 store 读取身份、generation、APPLIED/result/afterHash/finishedAt，不接受客户端可信状态或哈希。候选无需活跃内存会话可只读关联，但不因此恢复聊天或开放写入。现有 Chat 无projectId，只能证明Task属于项目、Run属于Task及候选principal/conversation/workspace一致，不宣称不存在的原始项目归属。

要求 generation/proposal/应用结果/验证清单/采集后源码目标及哈希一致，原型ID/hash与Run一致，应用完成不晚于独立验证开始。完整源码清单、HEAD、授权路径和目录互锁仍由原流程检查；只比较目标哈希不足以提交。关联摘要与交付和任务流转同事务保存，已存在记录不可补换引用；接受再次核对，拒绝不因源码过期而禁止。

返回 applicationEvidence 固定 POST_HOC，保留conversation/proposal/generation身份、目标、两类原始哈希、采集/关联时间、原型及local-operator。刷新重放不执行进程。前端用户显式勾选、填写UUID，确认框展示身份与事后关联边界；响应丢失保留原请求身份/关联，不新建或静默改引用。mock不能生成已应用证据。

<a id="board-application-evidence--实施与验证"></a>
#### 实施与验证

前端复用已有Dialog/Checkbox/Input/Collapse，领域组件留L4。先复现4项缺失入口/错误引用未拒绝，再实现输入、严格UUID与单文件限制、不可变重试及证据分区；初轮相关58项、类型和边界通过。后端仍在实施，最终DTO、实库迁移、同源/时间/原型负向用例与浏览器及独立审查未完成前不得标交付。

后续实现已完成：V15已由开发环境加载，不改写历史迁移；后台薄证据服务读取APPLIED及起止时间，校验原型、同源哈希和先应用后验证，接受前重核，拒绝保留关联。旧fingerprint兼容由回归覆盖。前端补applicationRef显式null拒绝（与真实控制器一致），APPLIED显示conversation/proposal ID供选用，mock即使有引用仍明确404。

父任务实际命令：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 542项，0失败/错误、6条件跳过；前端全量80文件/382项通过，typecheck、check:boundaries、build通过，新增mock引用拒绝7项定向通过。实库/真实Git夹具包含33项BoardRun持久化、40项应用证据核对；验证命令使用测试double，不冒充生产三项检查或真实模型。

浏览器真实服务本次项目列表为空，未恢复或删除旧数据；新建明确的界面测试任务 `4d95a36d-1afa-47b1-a0bf-23a96942e045` 和一次只读Run `4b7a2e87-62bb-4ba2-b7a5-2f2709804856`。打开关联入口、填写测试UUID/单路径，因缺独立验证提交始终禁用；关闭后GET确认record=null。1440×900和708×640无页面横溢。没有生产应用记录注入或模拟成功提交，未调用模型。成功关联/接受协议由隔离实库夹具证明，完整模型→应用→验证→用户接受的浏览器路径仍需后续专门验收。

最终契约复核：请求 applicationRef 仅可省略或完整对象，显式 null 与服务端一致拒绝；response evidence 仍可空。新增编译graph类型断言、实际Axios序列化和journal拒绝回归；最终前端80文件/383项通过，类型/边界/构建通过。独立复核通过，无已确认阻塞项；后端仍为上述542项（6跳过），未将审查读报告写成再次运行。
<!-- record:end docs/decisions/board-application-evidence-2026-11-01.md -->

---

<a id="code-task-prebinding"></a>

## 生成前 Task 绑定与交付归因最小切片

来源：`docs/decisions/code-task-prebinding-2026-11-01.md`；合并基线 `82aa504`。

<!-- record:start docs/decisions/code-task-prebinding-2026-11-01.md -->
<a id="code-task-prebinding--生成前-task-绑定与交付归因最小切片"></a>
### 生成前 Task 绑定与交付归因最小切片

状态：最小生成前绑定切片实现、父任务回归、实库协议、内置预览交互与独立复核通过。承接 `544b8f9` POST_HOC，不新增调度器或把只读 Git Run 改成代码执行者。真实供应商与用户产品最终验收仍未完成。

<a id="code-task-prebinding--合同"></a>
#### 合同

- `TaskContext.taskRef` 仅 code 接受，字段为 `projectId/taskId/revision`。省略保留普通 Chat；显式 null、非法身份或额外字段拒绝。不接受客户端目标/验收正文作为权威任务快照。
- 生成前在独立事务中依次锁 Task、workspace，验证 ready/完整准备/精确 revision/无活跃执行、原型选择一致；同一次提交保存原始任务、版本、原型内容与完整有界源码。提交后读回才进入模型，模型调用不持锁。
- apply 的 Task 校验与 APPLYING 领取同事务、同锁序。任务更新/换原型/Run 启动识别绑定的 APPLYING/UNKNOWN 意图；PROPOSED 不阻止编辑，但旧 revision 不能应用。完成后的只读重放不要求 Task 仍为 ready。
- delivery 请求不变，仍只收可选 applicationRef。服务端从原始 generation 判定 PREBOUND/POST_HOC，绑定错误不可降级。接受使用交付/Run 原 revision，不误拿提交后 r+1 比较；拒绝保留证据且不重采源码。
- 已有 generation 禁止追补任务身份；迁移只能追加，不改已应用 V13–V15 或此阶段已生效新迁移的 checksum。

<a id="code-task-prebinding--前端最小交互"></a>
#### 前端最小交互

看板已保存 ready 任务携带精确任务及原型身份；规划任务仅带讨论草稿。未保存/陈旧任务不带入。Chat 先显示待采用，不自动消费、替换或发送；公共 ConfirmBox 明示采用影响，取消保留原稿。确认后整体采用文本、身份、原型，清理上一 scratch 的场景/资源/交付信息，不继承旧工具开关，目标文件为空由用户明确填写。显示原任务 revision，允许显式移除绑定；冲突不自动更新 revision。Mock 拒绝产生持久任务绑定证据。

已搜索并复用公共 ConfirmBox/Button/Input；DTO 在 runtime-client，交接状态复用 shell/workbench，纯转换与展示留 Chat/Board L4，无新增共享包或并行 UI 壳。

<a id="code-task-prebinding--验证与边界"></a>
#### 验证与边界

- 前端 `rtk proxy pnpm --dir frontend test run`：82文件/396项通过；typecheck、check:boundaries、build通过。
- 回归覆盖精确任务身份、草稿采用/取消、旧场景/资源不混入、错误保稿且不误判模型切换/会话过期、mock拒绝、PREBOUND与POST_HOC展示。
- 本地浏览器 5173/真实API：复用明确测试任务 `4d95a36d-1afa-47b1-a0bf-23a96942e045`，看板→Chat先显示待采用；取消不改草稿；确认后出现精确 task/revision、目标为空、无消息或模型调用。1440×900及708×640无页面横溢，输入区域在视口内。自动Chromium检查不等于完整内置预览或用户产品验收。
- 后端A+B已实现；V16/V17已在开发环境加载并经实库使用，后续不得改写checksum。父任务全量首次180秒超时未完成，重新以600秒限额执行成功：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 569项、0失败/错误、6条件跳过。Fake模型+真实临时文件+实库覆盖绑定/应用/双向竞态/UNKNOWN/原型/交付接受及跨任务拒绝，不是实际供应商或用户产品验收。
- 最终前端82文件/397项通过，类型/边界/构建通过（保留现有大包警告）。应用任务版本409拒绝原先被GET(PROPOSED)刷新清空，已新增RED→GREEN回归并保留拒绝原因；GET仍优先核对实际结果，不重复写入。
- drive_preview桥无响应后，使用computer_use操作实际Hermes内置预览：看板测试卡→准备任务草稿→确认采用。截图复核绑定显示local-eap/原任务ID/r1、目标为空、任务正文仍在输入框、发送因无模型禁用；未调用模型。最终画面证据 `E:/ai/Hermes/profiles/eap/cache/images/computer_use_4dd213acbb774f7dac43455a0116815e.png`（本机不提交）。仅确认该交互，不代表用户产品验收。
- 独立审查发现CODE_WORKSPACE_BUSY误显示模型变更，已按RED→GREEN补任务阻塞映射；最终前端82文件/398项及类型/边界/构建通过，最终独立复核通过。后端569项仍为上述父任务执行记录，6跳过；真实供应商生成→应用→验证→人工接受仍未验收。
<!-- record:end docs/decisions/code-task-prebinding-2026-11-01.md -->
