# Run 仓库审阅快照与空白检查

2026-10-31，接续 [原型关联切片](board-prototype-link-2026-10-31.md)。RK-5 新增可持久回放的仓库观察：具体 Run → 采集时基线 → 已跟踪文件 Diff → 实际 `git diff --check` 结果。Run 的原型/任务快照继续保留。本轮不包含源码生成、构建/类型/测试执行或人工验收，不能据此宣称完整 RK-5 已完成。

## 用户行为与实现

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

## 合同与限制

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

## 验证证据

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

## 下一阶段

先把按明确源码范围和版本执行的构建、类型检查、相关测试作为独立证据关联 Run，再接人工审阅/验收决定及任务状态推进。当前保留的都是只读观察，尚不具备原型驱动源码交付的完整验收链路。Transfer、TreeSelect、虚拟树等未定 UI 候选不受本轮影响。
