# Run 独立验证：实施合同与进度

状态：本阶段实现、自动回归、真实前端工程验证、V10 数据库互锁及最终独立复核通过（2026-11-01）。承接 `board-run-review-2026-10-31.md` 下一阶段及 v1.6 §0B.7/§0B.11；不是完整规划或人工验收已完成。

## 最小切片

保留 Task/Mission/Run 事实源、现有执行器与固定五入口。在 Run 的独立验证面中，用户先准备验证计划，查看本地目录、源码范围与哈希、固定命令、执行副作用，再显式确认启动。页面轮询/刷新只读取持久记录，不重跑命令。此切片仅支持服务绑定仓库的 `frontend` Vite+ 工程；不扩展通用 shell、后台调度、模型或代码生成。

复用 `DefaultProcessExecutor`（不是另写 ProcessBuilder），以有界时长执行固定 `vp exec vue-tsc --build`、`vp test run`、`vp build`。Vite+ 来自既有 CLI 通道 `vp` 的本机解析，Windows 必须为可直接执行的 exe/com，不拼 cmd/shell。执行源码、依赖和构建配置具有代码执行能力，可能生成缓存/构建产物及访问网络；目录绑定不是沙箱，确认框必须说明。不得静默安装缺失工具或依赖。

源码证据绑定 `frontend` 下有界常规工程文件（含未跟踪文件），保存相对路径/字节数/SHA-256，不保存正文；跳过依赖、输出、缓存、隐藏和凭据文件并明确列出排除规则。符号链接/越界、文件数或字节上限、读取失败须阻塞，不能截断为完整快照。执行前重新核对计划，执行后重新取哈希；前后变化为 STALE，不称通过。HEAD、路径、命令、范围哈希共同参与计划哈希。依赖目录、外部输入及执行中修改后又恢复无法由此快照证明，须明确边界。

## API 合同（已实现）

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

## 前端落点

L4 `features/shell/BoardRunVerification.vue`，由既有 Run 面板显式打开。复用公共 Dialog/ConfirmBox/Button/Badge/Collapse，不将三类检查输出常驻堆在任务准备页。调用只经 runtime-client；mock 无真实 Run 时返回明确 404/不可用，不伪造通过。处理中可关闭页面并重读；响应丢失先查询，迟到响应不能串 Run。中英文文案同步。

## 验证与未完成项

覆盖计划过期、源码变化、并发去重、跨项目/Run 拒绝、超时/未知/重启、输出脱敏与限额、刷新回放。保留用户 application.yml，不读取凭据、不调用付费模型、不启停用户 Java 服务。按用户最新授权，每个阶段验证及独立审查通过后自动提交推送；application.yml 持续排除。

仍后置：通用后端 Maven/其他仓库验证配置、源码实现 Run、完整原型多文件交付、人工验收决定与完成状态、Skill/MCP 真实接入、桌面产品化。它们不因本切片通过而消失。

## 2026-11-01 接续核验

- 接续基线为 `032af1d` 加现有未提交验证切片。先复现后端凭据文件漏排除、前端旧成功文案与真实错误码不一致；修复后重验。数据库测试手动构造 ReviewService 未经过 Spring 事务代理，已用真实 TransactionTemplate 保持锁合同，未削弱生产锁。
- 独立审查发现 `tokens.css` 被凭据关键词误排除，以及入队后能力停用被记为永久 UNKNOWN。新增 RED→GREEN：设计 tokens 纳入源码哈希；明确拒绝且没有未确认进程时保存 FAILED/具体原因，真正清理未知仍 UNKNOWN。标准源码清单不包含任意隐含/外部输入，排除项公开。
- 真实 Windows 验证首次失败：受限环境未含 PATHEXT，`vp exec vue-tsc` 无法解析本机已安装的 `.cmd` shim。最小探针确认只加 PATHEXT 即可成功；现固定 `.COM;.EXE;.BAT;.CMD`，不继承自定义后缀、不恢复 NODE_OPTIONS 或供应商凭据。EAP 仍以参数数组直接启动原生 vp.exe，不拼 shell；vp 内部执行可信项目代码的风险照常需确认。
- 最终前端：`rtk proxy pnpm --dir frontend test run` 75 文件/295 项通过；`typecheck`、`check:boundaries`、`build` 通过。大包与 Node localStorage 实验警告仍保留。
- 最终后端：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 71 类/406 项，400 通过、6 跳过、0 失败/错误。真实数据库 Run 测试 19 项，包含事务、并发、互锁与回放；验证命令在持久化测试中用 Fake，不冒充真实构建。5 项既有外部/建删库条件跳过，另 1 项符号链接夹具因 Windows 权限跳过。
- 真实运行：用户的 5173→8080 服务，V9 列/索引在真实持久化测试中可用；没有自行 clean/repair/reset 数据库。内置预览通过实际鼠标操作走完任务→执行审阅→验证计划→确认，第一条失败如实持久化。桌面 DOM bridge 不响应，因此用 computer-use 操作内置预览，独立 Chromium 补 API、刷新与视口量测，两类证据不混称。
- 首次失败记录：Run `1af31e60-5220-408d-b975-d5842e380070` / verification `397ee840-3ff9-4f27-9831-5c3f045ff4e6`，退出 1、清理已确认，保留未覆盖。
- 修复后的新 Run `8596cfe5-fb9c-4166-9cc2-120159d4021c` / verification `046c6243-c6d8-498d-b7aa-20a21ea2bcb9`：在浏览器显式确认后三项真实命令均退出 0、进程树清理 true、未截断；最终 PASSED。源码清单 316 文件，含 `frontend/packages/style/src/tokens.css`，前后哈希相同。页面重新加载后回放同一 ID，不能重复启动。关联任务 `727e6430-d0e4-4860-9eb6-0ece0199d480` 仍 ready、executionActive=false，未标完成。
- 验证计划弹窗在 1440×900、1280×800、1024×640、708×640 下页面/弹层无横向溢出；不把 CSS 尺寸当成系统缩放或用户最终验收。

## 下一关口（非已实现）

最终独立复核未发现阻塞缺陷：核对预检查 UNKNOWN 独立事务、Task→workspace 锁序、V10 旧计划兼容和无计划索引、前端 nullable DTO/失败回读。复核为只读代码及测试报告审查，未冒充再次执行全套测试。

先形成真实源码交付证据，再实现人工接受/拒绝，不能给 git-status 成功直接加“开发完成”。允许最小切片记录明确标注的人工/外部交付，服务端采集允许范围的 Diff/哈希并关联同一源码快照的独立验证；不能接受客户端伪造结果或倒造生成前快照。普通任务更新继续禁止任意推进 done。平台受控源码实现另做持久基线/候选/写入意图/读回证据与工作目录互锁，不能将现有内存 CodeChangeService 直接包装成可靠多文件交付。
