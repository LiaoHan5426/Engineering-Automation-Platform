# 历史路线图与阶段验证完整记录

本页保存历次整理前路线与台账全文：早期基线 `82aa504`，以及[2c7e87b统一整理前台账](#planning-before-workbench-consolidation)。原文中的当前/下一步、测试数字及阶段状态仅代表各自历史时点；现行路线以[roadmap](../roadmap.md)和[规划状态](../planning-status.md)为准，不能重新激活已被覆盖的双入口或旧执行前置要求。

<!-- record:start docs/roadmap.md -->
# Roadmap

## 当前路线图 — 基线 main / 2b0fe26

本节为独立规划同步；没有修改业务代码或重跑运行验收。以[v1.6当前合同与进度](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)、[完整接续台账](../planning-status.md)及[界面验收清单](frontend-history.md#frontend-adjustment-acceptance)为当前执行依据。下面带日期的旧记录是历史快照，不能把当时“尚无GrapesJS/list-dir/Run/Skill”继续当作当前待办。

| 主线 | 已交付的限定范围 | 下一关口 |
|---|---|---|
| 桌面式工作台 | 五入口、场景/Builder/看板分面、真实文件树、共享UI与主题；`1f38cd8`等 | 全页面真实缩放/焦点/错误矩阵及用户体验接受 |
| 原型与源码 | GrapesJS八类语义映射/版本；单目标生成前基线、持久候选与应用、目录互锁；`f6aed04`/`f614272` | 更多必要映射、多文件约束、真实供应商自身改页验收 |
| 交付证据 | Run独立三项检查、源码交付、持久接受/拒绝、POST_HOC/PREBOUND；`04edef5`～`69892f3` | 经授权在EAP内走完实际页面改造与用户接受；Git Run不是源码作者 |
| 资源 | 单专家授权知识及旧记忆隔离 `c9d23a7`；Skill文本版本/启停/按需Chat引用 `2b0fe26` | MCP真实协议、场景资源整合、规划/Agent和Work执行；Skill目录导入延期 |
| 桌面发行 | Electron安全preload壳、bootstrap引导脚手架 | Windows sidecar、一体启停/迁移、安装包验证和签名发行决定 |

最近代码阶段验证：前端92文件/525项通过；后端647项、0失败/错误、6条件跳过；typecheck/build/boundaries通过。实库、浏览器和独立复核范围见[Skill阶段记录](resource-history.md#skill-text-import)。这些是已有运行证据，不是本次文档更新重跑，不代表所有规划、真实模型或用户最终验收完成。

推进原则：复用已完成能力，不重建会话/任务/模型循环；工程自身改页、资源能力和桌面产品化分别设验收关口，不把市场或完整调度器作为前置。提交前同步主方案对应行、台账与decision，保留application.yml本地修改；测试决定不能替用户接受。

## 历史路线图与阶段证据

以下保留原记录和当时测试数字，历史“下一步”由上面的当前路线图取代；旧双入口/Builder一级入口等由v1.6 §0B覆盖。

## §0B.2 browser-verified layout corrections — 2026-10-28

Built-in browser pass after image links restored. Large layout changes: summary docked as
right rail (not fixed overlay); scene list→detail (frame-080/088); layered `+` menu and
ask-policy label verified in UI. `ScenarioWorkspace` **5 passed**. Not full recording
acceptance. See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## §0B.2 image-alignment UI corrections — 2026-10-28

After restoring keyframe image links in §0B.2, corrected text-only drifts vs frames:
layered `+` menu; approval options with honest disables; catalog-fail emphasis; scene
local/market + cards + dep banner; expert category chips; board lane hints. Later same day
re-verified in browser with structural changes above.

## Electron 45 adaptation — 2026-10-28

`@eap/desktop` pinned to **Electron 45.0.0** (Node ≥22.12). Sandbox preload is CJS
(`preload.cjs` + `require('electron')`); main stays ESM. `check:preload` static guard;
`electronMajor` on `DesktopPlatformInfo`. Verified: `electron --version` → v45.0.0;
`check:preload` ok; `localBridge` **4 passed**. Still open: signed package / sidecar.
See `frontend/apps/desktop/README.md` and [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## GrapesJS / Electron / installer scaffolds — 2026-10-28

Unblocks later work without claiming full product acceptance. Grapes: `PrototypeSchema` +
`GrapesEditorScaffold` (dynamic grapesjs or honest offline scaffold; HTML ≠ Vue delivery).
Electron: `frontend/apps/desktop` preload `window.eap` (chooseWorkspace / platform /
openExternal / notify); later same day bumped to Electron 45 CJS preload. Installer:
`scripts/eap_bootstrap.py` writes `.eap/local-bootstrap.json` and prints start/health
steps (not an Agent host). Browser `#builder-alpha`: Grapes boundary + save Schema note.
`prototypeSchema`+`GrapesEditorScaffold`+`localBridge` **7 passed**. Still open: component
registry, signed desktop package, DB migrate/auto-start, list-dir, SQL e2e.
See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-02 server file-tree honesty + RV-01 SQL evidence + UI-01 zoom sample — 2026-10-28

Sidebar「仓库文件观察」states server file tree is offline and never invents browseable
folders; dirty basenames (≤8) are observations only. `#sql` adds `sql-evidence` scoped to
the current analysis task (empty when none selected). Fixed `desktop.repoFiles` key clash
with the sources panel. Browser: chat scope + dirty list; sql empty evidence; ~1024px
(≈1280@125%) `#sql` no page horizontal overflow. `DesktopNavigation`+`SessionPanel`
**16 passed**. Grapes/Electron/installer scaffolds delivered same day. Still open: real
list-dir API, SQL e2e numbers. See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-02 multi-group admin — 2026-10-28

`localProjects` create/rename/remove local group labels (keep ≥1; delete clears session
`projectId` → unbound, no file deletes). Sidebar「＋ 新分组」inline form states label-only;
group「⋯」rename or inline delete confirm. Browser: create「Demo 分组」→ rename「演示仓」→
confirm delete → only EAP remains. `localProjects`+`DesktopNavigation` **10 passed**.
Not delivered: server file tree, SQL run numbers, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-02 local group project tree — 2026-10-27

Code/Work sidebar `project-tree` states「本机分组树 · 不是仓库文件树」. Group nodes
expand/collapse; children include demo task board + sessions, with empty「此分组暂无会话」.
Selecting a group expands it. Browser: scope visible; expand EAP → board + empty
sessions; open board → `#board`; collapse hides children. `DesktopNavigation`+`console`
**14 passed**. Multi-group admin delivered 2026-10-28. Still open: server file tree, SQL
run numbers, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-01 multi-page 708 matrix — 2026-10-27

At ~708px: topbar hides brand/chip, shortens workspace label, keeps readable
「打开侧栏」; SQL secondary actions hide so「运行分析」stays reachable; workbench
padding 16×12. Board lanes scroll inside `.board-scroll` without page overflow;
scenes/layout-draft/expert catalog tighten to single column. Browser matrix
`#chat` `#board` `#scenes` `#expert-catalog` `#model-settings` `#sql`: no page
horizontal overflow; scenes drawer+backdrop Esc-close works. Related FE tests
**26 passed**. Not delivered: zoom matrix, full project tree, GrapesJS, Electron,
installer. See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## MD-01 credentials → catalog → allowlist → chat — 2026-10-27

`#model-settings` shows `model-pipeline`「凭据 → 目录 → 允许模型 → 对话选用」; catalog
states sync never auto-checks. After save, discovery failure (`throw` or
`discoveryError`) keeps the cached-catalog note and opens allowlist; success asks to
choose allowed models. ~708px settings/dialog tightened. Browser: fake-key save shows
cache + allowlist; manual `general-demo` → `#chat` picker only `MD01-Demo · general-demo`
with model-default effort. `ModelSettings`+`ModelCatalogEditor`+`catalogNote` **8
passed**. Not delivered: live vendor catalog/paid call, GrapesJS, Electron, installer.
See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-02 SQL deterministic scope — 2026-10-27

`#sql` shows `sql-scope`「确定性分析工作面 · 不是对话摘要或变更面板」; long boundary
copy lives in collapsed「工作面边界」. At ~708px the studio is single-column;「＋ 新的分析」
scrolls the goal field and「开始分析」into view; no chat `session-panel`. Browser wide/narrow
`#sql` confirmed. Not delivered: full project tree, live SQL end-to-end numbers, GrapesJS,
Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## RV-01 panel cross-refresh — 2026-10-27

`sessionPanels` persist to local `localStorage` (`eap.session-panels.v1`, mock-prefixed);
`adoptScratch` carries the open panel onto the new conversation id. Refresh restores
summary/changes/sources for the active session. While `/ai/status` is still loading,
dirty no longer flashes `AUTHORIZED_ROOT_MISSING`. Browser: open summary → reload keeps
it open above the composer; `#model-settings` has no panel → back to chat restores
summary and draft. `workbench`+`runtimeIdentity` **16 passed**. Not delivered: SQL
evidence surface, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-04 cross-refresh picks — 2026-10-27

`sessionExtras` (scenario / experts / resources / project / execution / delivery)
persist to local `localStorage` (`eap.session-extras.v1`, mock-prefixed) and reload on
boot; catalog experts rehydrate from the in-app catalog. `welcomeKept` states refresh
will not clear picks. Browser: select「原型到代码」+「文档整理」→ reload keeps
selection, draft, and summary `文档整理@demo-1`. `workbench`+`WorkspaceWelcome`
**12 passed**. Not delivered: panel cross-refresh, real expert tools, GrapesJS,
Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-01 narrow drawer + CP-03 short send — 2026-10-27

At ~708px the project sidebar is a masked overlay (`sidebar-backdrop`) instead of
squeezing the chat column; rail+workbench stay `64px + 1fr`. Close via topbar,
Esc, or backdrop; after close composer ~620px wide and send stays in view.
Utility bar keeps path+tools on one row; meter shortens to「文件 n/6 · 无 token」.
Browser: open drawer → Esc/backdrop close keeps draft; execution popup Esc returns
focus without clearing text. `TaskComposer`+`DesktopNavigation` **16 passed**. Not
delivered: multi-page narrow matrix, zoom matrix, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## RV-01 panel follows session — 2026-10-27

Summary/changes/sources/terminal show `panel-session`「只反映当前会话，不是设置页证据」.
Switching sessions clears the changes-panel file selection so the prior highlight cannot linger.
Leaving chat/sql/board for settings closes the task panel (re-verified in browser). Browser:
`#chat` summary shows the session bar; `#model-settings` has no `session-panel`.
SessionPanel + workbench tests **14 passed**. Not delivered: cross-refresh panel restore, SQL
evidence surface, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## SC-02 scenario scope collapse — 2026-10-27

Scene detail no longer dumps switch-boundary / preset / skills / MCP prose on first paint.
Short chips show「技能未接通 · MCP 未接通」; full copy lives in collapsed `scene-scope`「场景职责」
(auto-closes on scenario change). Missing deps still expose「查看位置」; globally disabled
scenarios keep Apply disabled. Layout-draft boundary copy shortened. Browser `#scenes`:
collapsed scope → expand shows no plugin install; disabled「文档编写」+ locate「全局禁用」.
`ScenarioWorkspace` tests **4 passed**. Not delivered: real skills/MCP, GrapesJS, Electron,
installer. See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-01 collapse boundary notes — 2026-10-27

Sidebar and scene delivery gate no longer dump long host/grant “comment-like” copy on first
paint. Short status lines show path / process-bound / dirty basenames; honesty text lives in a
collapsed `host-notes`「边界说明」with forced hide when closed. Risk-review / run-recovery /
welcome hints shortened. Browser `#chat`: collapsed notes + short status; expand still shows
host boundaries. `#scenes` gate uses the same pattern. Related FE tests **37 passed**. Not
delivered: full narrow-viewport UI-01 matrix, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## EX-01 expert trace + UI-04 keep picks + welcome reachability — 2026-10-27

Fixed welcome expert pills overlapping the composer (clicks were intercepted). Chat feed gains
bottom padding / scroll-padding and tighter welcome margins so pills stay clickable. Summary
shows `expert-none` when empty and a styled `expert-trace` with `name@version` / guidance /
resources when selected. `welcome-kept` states catalog round-trips will not clear or send.
Browser: select「文档整理」→ summary `文档整理@demo-1` → `#expert-catalog` → back keeps
selection and draft. SessionPanel + WorkspaceWelcome tests **11 passed**. Not delivered: real
expert tool grants, cross-refresh persistence, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## CT-01 run recovery + verification config + UI-04 draft hint — 2026-10-27

Summary/terminal surfaces state that closing or refreshing will not resume a background Run
(UI cache only; no invented continuation). Changes panel `VerificationChecks` shows live
`verificationEnabled`/`verificationCommands` first (`eap.runtime.verification.enabled=false`
when off) without treating idle checks as executed. Welcome `welcome-draft-hint` states that
picking a scenario/expert does not send. Browser `#chat`: recovery copy on summary;「验证配置：未启用」
on changes;「选择不会发送」on welcome. SessionPanel + WorkspaceWelcome tests **10 passed**.
Not delivered: persistent Run / cross-restart recovery, enabling typecheck/test/build, GrapesJS,
Electron, installer. See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## PB-01 live layout draft — 2026-10-27

Live prototype-to-code design step embeds `LayoutDraft` (sidebar/popover/summary,
save/reopen) with explicit「不是 GrapesJS」boundary; Builder also hosts the same draft and
copies title/prompt into prototype fields on save. Browser `#scenes`: toggle all three
interactions →「已操作」→ save → new draft timestamp listed. ScenarioWorkspace + workbench +
builderView tests **13 passed**. Not delivered: GrapesJS/Schema editor, paid models, Electron,
installer. See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## UI-02 session project honesty + CP-02 risk review — 2026-10-27

Session summary separates UI project grouping from the local-service process path: unbound
sessions say「未绑定项目分组（不伪装目录）」and never treat the process path as a session
repository. Grant/policy surfaces state「风险审核未接入，只能逐次确认或只读」. Browser `#chat`
summary + approval menu verified. SessionPanel + TaskComposer tests **17 passed**. Not
delivered: full project tree / SQL workface, paid models, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## SC-01 develop handoff — 2026-10-27

Live「带入版本，进入代码对话」no longer dead-ends on `blocked=true`. When delivery gates
are open it writes `eap.chat.prototype`, applies the prototype-to-code scenario extras
(including delivery target path), switches to code mode, and navigates to chat — same import
contract as Builder `useVersionInChat`. Selecting a saved version closes the missing-version
gate; without a model, develop stays disabled. Browser `#scenes`: listed saved version
`SC-01 browser version`, select → gate list only「没有可用的模型连接」. FE
`ScenarioWorkspace` tests **4 passed**. Not delivered: paid model to finish the handoff live,
GrapesJS, Electron, installer, enabling heavy verification. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## PB-04 safe verification probe — 2026-10-27

`POST /api/ai/workspace/verification/probe` runs fixed `git --version` under the process-bound
root without enabling configured typecheck/test/build. Scene gate shows「试跑验证探测」and reports
exit code/summary while stating it is not apply verification success. First-paint prep shows
「准备状态：加载中…」instead of a false missing baseline. Browser `#scenes`: probe →
`git-version-probe · 退出码 0` + honesty copy; verification config stays off /
`not_requested`. FE ScenarioWorkspace + mock tests **4 passed**;
`EngineeringTaskFlowTest` **10 passed**. Not delivered: enabling heavy verification commands,
paid models, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## PB-04 acceptance checklist + CP-01 send gate — 2026-10-27

Live delivery gate gains a session-local human acceptance checklist; checking all items only
says「本机清单已勾选」and still denies typecheck/test/build success. Chat shows「尚未选择可用模型」
with link to settings while send stays disabled. Stale dirty `AUTHORIZED_ROOT_MISSING` after bind
is cleared when status root appears (`refreshRuntimeIdentityAndDirty`). Browser: `#chat` send
disabled + settings link; `#scenes` checklist → human-done copy. Related FE tests **11 passed**.
Not delivered: enabling verification commands, paid models, GrapesJS, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## SC-01 delivery gate guidance — 2026-10-27

Scene gates follow live `/ai/status` model state (missing vs unverified advisory). Blocking gaps
disable「应用到当前会话」/「带入版本」so empty chat is not the escape hatch; gate rows link to
builder versions and model settings. Prep refresh button reloads identity/baseline/source/dirty.
Browser `#scenes`: bind/baseline ready, apply disabled,「去模型设置」→ `#model-settings`, dirty 40
after refresh. Related FE tests **11 passed**. Not delivered: enabling typecheck/test/build, paid
models, GrapesJS acceptance, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## PB-04 verification config + live dependency honesty — 2026-10-27

`/api/ai/status` exposes `verificationEnabled` / `verificationCommands` (default off). Scene page
refreshes local-service identity on mount; delivery dependencies follow process-bound root and
baseline instead of a stale “本机仓库授权 · 未配置”. Browser `#scenes` checked: bind/baseline
「已提供」, verification「未启用」, `/#chat` preview + acceptance open, dirty count live. Related
FE tests **17 passed**; `AiConnectionStatusTest` passed. Not delivered: enabling typecheck/test/build
commands, GrapesJS acceptance, paid models, Electron, installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## PB-03/04 page-preview honesty — 2026-10-27

Colocated UI can show a clickable local preview (`/#chat`) without claiming build/test or human
acceptance. `pagePreview` refuses mock / non-local origins; SessionPanel, VerificationChecks,
ScenarioWorkspace and PrototypeFlow share the same wording. Related `vp test` **13+ passed**
(pagePreview / SessionPanel / PrototypeFlow / ScenarioWorkspace). Browser re-checked with the
verification/dependency slice above. Not delivered: GrapesJS / real changed-page acceptance,
enabled typecheck/test/build, paid models, Electron, Python installer. See
[§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## PB-03 apply conflict UI — 2026-10-27

Apply conflicts (`FILE_CHANGED_SINCE_PROPOSAL`) map to explicit copy via `applyFailureMessage`;
`pendingWrite` gains `conflict` and clears the confirm checkbox. Frontend applyError/pendingWrite
tests **4 passed**. Backend conflict rejection was already covered. Chat Git follows live
`tools.git_status` (HTTP true); plan/agent stay disabled off-mock. Page-preview honesty landed in
the slice above. Not delivered: paid models, enabled typecheck/test/build, Electron, Python
installer. See [§0B.8](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md).

## Dirty stdout deadlock + local-service bind — 2026-10-27

Dirty `waitFor` stdout deadlock fixed; HTTP dirty `requested=true` (~242ms). Colocated empty
`authorized-root` binds via `RuntimeWorkspace.colocated`. PB-02 `TARGET_PATH_REQUIRED` enforced.
Earlier UI-03 host/`running-context` alignment remains in effect. Detail: §0B.8 in the v1.6 scheme.

## Chat engineering task slice — 2026-10-24

Implemented in the working tree: selected model connection, text-file context, configurable expert guidance,
saved prototype reference, source proposal review and separately confirmed writes to the authorized bound
workspace. Builder can open a saved version in chat code mode. No Handoff/Mission prerequisite, automatic
commands, new Harness, or external Agent execution. Source writes remain unverified until build/test.
See [implementation, usage and limitations](../decisions/chat-engineering-task-slice.md).
Backend: clean test/package passed (252 passed, 0 failed, 5 gated skips). Frontend: typecheck,
17 files / 70 tests, boundaries and production build passed. Development-only Vue MCP
initialization, discovery, component tree/state and a harmless menu-state edit were exercised against the
running Vue app. Paid GPT/DeepSeek calls and the existing isolated Builder database acceptance remain
unverified. Model configuration alone is not a successful provider test.

## v1.6 local progress — 2026-10-23

This status uses the local working tree, including uncommitted work, rather than the older GitHub
baseline. The supplied `EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md`, section 0A,
supersedes older proposals for custom model transport and tool loops. Its old GitHub-based code
claims are historical; this roadmap uses a9b14bc plus local changes. The attachment is a target
reference, not proof of implementation or authorization to execute all its stages.

| Slice | Actual status / remaining gate |
|---|---|
| AGENTS governance and extension audit | Delivered; module guidance and acceptance matrix exist |
| P1-A/B execution policy, evidence, lifecycle | Implemented with Windows native process tests; trusted local tools, no sandbox guarantee or restart recovery |
| Spring AI | 2.0.2 / Boot 4.1.1 integration implemented; ChatClient, official tool loop, memory and read-only Git tested offline; no live provider acceptance. Local OpenAI-compatible connections can be added, edited, enabled and chosen per conversation without a restart. Environment settings are the default only while the user has saved no connection. A target change requires confirmation and does not send the old session. Secrets are not returned. SQL cache stays partitioned by connection revision and still fails closed. Connection management is an auxiliary local setting for that existing integration, not a provider platform, and it is not the product mainline. Engineering task delivery remains the mainline. Codex and Hermes keep their own runtime entry; they are not required to use a Spring AI connection, and Spring AI does not own their tool loop. The SQL compression and cache rules are not applied to chat or to those agents. No further model-admin surface is the next step. |
| SQL model enhancement | Deterministic rules/cache/fallback retained; production transport uses the Spring AI compatibility bridge; old connection settings require migration |
| Test consolidation / generated cleanup | Legacy tests migrated plus shared Fake ChatModel; 190 total / 186 passed / 4 unchanged skips; initial 82-file cleanup followed by removal of 302 historical files and all 24 audit subdirectories; final conclusions and inventory retained |
| Documentation | Single docs/README.md entry; old UI reviews and per-round Codex reports consolidated; 14 superseded documents/prototype files retired, valid decisions and active console prototype retained |
| Codex P1-C | Adapter, model communication, process and Artifact evidence implemented; file delegation was denied, acceptance remains incomplete; investigation paused |
| Chat workbench | S1 wired on 2026-10-24: `GET /api/ai/status`, `POST /api/ai/conversations`, `POST /api/ai/conversations/{id}/messages`, and a `#chat` page. In-memory sessions, synchronous requests, no reliable cancel, no live provider acceptance. The landing page remains the SQL workbench |
| Workspace plugins | 原型已实现，自测通过，待用户交互验收。仅 P0/P1，见 [S2 plugin ADR](../decisions/s2-workspace-plugin-contract.md)。交接记录已实现。持久任务壳已完成。只读 git-status 单步执行已实现 |
| Mission | 持久任务壳已完成。只读 git-status 单步执行已实现：启动与创建分开，Git 命令只由能力入口构造，取消终态需要进程退出证据。未知执行会阻塞下一次启动。人工解除机制尚未实现，不能算可恢复 Mission。见 [Mission single-step contract](../decisions/mission-single-step-execution-contract.md)。没有调度、审批流、自动续跑或独立验证 |
| Builder | GrapesJS editor, semantic schema and repository handoff are not implemented. The P0/P1 prototype has a manual Vue preview bound to the browser draft, plus a separate version preview. A saved version is immutable only because the application inserts and has no update path. V17 has no update trigger; V18 only corrects the table comments and says they are not a database guard. Content is redacted before it is stored and hashed. One delivery sheet cites that version. Preview responses are dropped when they no longer match the open version. Repository, baseline and Agent stay unbound. Historical hashes stay stored as written; new saves use Jackson. That is not a claim that every historical payload can be recomputed, and there is no hash-check API or algorithm registry. `PrototypeDeliveryAcceptanceTest` runs only when `EAP_RUN_CLI_INTEGRATION=true` plus explicit `EAP_DB_URL`, `EAP_DB_USERNAME` and `EAP_DB_PASSWORD`, and then creates, migrates and drops its own database. Status: 实现及离线检查通过，最终页面冒烟已通过，隔离数据库验收未执行. Acceptance is not complete. The two checks stay independent. On 2026-10-24 the four database variables were still unset, so the isolated test was not run and daily credentials were not read. The page smoke on the already running builder passed: save `4dc9d40e-d25e-4d25-ae33-1da2403745f4`, reopen, temporary click, close and reopen, and a repeated delivery sheet `dfb9990c-9ee0-4f3e-bb36-f0c9a0361d43`. The prior version and browser draft were kept. The authorized root was not changed. CodexAdapter stays a single CLI exec candidate with no production delivery entry. The CLI version is evidence only: preflight checks that `exec --help` succeeds and lists the flags actually used, including `--ephemeral`, and does not keep an exact-version allowlist. `CodexLocalConfigTest` is skipped unless `EAP_CODEX_CONFIG_CHECK=true`. Once that gate is open, a missing `EAP_SMOKE_CODEX` fails the test. It records `--version` without requiring a specific version, and a successful `features list` only shows that the current config parses. The SDK is a programmatic control for the existing agent, not a reason to build another harness, and it is not added. Instruction material is one CLI argument and is not parsed into further arguments. The write limit comes from the CLI and runtime policy. The offline stand-in, 26 tests and 0 failures, did not verify model behavior, prompt-injection defense, or a real sandbox write; that run was not repeated for this wording change. The archived file delegation exited 0 with a policy denial and no target file, so real file delegation remains unaccepted; earlier timeouts are not every case. Git status and diff are evidence only. Isolated database acceptance remains unrun and overall acceptance is not complete. |
| P1-D | Independent Diff/Build/Test validation remains unimplemented and separately gated |

Next: 连接管理停在保存、选择和切换现有模型连接。后续优先补真实工程任务的端到端交付，不再连续增加模型管理功能。只读 git-status 已收敛到共享运行时和单一 Git 入口。未知执行会阻塞，人工解除机制尚未实现，不能算可恢复 Mission。调度、审批流、自动续跑、独立验证和仓库写入仍未实现。见 [Mission single-step contract](../decisions/mission-single-step-execution-contract.md)。
S1 is implemented; see [S1 Chat design](../decisions/s1-chat-spring-ai-design.md). Its close-out on this worktree recorded
`mvn -f backend/pom.xml test` as 205 passed, 0 failed, 4 skipped, and `pnpm --dir frontend test run` as 51 passed.
That suite was not re-executed while writing this status note. The P0/P1 close-out on 2026-10-24 re-ran `pnpm --dir frontend test run` (12 files, 56 passed), `pnpm --dir frontend typecheck`, and `pnpm --dir frontend check:boundaries`. The backend suite was not re-run; the prototype does not change it. Build was verified in the implementation pass and was not repeated for this wording change. The P2 handoff close-out on 2026-10-24 re-ran `mvn -f backend/pom.xml test` (209 passed, 0 failed, 4 skipped), `pnpm --dir frontend test run` (13 files, 59 passed), and `pnpm --dir frontend build`. Live database checks are separate from those results. The mission-shell close-out on 2026-10-24 re-ran `mvn -f backend/pom.xml test` (216 passed, 0 failed, 4 skipped), `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (14 files, 61 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. Live database checks stay separate. The git-status execution slice on 2026-10-24 re-ran `mvn -f backend/pom.xml test` (231 passed, 0 failed, 4 skipped), `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (14 files, 61 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. Live database checks stay separate from that suite. The git entry close-out on 2026-10-24 applied only the proposed files onto `9692fa7` in an isolated checkout and re-ran `mvn -f backend/pom.xml test` with the committed POMs (237 passed, 0 failed, 4 skipped). The earlier workspace run of 241 included uncommitted POM edits and is not the commit proof. This commit still includes the git-status frontend files. Their checks were recorded with that slice on 2026-10-24: `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (14 files, 61 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. Those frontend checks were not re-run for this close-out. The builder version offline check recorded on 2026-10-24 is `mvn -f backend/pom.xml test` (245 tests, 0 failed, 5 skipped). `PrototypeDeliveryAcceptanceTest` is the additional skip because `EAP_RUN_CLI_INTEGRATION`, `EAP_DB_URL`, `EAP_DB_USERNAME` and `EAP_DB_PASSWORD` were unset, so that test did not connect or migrate. V18 was added after that suite; `SchemaAndWiringTest` was re-run and passed (5 tests). The same combination passed `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (16 files, 67 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. The daily service authorized root was not changed. That offline run was not repeated for this delivery note. `backend/eap-runtime/pom.xml` is already in `b3813a1`, and the expert-sdk formatting is already in `4d1cf0d`; neither belongs to the remaining 24-file slice, and the old exclusion wording is retired. Status: 实现及离线检查通过，最终页面冒烟已通过，隔离数据库验收未执行. Acceptance is not complete. The checks stay independent. On 2026-10-24 the four database variables were still unset in the process, user and machine environments, so `PrototypeDeliveryAcceptanceTest` was not run. Daily credentials were not read. There is still no migration, concurrent-uniqueness, old-version or cleanup result from that isolated test. A previous daily-database check does not replace it. The page smoke on `http://localhost:5173/#builder-alpha` passed: saved `4dc9d40e-d25e-4d25-ae33-1da2403745f4`, reopened it at 1 press, a temporary click showed 2 while the live draft stayed at 1, close and reopen restored 1, and generating the delivery sheet twice returned `dfb9990c-9ee0-4f3e-bb36-f0c9a0361d43`. Prior version `116967fb-fcc8-49ec-a8a4-2042ae80ecb0` was unchanged. The authorized root was not changed, and Agent was not connected. No container, database admin script, or test framework was added. The 2026-10-24 Codex offline-contract note keeps one CLI exec as the candidate, corrects the SDK rationale, and does not connect a production delivery entry. A later exact-version maintenance plan is replaced by a capability check: `--version` records the CLI, and `exec --help` must succeed and include the flags in use, including `--ephemeral`. Missing flags or a failed help command are rejected without changing argv, sandbox, approval, network, or the zero-retry setting. `CodexLocalConfigTest` no longer requires CLI `0.163.0-alpha.11.2` or an old-config failure string. JUnit skips it unless `EAP_CODEX_CONFIG_CHECK=true`; with the gate open, a missing `EAP_SMOKE_CODEX` is a failure. It uses a temporary `CODEX_HOME` and writes evidence in the test temp directory. The 2026-10-24 close-out passed 26 adapter tests and skipped this one because the gate was not `true`. The binary was also unset, so real config parsing, a sandbox restriction, and a file write stay unverified. Success of this test would still not prove a sandbox restriction or a file write. Instruction text beyond 4000 characters is rejected rather than truncated, and instruction material is one CLI argument rather than further CLI arguments. The 26-test stand-in did not verify model behavior, prompt-injection defense, or a real sandbox write, and was not re-run for this wording change. Real file delegation remains unaccepted. Isolated database acceptance remains unrun and overall acceptance is not complete. Mission core lifecycle must remain independent
of any board plugin. Builder repository delivery depends on Mission execution and independent P1-D
verification; Electron follows those paths. EAP owns grants, engineering tools, execution records and
Artifacts; Spring AI owns generic model/tool-calling infrastructure; Codex remains an independent
external agent adapter. No parallel Provider or Agent Runtime framework is planned.

See [Spring AI implementation](../audits/spring-ai-integration-report.md) and
[consolidation and cleanup](../audits/spring-ai-consolidation-report.md) for validation and migration details.

The roadmap is ordered so that each phase unlocks a **measurable** part of the value chain in
[pipeline.md](../pipeline.md): first make the deterministic stage real, then make the model stage cheap
and optional, then make completion trustworthy, then make the product usable.

Legend: ✅ implemented · 🚧 in progress · ⬜ planned.

## Phase 0 — Deterministic foundation ✅

**Goal.** Run real local tools and return structured, inspectable evidence without any model.

Delivered: `Capability` / `ExecutionContext` / `Observation` / `ProcessExecutor` SPI;
`CapabilityRegistry`; `git-status`, `git-diff`, `rg-search` capabilities; argument-array process
execution; CLI entry point.

**Exit criteria (met):** unit tests cover process execution, timeouts and output limits; the CLI
returns deterministic output for the same workspace.

## Phase 1 — Expert orchestration and knowledge ✅

**Goal.** Describe an expert declaratively and run it as a validated dependency graph.

Delivered: `eap/v1` expert manifest; `ExpertGraph` DAG validation (single entry, no cycles, known
capabilities, mandatory no-credential rule) and topological ordering; `ExpertExecutionService`
with required-node blocking; deny-by-default knowledge grants; PostgreSQL full-text + local-keyword
knowledge retrieval; redacted database metadata snapshots; the built-in `sql-expert`.

**Exit criteria (met):** tests cover ordering, disconnected/cyclic graphs, unknown capabilities,
missing privacy rule, no-grant knowledge access, required-node blocking, and Chinese keyword
retrieval.

## Phase 2 — LLM preprocessing gateway and decision layer ✅

**Goal.** Make the model optional, cheap, bounded and auditable. *(This is the phase that was
missing and that made the product feel like a rules toy.)*

Delivered:

- `DeterministicSqlAnalyzer` v3: extracts structural facts and runs the expert's declared rule packs.
  (The ~15 checks themselves are no longer Java — see Phase 2b.)
- `DecisionProvider` / `RuleBasedDecisionProvider`: route-or-skip with confidence and rationale.
- `PromptPreprocessor`: token-bounded, structured prompt with a measured compression ratio.
- `LlmGateway` + `OpenAiCompatibleProvider`: SQL LRU cache and fail-closed compatibility boundary;
  Spring AI ChatClient owns transport. Explicit provider enablement replaces the old remote switch;
  HTTPS (or loopback HTTP) is required. See environment.md for configuration migration.
- Wired into `ExpertExecutionService`; the response now carries `modelAdvisor` (decision, rationale,
  preprocessing stats) and `analysisMode`.

**Exit criteria (met):** tests prove the rule set flags the expected structures, preprocessing
compresses below a naive baseline and respects the token budget, the gateway fails closed without a
provider, and the decision layer skips when deterministic evidence is decisive.

**Exit criteria (to extend):** a recorded benchmark that replays a corpus of SQL and reports the
percentage of requests that never call a model and the mean compression ratio for those that do.

## Phase 2b — Config-driven experts, rules and dispatch ✅

**Goal.** Stop shipping judgement as Java. An expert and its checks must be data, so an operator can add
one without a rebuild — the capability that makes the product "like a workflow console" rather than a
fixed tool.

*(This phase was added after review found that the example SQL expert — held up as the reference
implementation — was in fact hard-coded: the manifest's `rules` array was never read, the checks were
Java string constants, and the executor dispatched capabilities with a `switch`. See
[expert-knowledge-rules.md](../expert-knowledge-rules.md).)*

Delivered:

- `SqlFactExtractor` — parses SQL into a flat fact map with **no** domain judgement, plus
  `SqlFactVocabulary` declaring the contract.
- `RulePack` / `RuleEngine` — a declarative condition language (`all`/`any`/`not`, `eq`/`gt`/`in`/
  `contains`/`exists`/`matches`, `{{fact}}` interpolation) with a configurable confidence policy.
- `rules/sql-antipatterns.json` — every previous check, its severity, escalation and wording, as data.
- Rule pack CRUD: `GET/POST/PUT/DELETE /api/rule-packs`, `PUT /api/rule-packs/{id}/activation`,
  `GET /api/rule-packs/vocabulary`, and `POST /api/rule-packs/dry-run` for previewing findings before
  publishing.
- `CapabilityHandler` + `CapabilityHandlerRegistry` — the executor's `switch` is gone; a capability is
  one bean.
- `BuiltinResourceSeeder` + `expert_definition.builtin` — shipped experts are ordinary rows, so the
  previous four `if ("sql-expert".equals(id))` special cases are removed.

**Exit criteria (met):** a rule pack authored only inside a test — with an id that appears nowhere in
`src/main/java` — changes the findings; declared capabilities and registered handlers cannot drift
apart; every fact the extractor produces is declared; the full pre-existing test suite still passes.

**Exit criteria (to extend):** rule pack revisions are content-addressed so two revisions can be
diffed; `SqlMetadataInspector` and `DeterministicTaskPlanner` are migrated to packs (see
[expert-knowledge-rules.md](../expert-knowledge-rules.md) §6).

## Phase 2c — Capability kinds and requirement contracts ✅

**Goal.** Make the capability catalog answer the questions an operator actually has, and make "this
rule can never fire because its capability is not in the graph" impossible to ship silently.

*(Added after review found two gaps. The catalog was a flat list of names, so nothing said whether a
capability was an in-process command, a local binary or an MCP tool, nor whether it was runnable on
this machine. And an expert could reference a rule pack whose facts no node in its graph could
produce: the pack loaded, the run "succeeded", and the findings were simply missing.)*

Delivered:

- `CapabilityKind` (`command` / `cli` / `mcp` / `http`), `CapabilityDescriptor` and
  `CapabilityAvailability`, all declared by the handler rather than inferred by the console;
  `LocalBinaries` probes `PATH` without executing anything.
- `CapabilityCatalog` + `GET /api/capabilities`: grouped by kind, with inputs / grants / executor /
  facts / evidence / readOnly, availability, `usedBy`, and `declared` / `unregistered` /
  `undeclared` reconciliation.
- `Fact.producedBy` in `SqlFactVocabulary` (48 facts across 5 producing capabilities) and
  `RulePack.Requires.capabilities`, with `RulePacks.validate` comparing the declared set against the
  derived one and rejecting a capability that publishes no facts.
- `ExpertGraph.validate(manifest, knownCapabilities, packRequirements)` rejecting an expert that
  references a pack without the nodes producing its facts.
- Judgement moved out of the `sql.parse` node into a post-graph stage
  (`DeterministicSqlAnalyzer.extract` / `.judge`), `RuleEngine.BlockedRule`, and a new shipped pack
  `rules/sql-snapshot-evidence.json` — 5 cross-capability rules over SQL shape + schema + index + plan
  facts.
- `blockedRules`, `ruleCapabilities`, `rulePackRequirements` and `executedCapabilities` in the
  analysis response; the console groups capabilities by kind and shows unmet requirements.

**Exit criteria (met):** tests cover kind/availability completeness, declared-vs-published facts,
declared-vs-registered vocabulary, missing / incomplete / unknown-capability declarations, an expert
whose graph lacks the required nodes, and a cross-capability rule that fires only when its producers
ran — and is reported as *blocked*, not clean, when they did not.

## Phase 2d — Expert-scoped capabilities (MCP) 🚧

**Goal.** Make it impossible to hand an MCP tool to every expert by registering it globally.

*(Added after review asked whether enabling MCP "for everything" would let different experts corrupt
each other inside the server. It would: an MCP session carries a session id, cursors and negotiated
state, so a shared session means expert B's call runs on expert A's negotiated results and silently
misses rows behind A's half-consumed cursor. This holds regardless of how many people use the
platform — the risk is the stateful external process you installed, not another operator. The answer
is a scope, not a convention.)*

Delivered:

- `CapabilityScope` (`platform` / `expert`), supplied by `CapabilityKind` and declared by the handler;
  `CapabilityDescriptor` carries it, and the catalog reports `scope`, `expertScoped`,
  `globallyRunnable` and `authorisedExperts` so an expert-scoped tool is never presented as a global
  capability.
- `eap.mcp_server` (disabled and untrusted by default, tool allow-list) + `McpServerRegistry`, failing
  closed: an unreadable registry publishes no tools rather than all of them. Capability ids are
  namespaced `mcp.<server>.<tool>`.
- `expert_manifest.mcpTools` + `eap.expert_mcp_grant` (V8): the expert declares the tool, activation
  records the grant, disabling revokes it, and a node using an undeclared tool is rejected by
  `ExpertGraph.validate`.
- `CapabilityHandlerRegistry.resolveFor` — scope-aware run-time lookup, so an undeclared expert cannot
  reach the tool even though the handler is registered.
- `McpCallScope` + `McpSessionRegistry` — one session per `(execution, expert, server)`, refused
  outside an open execution or for another expert, closed in the executor's `finally`.
- Console + prototype: scope badges, the MCP server list, and an authorisation block in the expert
  editor; `capabilityScope.ts` holds the shared rules and is unit tested.

Remaining: an actual MCP client (`McpSessionRegistry.McpSession` is the seam), transport/credential
handling, and protocol-verified probing. Server registration itself is delivered in Phase 2e. Until a
client exists the catalog honestly reports zero MCP tools and any `mcpTools` declaration that no
registered server publishes is refused.

## Phase 2e — Capability management surfaces ✅

**Goal.** Turn the catalog from a read-only report into a catalog with a truthful management surface
for each kind — one sub-page per kind, each able to change exactly what that kind's nature permits.

*(Added after review of four observations: the catalog should be split into 总览 / 内置命令 / 本地 CLI /
MCP 工具; built-in commands appear to need hard-coded development; local CLI capabilities appear
unmanageable; and MCP tools appeared to have no management entry point at all. Three of the four were
real gaps. The fourth — that a capability's existence is code — is a fact worth stating rather than
hiding behind a button that cannot work.)*

Delivered:

- `CapabilityManagement` (`SETTINGS` / `CLI_CHANNEL` / `SERVER_REGISTRY` / `NONE`) declared per
  `CapabilityKind`, carrying `creation` (why a kind is not a form) and `manageable()`. The catalog
  reports per-kind `management`, `manageable`, `visible` and availability counts, and the console builds
  its sub-page tabs from that — never from a hard-coded list. A kind earns a page when it is manageable
  or already has capabilities, so HTTP (neither) gets no tab.
- `eap.capability_setting` + `CapabilitySettings` (V9): a platform-wide on/off switch per capability with
  an operator note. **Absent means enabled** (opt-out, unlike the fail-closed trust tables), and
  switching off a capability an *enabled* expert still runs is refused with the expert names; a
  *draft* reference does not block.
- `CapabilityAvailability.DISABLED` as a fourth state, distinct from `missing-binary` /
  `not-configured`: "switched off" is a decision, "broken" is a defect. `ExpertGraph.validateCapabilitySwitches`
  rejects a manifest referencing a disabled capability with *…已在平台停用…请在能力目录中重新启用* — never
  "未实现的能力" — and `CapabilityHandlerRegistry.resolveFor` refuses it at run time as well, so a stale
  grant cannot smuggle it back in.
- `eap.cli_channel` + `CliChannels` (V9): a per-machine binary override for a `cli` capability, resolved
  **live** via a `Supplier<String>` (no restart), reported with its `shipped` / `operator` source and
  resolved path. `LocalBinaries.resolve` accepts a bare name (probed on `PATH`) or an absolute path and
  executes nothing while rendering. `POST /api/capabilities/{name}/cli/probe` runs `<binary> --version`
  once, with a short timeout and redacted, truncated output — the only place a binary is run to answer a
  management question.
- **A local CLI is two levels, not one** (`eap.cli_program` + `eap.cli_operation`, V12): the program
  is registered **once** and owns the binary location and the program-level `--version` probe; its
  operations are separate rows, each a **fixed argument array** the expert references by capability id
  (`git-status` = `["status"]`). Git is therefore one program with two operations, not two unrelated
  commands each carrying its own copy of the binary path. An operator picks a shipped operation, or
  registers one; **operator-authored operations return a redacted exit code and stdout/stderr and
  publish no structural facts** — a process that happened to exit 0 has not thereby asserted anything a
  rule may trust. V12 migrates pre-existing per-operation overrides into the owning program
  (`DISTINCT ON`, preferring `git-status`) and deletes the old rows; the legacy capability-level
  endpoints forward to the program rather than keeping a second source of truth. Deleting a program is
  refused while an **enabled** expert references one of its operations, and deleting the last manual
  operation removes the manual program with it.
- `McpServerService` + `/api/mcp-servers` CRUD: register / edit / enable / trust / allow-list / delete /
  probe. Ids are validated **at the source** against the same segment shape `ExpertGraph` requires of
  `mcp.<server>.<tool>`, transports are limited to `stdio` / `http` / `sse`, credentials in an endpoint
  are refused, and deletion is refused while an enabled expert holds a grant on one of the server's
  tools. The probe reports `verified: false`, because there is no protocol client yet.
- Console (`features/capability/CapabilityManager.vue`) + prototype: four sub-pages, per-capability enable/disable + note,
  a CLI page with binary override / reset / probe, an MCP page with a registration form and per-server
  management, and an explicit statement on the overview and command pages that **新增能力一律需要改代码**.
  `CapabilityManagementController.requireRegistered` returns a 404 explaining the same thing for any
  write aimed at an unregistered capability.

**Exit criteria (met):** switching off an in-use capability names the experts that block it and a draft
does not; a disabled capability is rejected with a "disabled" message, not a "missing" one, and does not
resolve at run time; every kind declares a management entry point; an empty-but-manageable kind is
visible while HTTP is not; a CLI override changes the resolved binary and its source, an illegal binary
value is refused, and probing a missing binary executes nothing; an MCP server id / tool / transport /
credentialed endpoint is refused; a registered server defaults to disabled and untrusted; deletion is
blocked while an enabled expert still holds the grant; and a tool published by a registered server
appears in the catalog.

**Exit criteria (to extend):** an MCP client, so a probe can report `verified: true` and a published
tool can actually run; optional extra CLI arguments (deliberately not exposed yet, because they widen
the argument-injection surface); and an operation history entry for switch and override changes.

## Phase 3 — Independent validator and task state machine ⬜

**Goal.** Only the platform may declare a task `completed`, and only with evidence it produced
itself.

Deliverables:

1. `Validator` that reads the VCS diff independently, rebuilds and reruns tests, and rejects
   out-of-scope changes.
2. Explicit task state machine (`planned → running → expert-review → validating → completed |
   replanning | awaiting-user | escalated`) persisted with the task.
3. API: `GET /api/tasks/{id}` returns the full evidence timeline; `POST /api/tasks/{id}/supplements`
   appends user context and creates a new plan revision.

**Exit criteria:** a task with a dirty build cannot reach `completed`; a validator failure produces a
`replanning` state with the failed evidence attached; no agent claim alone flips the state.

## Phase 4 — Frontend product console 🚧

**Goal.** Replace the debug-style screen with a real console: three-column workspace, task/evidence
timeline, results browser, expert studio, and a **rule library** where packs can be read, edited and
dry-run.

Delivered so far: high-fidelity HTML prototype (`docs/prototype/console.html`) that fixes the
information architecture and pins down the *interaction* contract — every control changes visible state
or explains why it cannot, and every action either names the real endpoint it would call or says it is
client-side. The Vue app is aligned to it on every slice except one: the shell with a page-scoped
inspector, the results browser and pipeline routing block, the **rule editor** (inline
severity/evidence/advice editing, add/remove, 复制为自定义 for a shipped pack, local mirror of the
backend checks plus the real `POST /api/rule-packs/validate`, dry-run against the draft), the
**draft-based expert editor** with a manifest generated from the same state as the canvas, the **finding
actions** (复制建议 / 查看候选改写 / 标记忽略), the **supplement composer** (appended, never
replacing), the shell's 刷新 / 工作空间 / status bar, the four-page capability catalog with its
management surfaces (Phase 2e, now including the two-level CLI program/operation registry),
knowledge-base container CRUD with scoped search, database CRUD, expert create/validate/activate, and the
task timeline.

**The shell is grouped, not flat (2026-10-15).** The rail used to be eight peers, five of which were
configuration, and the landing page was a dashboard. It is now two groups — 工作 (分析工作台) and
设置 (专家定义, 规则库, 知识库, 数据库资料, 能力目录, 桌面外壳) — and the operator lands on the work
surface. 专家定义、规则库、知识库、数据库资料 and 能力目录 are application-level capability
configuration: they describe one environment and do not vary by workspace, so presenting them as peers of
分析工作台 would say that reconfiguring the tool and running an analysis are the same kind of action.
The 概览 page is gone as a destination; its four numbers moved into a status strip at the top of the
workbench with their provenance line intact.

**任务 is part of the workbench, not a second work entry (2026-10-15, same day).** Merging the two groups
still left the work half looking like a backend: a lone form on the workbench and a lone table on the task
page. An analysis and its evidence are two halves of one thing, so the workbench became a **studio** —
left = this workspace's task list, middle = the selected task's stream (request → execution record →
findings/report; a local-CLI task states plainly that it yields no structured findings), bottom = the
composer that starts the next analysis. 顶栏「运行分析」与底部「开始分析」仍是同一个动作。

Two supporting changes made those numbers honest rather than decorative:

- `eap.task.model_enhancement` records which route each run took (`unverified-observation` / `skipped` /
  `unavailable`, `NULL` = never reached the judgement stage), and `GET /api/stats?windowDays=7` returns
  `null` rather than `0` until at least one run has recorded a route. The workbench status strip and the
  status bar's 确定性覆盖 read that one value, so 「还没有运行过」 can never be printed as 「0%」.
- every destructive action goes through `@eap/ui` `ConfirmBox`, which names the impact and keeps the confirm
  button in place — disabled, with the reason beside it — when the backend refuses.
  `apps/web/src/tests/destructive.test.ts` asserts both, including that `window.confirm` appears nowhere in
  the console source.

Still prototype-only: the **desktop shell page** — delivery-target switch, local workspace picker,
backend connection settings and shell permissions with an operation history. `docs/desktop-spec.md`
describes the contract; `apps/desktop` itself is still ⬜ because a shell is an Electron main process,
not a page, and `electron` is not yet a dependency of the workspace.

**Exit criteria:** the console renders live observations, the SQL findings with severity, the
knowledge citations, the model-advisor routing block and the independent-validation state; narrow
screens collapse to the same navigation order.

**Historical verification snapshot (2026-10-15).** These numbers describe that earlier checkout,
not the current baseline. The current backend summary is 190 total / 186 passed / 4 conditional
skips; commands come from [the development guide](../agent-development-guide.md). The external
verify-console.js script below is not a repository test entry and is retained only as a historical
test record, not an executable acceptance requirement.

| Gate | Historical command | Historical result |
|---|---|---|
| Backend tests | `mvn -pl eap-runtime -am test` | 110 tests, 0 failures, 2 skipped (DB probe) |
| Frontend tests | `vp test run` | 47 tests, 9 files |
| Frontend lint | `vp lint` | 0 warnings, 0 errors (49 files, 102 rules) |
| Frontend build | `vp build` | clean, 136 modules |
| Prototype contract | `node verify-console.js docs/prototype/console.html` | 498 assertions, 0 failed |
| Runtime boot | `mvn -pl eap-runtime spring-boot:run` | `Started EapApplication` (~4s), `/api/health` → `ok` |

## Phase 5 — Master / supervisor and supplements ⬜

**Goal.** Aggregate evidence, judge against acceptance criteria, and pause safely when context is
missing.

Deliverables: `Master` decision layer; conflict and scope detection; `awaiting-user` with
append-only supplements; replan that reuses valid evidence and invalidates affected conclusions.

**Exit criteria:** state-machine tests cover complete / fail / escalate / awaiting-user / replan
paths.

## Phase 6 — External coding agent adapters (partial; independent acceptance pending)

**Goal.** Escalate to an external coding agent only when deterministic capabilities cannot complete
the task.

The current code already has AgentAdapter / CodexAdapter and the P1-A/B execution foundation.
Do not create another CodingAgentProvider registry from this old phase label. Codex file-delegation
acceptance is still incomplete; other adapters and routing through independent P1-D validation remain
planned. Spring AI is the generic model/tool-calling base, not this external-agent layer.

**Exit criteria:** provider output never reaches `completed` without independent validation.

## Phase 7 — Capability plugin SPI ✅

**Goal.** Register new deterministic capabilities without editing the executor.

Delivered: `CapabilityHandler` + `CapabilityHandlerRegistry`. The executor resolves a node's
capability by name from the registry and no longer contains any per-capability logic. Capabilities are
declared once in `ExpertGraph.CAPABILITIES` and served by `GET /api/experts/catalog`; a test asserts
the declared vocabulary and the registered handlers are identical. Phase 2c extends this: each handler
also declares its kind, descriptor and availability, and is served by `GET /api/capabilities`. Phase 2d
adds the scope: a handler that declares `kind() = MCP` gets expert-scoped resolution and per-execution
session isolation with no further work. Phase 2e adds the management surface: a handler also inherits
its kind's management entry point — enable/disable and a note for every kind, plus a live binary
override for `cli` — while *creating* a capability remains exactly one `@Component` plus one
declaration, and the console says so.

**Exit criteria (met):** a new capability is one `@Component` plus one declaration; nothing in
`ExpertExecutionService` changes.

## Phase 8 — Expert authoring SDK and editor ⬜

**Goal.** Author experts as typed code that compiles to a validated manifest, and edit rule packs in
the console.

Deliverables: `@eap/expert-sdk` (exists as a package skeleton) with `expert validate`, `expert
preview`, `expert test`; a schema-backed editor with manifest preview, validation errors and version
diff; a rule pack editor built on `POST /api/rule-packs/dry-run` and `GET /api/rule-packs/vocabulary`,
so a rule can be authored and previewed against real SQL before publishing.

**Exit criteria:** the SDK compiles to the same manifest the editor loads, and the backend remains
the sole authority for validation.

## Phase 8b — Migrate remaining hard-coded judgement ⬜

**Goal.** Finish the job started in Phase 2b.

Deliverables: the remaining `SqlMetadataInspector` advice strings moved into rule packs (its schema
and index facts already exist, and `rules/sql-snapshot-evidence.json` already judges them — what is
left is deleting the duplicated Java advice); `DeterministicTaskPlanner`'s keyword routing moved to
configuration; content-addressed rule pack revisions.

**Exit criteria:** no Chinese message string and no severity literal remains in `src/main/java` for
domain advice; both are replaceable by editing configuration.

## Phase 9 — Desktop delivery ⬜

**Goal.** Ship the same console as a desktop app behind a replaceable shell.

Deliverables: `DesktopPlatform` contract; Electron adapter with the configured renderer posture
(`nodeIntegration: false` / `contextIsolation: true` / `sandbox: true`) and a preload bridge that
exposes named functions only; scoped workspace selection; signed installers. See
[desktop-spec.md](../desktop-spec.md).

**Exit criteria:** identical task/evidence semantics on web and desktop; no shell or Node REPL
reachable from the renderer, and no direct `electron` / `fs` / `child_process` import in the renderer
bundle.

## Phase 10 — Optional vector retrieval ⬜

**Goal.** Add semantic retrieval **only if** full-text search proves insufficient.

Delivered-then-reverted: V1 shipped a pgvector schema; V5 removed mandatory embeddings. Reintroduce
deliberately, with an explicit embedding version, migration and re-index policy — never by silently
changing a column dimension. See [environment.md](../environment.md).

**Exit criteria:** a documented retrieval-quality comparison shows vector search beats full-text for
the target corpus, with an immutable versioning guarantee.
<!-- record:end docs/roadmap.md -->

---

## 整理前完整台账快照

以下台账仅为82aa504历史记录，现行版本见[规划状态](../planning-status.md)。

<!-- record:start docs/decisions/planning-completion-tracker-2026-11-01.md -->
# 完整规划接续台账

依据：v1.6 当前 §0B 产品合同、§0A 技术边界及后续决策；旧双入口/Builder 第六入口、市场、全量重建调度器不是本轮隐式要求。用户要求继续开发完整规划，并在每阶段验证通过后自动提交推送；持续排除 application.yml，保持现有本机服务。

本表跟踪完整范围，不因局部阶段完成把其他项关闭。`实现通过`仅限列明能力，用户人工接受、供应商与平台验收不能由代理或 Mock 替代。

## 历史文档同步基线与最新交付

最新后端模块拆分已提交推送`8e020d5`，干净verify 652项、0失败/错误、6条件跳过。前端Comments 1–10与图标首片纳入本轮独立交付，父任务及最终审查均574项、类型/边界/构建通过；页面验证按各决策记录，不冒充用户最终接受。以下2b0fe26是先前文档同步快照，不是当前HEAD。

代码基线 `main / 2b0fe26`，Skill首片已提交推送。本次是独立文档同步，不修改实现或配置、不重跑业务/浏览器测试。最新阶段全量：前端92文件/525项通过，后端647项（0失败/错误、6条件跳过），类型/边界/构建通过；历史阶段各自的测试数字不相加、不冒充本次结果。

已关闭的是各个最小实现切片，不是整个资源阶段或产品验收。证据索引：[界面与后端纠偏](architecture-history.md#implementation-review)、[源码交付](delivery-history.md#board-source-delivery)、[PREBOUND](delivery-history.md#code-task-prebinding)、[专家知识](resource-history.md#expert-knowledge-chat)、[Skill文本](resource-history.md#skill-text-import)。

| 工作项 | 当前状态与证据 | 下一验收关口 |
|---|---|---|
| UI-01/02 桌面外壳与工作面 | 已有五入口、分组/会话、文件树和分面；媒体对照追加欢迎卡容器适配、专家/设置显式返回，四视口及Work草稿返回实测通过，最终审查见[记录](frontend-history.md#reference-ui-review) | 全页面×尺寸/焦点/错误状态复核；真实系统缩放与用户接受 |
| UI-03 本地服务身份 | 本机绑定和只读能力已有验证 | Electron目录选择与打包环境复核；不把分组标签当权限 |
| 统一图标 | `@eap/ui` Icon/name入口与内部本地Lucide资源包已实现，首批工作台/Tag/Tree迁移；全量574项、类型/边界/构建、真实浅深主题及最终独立审查通过，见[记录](frontend-history.md#frontend-icons) | 其余管理页面/历史演示字符按语义迁移，不将领域SVG/正文标点机械替换；不是全仓清零 |
| UI-04 Code/Work | 共用会话和选择保存 | 实际办公任务执行，不只角色指引 |
| SC-01/02 场景 | 配置、设计、版本、准备已分面 | 真实交付及依赖授权闭环；用户副本持久化缺口按代码复核 |
| CP-01/02/03 输入与策略 | 目标/模式/审批分别建模，未接通模式禁用；媒体对照修正知识/Skill常驻堆叠，＋入口/紧凑引用/弹窗说明，四视口发送可达，见[记录](frontend-history.md#reference-ui-review) | 规划/Agent真实执行；禁止用标签替代策略；不以局部布局通过代替全体验接受 |
| MD-01 模型连接 | 凭据/目录/白名单/强度和明确失败已有实现 | 真实供应商能力按显式授权测试，不自动付费探测 |
| EX-01 专家 | 指引/版本/资源可见，现有DAG保留；单专家授权知识→Chat接线、撤权/旧记忆隔离及实库范围回归已通过，见 expert-knowledge-chat-2026-11-01.md | 完整配置角色/其余资源及真实供应商效果仍待；不执行DAG或自动获得工具权限 |
| PB-01 原型编辑 | Grapes工程+语义Schema、8类映射、保存重开/预览 | 对目标页面需要的状态/动作/组件逐项补映射；未知阻塞 |
| PB-02 生成基线 | 单目标完整有界源码、原型及生成前Task/revision快照已落地；生成期间变化/额外目标拒绝，PREBOUND关联已交付（69892f3）；见 code-generation-baseline-2026-11-01.md、code-task-prebinding-2026-11-01.md | 真实供应商自身改页验收、多文件组件图约束及快照保留期仍后续 |
| PB-03 受控应用 | 持久单文件候选、意图/读回、未知保护、Task→workspace互锁及POST_HOC/PREBOUND交付归因已通过实库/回归；见 code-proposal-application-2026-11-01.md、code-task-prebinding-2026-11-01.md | 未知人工核对、真实模型自身改页和完整交付；不宣称OS事务CAS、Git Run创作代码或会话重启恢复 |
| PB-04/RK-5 独立验证 | **实现通过，04edef5已推送**。前端295通过，后端400通过6跳过，真实三项退出0；V9/V10 | 验证覆盖仅当前frontend；不是源码实现归因或人工验收 |
| 源码交付证据与人工决定 | **EXTERNAL_MANUAL 切片实现及联调通过**，见 board-source-delivery-2026-11-01.md | 实际样例完成采集/同源验证/接受/过期拒绝/拒绝回待处理/刷新；不是平台自动开发或用户最终接受 |
| Chat应用→交付关联 | POST_HOC（544b8f9）与后续PREBOUND（69892f3）已通过实库协议、前后端回归及独立复核；旧无绑定记录不升级归因 | POST_HOC不证明生成时任务归因；PREBOUND仍不证明真实供应商改页/用户产品验收 |
| 生成前任务绑定 | PREBOUND单目标任务/原型快照、应用领取互锁、交付归因已通过实库协议与独立复核；前端398项、后端569项（6跳过），见 code-task-prebinding-2026-11-01.md | 生成前绑定不等于真实供应商已改页；实际模型交付及用户验收仍待，不自动完成整体PB/RK |
| RK-1～4/6 看板准备与只读Run | 已实现持久任务、revision/幂等、只读Run、原型快照、审阅 | 接入真实实现Run后复核状态/失败/并发；不放开任意拖done |
| CT-01 生命周期 | 记录回放、重启未知阻塞已有 | 按实际需要补取消/未知人工核对；跨重启进程接管不是首闭环前置 |
| RV-01 证据工作面 | 摘要/源文件/Diff/终端按会话，Run按次选择；源码交付与测试接受/拒绝决定已有刷新回放 | EAP自身改页完整证据、SQL实际任务证据及用户接受；不重复开发已有决定回放 |
| Skill | 文本上传/粘贴+显式文本资源、不可变版本、CAS启停/回退、按需预览与Chat精确引用首片已实现；安全/保存恢复缺陷修复后父任务前端525项、后端647项（6跳过）、实库/浏览器及独立复核通过；见 skill-text-import-2026-11-01.md | 目录/仓库导入延期；不执行脚本或授予工具权限，不支持通用mock YAML解析；真实供应商效果与用户最终验收待定 |
| MCP | 已有登记、授权/会话隔离底座，不代表真实协议 | Spring AI官方MCP initialize/list/call及拒绝/超时/隔离验收；未完成 |
| Knowledge/SQL/CLI | 保留既有确定性实现与管理 | 检索更新删除/来源与专家范围，SQL真实任务，CLI生命周期回归；不扩第二套执行器 |
| Workspace Plugin | 编译期可信Host已使用 | 按具体贡献缺口扩展，不改变固定五入口、不开放第三方任意JS |
| 桌面与安装器 | Electron45 preload壳、bootstrap检测脚手架 | Windows sidecar、一体启动/停止、迁移失败/恢复、包验证；签名需要用户凭据及发行决定 |
| Mock契约与总体质量 | 单UI/DTO，未实现接口诚实失败 | 每阶段同步mock；持续类型/测试/构建/boundaries和真实浏览器，不以Mock证明业务通过 |
| 最终验收 | **未完成** | EAP自身实际改页、完整证据链、用户交互接受；已验证/跳过/外部阻塞分别列明 |
| 后端runtime拆分 | 五模块依赖方向落地，runtime主源码194→4；干净verify 652项0失败/错误6跳过、最终独立复核通过，迁移未改，见[记录](architecture-history.md#backend-runtime-modules) | IDEA重导入Maven与实际本机启动核对；不宣称业务新增或模型闭环完成 |

## 已完成切片与后续顺序

CP-03用户标注Comment 1已做限定调整：模型/发送成组靠右，缺模型提示独立下置，356px控件区及四视口验证通过；前端全量556项，详见[记录](frontend-history.md#reference-ui-review)。不关闭规划/Agent执行或总体体验关口。

| 已交付切片 | 提交 | 保留边界 |
|---|---|---|
| 工作面分离与执行安全纠偏 | `1f38cd8` | 不等于全部视口和用户体验接受 |
| Run独立验证 | `04edef5` | 当前验证覆盖frontend，检查成功不自动完成任务 |
| 源码交付与测试人工决定 | `a63d27e` / `ca3b0a2` | EXTERNAL_MANUAL样例接受不是用户产品接受 |
| 生成前基线与持久单文件应用 | `f6aed04` / `f614272` | 非多文件事务；未知结果仍阻塞 |
| POST_HOC与PREBOUND关联 | `544b8f9` / `69892f3` | 只读Git Run不是实现执行器；真实供应商闭环仍待 |
| 单专家授权知识到Chat | `c9d23a7` | 不执行DAG，不开放其他资源与工具 |
| Skill文本导入/版本/Chat引用 | `2b0fe26` | 不支持目录导入、脚本执行或任意资源组合 |

后续只安排剩余关口，不从头重复上述切片：

1. **工程交付验收线**：用户确认目标页面、设计、允许范围和真实供应商/Agent调用后，复用PREBOUND与现有应用/验证/决定链走一次EAP自身改页；授权未具备时保持待验收，不伪造模型结果。
2. **资源能力线（当前未完成阶段）**：评估并接通Spring AI官方MCP协议，验证initialize/list/call及拒绝/超时/隔离；规划/Agent、Work执行分别设最小合同。Skill目录/仓库导入按用户决定延期，场景资源整合和更多专家资源不因文本首片完成而关闭。
3. **桌面产品线**：基于既有Electron/preload与bootstrap补Windows sidecar、一体启停、迁移失败处理及包验证；签名凭据与发行决定需用户提供/确认，不重建桌面壳。
4. **总体质量与接受**：持续全页面真实系统缩放/焦点/错误矩阵、SQL/CLI剩余业务回归、其他mock合同复核和构建包体积评估；最终由用户逐项接受。资源和桌面不必成为单页面交付的前置。

各阶段提交仅包含该阶段文件，提交前独立审查和实测，推送后回读远端SHA。阶段失败或外部验收未达成时保留未完成状态，不创建空提交。

## 提交前规划同步门禁

每次功能提交前同步主方案对应进度/验收条目、本台账及相关decision，不能只在主方案顶部追加阶段日志。已完成的子能力从“下一步”中移除，剩余范围具体列出；历史证据保留日期并明确非当前状态。代码实现、测试通过、浏览器验证、用户接受与已推送分别记录。审查未通过的阶段不得标完成。提交前检查暂存文档与本次代码范围一致，未同步或互相矛盾则暂停提交。
<!-- record:end docs/decisions/planning-completion-tracker-2026-11-01.md -->


<a id="planning-before-workbench-consolidation"></a>
## 2026-11-09 统一整理前的台账快照

来源：`docs/planning-status.md`，实现基线 `2c7e87b`。以下原文含尚未同步的旧“最新”数字和“未授权推送”描述，仅保留历史证据；当前状态以现行台账为准。

# 规划状态与验收台账

依据：v1.6 当前 §0B 产品合同、§0A 技术边界及后续决策；旧双入口/Builder 第六入口、市场、全量重建调度器不是隐式要求。2026-11-05技术路线整理后，用户报告模型故障并确认Responses协议，追加限定协议修复；2026-11-08按用户授权继续Responses工具和真实SQL整链，详见模块组合第十四轮；其他未授权新技术切片仍仅规划。本轮用户明确授权阶段性本地提交，未授权推送。application.yml仅纳入经校验内容不变的宿主路径迁移，不纳入本地配置变更或凭据。

本表跟踪完整范围，不因局部阶段完成把其他项关闭。`实现通过`仅限列明能力，用户人工接受、供应商与平台验收不能由代理或 Mock 替代。

## 当前基线与完成口径

2026-11-08阶段收束基线：`1aecc1a`；本次提交覆盖十四轮模块/Agent接续，详情见[阶段收束](../decisions/backend-module-composition.md#stage-checkpoint)。安全/事件/MCP和单类归属调整见[评审实施](architecture-history.md#backend-review-hardening)；本次后端验证单独记录，不复用下方历史前端或门控证据。

保留历史快照：`main / fdcda56`；本轮并行PL-01显式只读Task列表依赖检查、CT-01 SSE分帧/终态/缓冲边界。父任务完整前端130文件752项通过（`--maxWorkers=2`），类型、架构（含边界）、构建通过；大chunk、Node localStorage及既有网络保护诊断保留。指定`desktop_preview`/`drive_preview`真机5173点击local-eap只读检查获得Task列表可用/来源/时间；mock5174检查标记模拟，聊天发送成功清草稿。不把Task查询升级为Run/全服务健康，不把模拟流升级为真实供应商验收。`application.yml`不读取、不修改、不提交；未重启服务、未调用真实模型、未迁移数据。

本台账只维护当前状态与下一关口；阶段原文和历史测试数字归[主题记录总览](README.md)。不因局部切片通过关闭资源阶段、桌面发行或用户产品验收。

此前测试/文档整理已完成父任务验证及独立审查：后端647项、0失败/错误、6条件跳过；前端97文件/572项、类型/边界/构建通过。删除的是5次继承重复执行与2项无效模式重复，保留核心回归；覆盖去向见[维护记录](validation-history.md#development-guide-snapshots)。文档已按主题归并完整记录，裸引用修复后的定向复核通过，纳入本轮交付；不改变下列业务验收关口。

| 工作项 | 当前状态与证据 | 下一验收关口 |
|---|---|---|
| UI-01/02 桌面外壳与工作面 | 已有五入口、分组/会话、文件树和分面；媒体对照追加欢迎卡容器适配、专家/设置显式返回，四视口及Work草稿返回实测通过，最终审查见[记录](frontend-history.md#reference-ui-review) | 全页面×尺寸/焦点/错误状态复核；真实系统缩放与用户接受 |
| UI-03 本地服务身份 | 本机绑定和只读能力已有验证 | Electron目录选择与打包环境复核；不把分组标签当权限 |
| 统一图标 | `@eap/ui` Icon/name入口与内部本地Lucide资源包已实现，首批工作台/Tag/Tree迁移；全量574项、类型/边界/构建、真实浅深主题及最终独立审查通过，见[记录](frontend-history.md#frontend-icons) | 其余管理页面/历史演示字符按语义迁移，不将领域SVG/正文标点机械替换；不是全仓清零 |
| UI-04 Code/Work | 共用会话和选择保存 | 实际办公任务执行，不只角色指引 |
| SC-01/02 场景 | 配置、设计、版本、准备已分面；CAS 保存/删除；save 失败后远端核对；**本轮**：mock「模拟保存断连」落盘+502→`unknown`（`:5174` 已验） | 用户产品接受仍待；真实交付及依赖授权闭环；不把可变配置revision当不可变设计版本 |
| CP-01/02/03 输入与策略 | 目标/模式/审批分别建模，未接通模式禁用；媒体对照修正知识/Skill常驻堆叠，＋入口/紧凑引用/弹窗说明，四视口发送可达，见[记录](frontend-history.md#reference-ui-review) | 规划/Agent真实执行；禁止用标签替代策略；不以局部布局通过代替全体验接受 |
| MD-01 模型连接 | 凭据/目录/白名单/强度已有；追加普通API显式wireApi及Responses文本/代码提案，协议变更revision/重绑定、Git拒绝和前端/mock合同已实现并通过离线回归，见[决定](../decisions/model-catalog-and-chat-selection.md#普通api连接的协议选择2026-11-05实现与离线回归通过实网待验) | 原连接Responses真实文本与SQL Agent两轮工具、审批写入已验；其他网关/模型/推理档位、Responses Chat Git/账户计划工具及用户最终接受仍待 |
| EX-01 专家 | 专家父子导航、独立三栏编辑、SQL Agent行为编辑、任务摘要/按需侧面板及终态停止轮询已交付（当前前端134文件/786项；既有原生125%只读UI为前轮快照；用户接受待定），见[界面记录](../decisions/expert-workspace-navigation.md)；指引/版本/资源可见，现有DAG保留；专业行为id/version持久绑定已接通管理与执行，新增SQL自主Agent及跨JVM检查点恢复/自动后台调度/单SQL候选审批UI（Fake模型/实库、组件及真实Chromium视觉/模拟交互验证；普通API Responses工具支持及真实两轮取证→候选→页面审批→写入读回→重启终态已验；复杂SQL三类限定样例已验（CTE知识引用、NULL反连接候选、缺证据追问），首轮CTE超时保留；完整作用域分析、生产SQL效果、原生150%及用户接受仍待）；单专家授权知识→Chat接线、撤权/旧记忆隔离及实库范围回归已通过，见 [阶段记录](resource-history.md#expert-knowledge-chat) | 独立三栏EditorWorkbench已接入固定流程/SQL Agent/GrapesJS，134文件786项与浏览器7组技术验证通过；原生150%及用户接受仍待；完整配置角色/其余资源及真实供应商效果仍待；不执行DAG或自动获得工具权限 |
| PB-01 原型编辑 | Grapes工程+语义Schema、8类映射、保存重开/预览 | 已复用EditorWorkbench三栏壳，GrapesJS/Schema保持原型域所有，真实浏览器编辑/本地保存重开/交互预览与未知映射阻止通过；对目标页面需要的状态/动作/组件逐项补映射；未知阻塞 |
| PB-02 生成基线 | 单目标完整有界源码、原型及生成前Task/revision快照已落地；生成期间变化/额外目标拒绝，PREBOUND关联已交付（69892f3）；见 [阶段记录](delivery-history.md#code-generation-baseline)、[阶段记录](delivery-history.md#code-task-prebinding) | 真实供应商自身改页验收、多文件组件图约束及快照保留期仍后续 |
| PB-03 受控应用 | 持久单文件候选、意图/读回、未知保护、Task→workspace互锁及POST_HOC/PREBOUND交付归因已通过实库/回归；见 [阶段记录](delivery-history.md#code-proposal-application)、[阶段记录](delivery-history.md#code-task-prebinding) | 未知人工核对、真实模型自身改页和完整交付；不宣称OS事务CAS、Git Run创作代码或会话重启恢复 |
| PB-04/RK-5 独立验证 | **实现通过，04edef5已推送**。前端295通过，后端400通过6跳过，真实三项退出0；V9/V10 | 验证覆盖仅当前frontend；不是源码实现归因或人工验收 |
| 源码交付证据与人工决定 | **EXTERNAL_MANUAL 切片实现及联调通过**，见 [阶段记录](delivery-history.md#board-source-delivery) | 实际样例完成采集/同源验证/接受/过期拒绝/拒绝回待处理/刷新；不是平台自动开发或用户最终接受 |
| Chat应用→交付关联 | POST_HOC（544b8f9）与后续PREBOUND（69892f3）已通过实库协议、前后端回归及独立复核；旧无绑定记录不升级归因 | POST_HOC不证明生成时任务归因；PREBOUND仍不证明真实供应商改页/用户产品验收 |
| 生成前任务绑定 | PREBOUND单目标任务/原型快照、应用领取互锁、交付归因已通过实库协议与独立复核；前端398项、后端569项（6跳过），见 [阶段记录](delivery-history.md#code-task-prebinding) | 生成前绑定不等于真实供应商已改页；实际模型交付及用户验收仍待，不自动完成整体PB/RK |
| RK-1～4/6 看板准备与只读Run | 已实现持久任务、revision/幂等、只读Run、原型快照、审阅 | 接入真实实现Run后复核状态/失败/并发；不放开任意拖done |
| CT-01 生命周期 | SSE/cancel/快照/同ID重连保留；2026-11-08应用线程执行、断线继续、Spring AI/Responses流、完整行脱敏、事件预算/终态/并发修复，见评审记录 | 真实供应商及用户接受待验；日志仍进程内，持久回放/跨重启接管未实现 |
| RV-01 证据工作面 | 摘要/源文件/Diff/终端按会话，Run按次选择；源码交付与测试接受/拒绝决定已有刷新回放 | EAP自身改页完整证据、SQL实际任务证据及用户接受；不重复开发已有决定回放 |
| Skill | 文本上传/粘贴+显式文本资源、不可变版本、CAS启停/回退、按需预览与Chat精确引用首片已实现；安全/保存恢复缺陷修复后父任务前端525项、后端647项（6跳过）、实库/浏览器及独立复核通过；见 [阶段记录](resource-history.md#skill-text-import) | 目录/仓库导入延期；不执行脚本或授予工具权限，不支持通用mock YAML解析；真实供应商效果与用户最终验收待定 |
| MCP-01 / P0 | 保留四传输/矩阵/续传；2026-11-08增加固定read_graph Handler、持久专家grant、精确服务器匹配、环境白名单、有界IO/进程树清理；真实子进程协议夹具覆盖 | 官方memory包通过Expert入口的本机实网验收、常驻GET listen待验；运行时npx离线且拒绝自动安装 |
| Knowledge/SQL/CLI | 保留既有确定性实现与管理；本轮真实本地知识导入/搜索/授权预览/无授权403/删除一致性通过，检索无模型；复杂SQL修复parse.partial与NOT IN NULL规则，四组合成结果验证通过，见[知识与本地执行边界](../decisions/knowledge-local-execution.md) | 文档正文版本更新、检索质量评测、完整SQL作用域/生产数据与性能验证、CLI生命周期回归；不扩第二套执行器 |
| PL-01 / P0 看板插件首片 | **部分交付**：board启停/回滚/sticky保留；本轮新增项目ID有界显式GET Task列表检查，未检查/检查中/可用/失败未知与来源时间分开；真机/mock已验，不改Task/Run | 仅Task列表读取通过；Run/全服务健康、在途停用完整矩阵与用户接受仍待；外部安装器延期 |
| PL-02 / P1 设计器插件 | GrapesJS/Schema/版本已有；尚未按通用贡献机制迁移 | PL-01后复用现有设计器、版本和核心API，验证停用不丢草稿/版本；外部任意JS安装延期 |
| SC-03 / P1 场景组合 | 原型到代码已有独立配置/设计/准备/交付切片，不是单个插件 | 依赖PL-01，设计器迁移与PL-02协调；声明所需插件/服务/资源、缺依赖不可用；应用不安装/授权/发送；SC-01 保存断连浏览器接受仍独立 |
| CE-01 / P0 上下文工程 | **部分交付**：预算观测/用量 UI/超限；历史未计量；派生清空；`COMPRESSION_NOT_ENABLED`；**本轮**：备注 Badge 呈现（`:5174` 已验） | 真实 token/压缩策略、ChatMemory 精确计量、用户产品接受；不记录敏感正文 |
| KR-01 / P0 检索基线 | **部分交付**：fixture + `KEYWORD_PROBE`/`POSTGRES_FTS`；延迟观测；实库对照；排序质量样本；`productionSampleCases`；**本轮**：对照测口令回退 `EAP_DB_PASSWORD`/`SPRING_DATASOURCE_PASSWORD`（不写入仓库） | 实库开启 `EAP_RUN_BOARD_PERSISTENCE`+口令跑 FTS 排序对照；不足证据前不启 KR-02 |
| MEM-01 / P1 记忆首片 | **部分交付**：分层+PUT/UI+本地持久+Task/Run；对抗失效；约束/事实；失效 Feedback/空态纠偏；**本轮**：失效下 sticky 清空仍保留诚实提示（`:5174` 已验） | sticky 清空仍不可取消；用户产品接受仍待；自动长期抽取延期 |
| FS-01 / P0 目录与临时资源 | **部分交付**：data-layout + migrationReadiness + kind/byteSize + inventory + candidateCounts；**本轮**：`inventory.byKind`（`:5174`/`:5173` 已验）；`physicalMigration=false` | 旧数据物理迁移/读回/失败恢复、限额/回收与 UNKNOWN 保留仍待批准后实施 |
| TM-01 / P1 受管工具 | CLI程序/固定操作可登记和配置路径；依赖PATH/指定文件，无安装版本管理 | 依赖FS-01，选择一个可信便携工具或venv；锁版本/校验/安装回滚、实际调用/在途保护；保留系统引用，不静默或全局安装 |
| TD-01 / P0 自动发现与绑定 | **部分交付**：可信定义汇总 + 绑定快照 + 显式探测 + 持久化 + 清除缓存 + probeCache/`newestProbedAt`；**本轮**：绑定状态计数摘要（`:5174`/`:5173` 已验） | 真实本机 git 重启验收与用户接受仍待；更多依赖绑定仍待；不整盘扫描 |
| TC-01 / P0 工具调用与呈现 | **部分交付**：git-status、失败摘要和长 stdout；本轮 Abort/客户端超时判 UNKNOWN，停止等待不报进程取消；mock/真机已验，服务端499独立 | 真实拒绝/超时/进程终止与用户接受仍待；无服务端取消确认协议，不开放任意 Capability 执行口 |
| TC-02 / P1 前端实例能力 | **部分交付**：GrapesJS 当前实例草稿/选中状态人工读取；实例/文档/revision与24,000字符上限、过期/离页清空；真机浏览器已验，多实例/冲突/关闭/超限离线回归 | 用户产品接受；远程断线/反向Agent调用另评审，不依赖隐藏组件后台存活，不把本地草稿当Java保存版本 |
| KR-02 / FW-01 条件后续 | 当前保留Spring AI，未采用向量增强或LangChain4j迁移 | KR-01证明检索不足再评估增强；明确协作需求/可复现框架阻碍后独立批准同条件对照，记录兼容/正确性/成本/取消与迁移回归；不长期双循环 |
| 桌面与安装器 | Electron45 preload壳、bootstrap检测脚手架 | Windows sidecar、一体启动/停止、迁移失败/恢复、包验证；签名需要用户凭据及发行决定 |
| Mock契约与总体质量 | 网络保护持续启用；前轮34项回归已修；本轮SSE CRLF/分块/多行data、畸形拒绝、每帧1Mi UTF-16上限与final及时释放；最新130文件752项、类型/架构/build通过 | 真实模型/后台恢复/全页面视口与用户接受不随之关闭；单帧限额不是总内存/总流上限 |
| 最终验收 | **未完成** | EAP自身实际改页、完整证据链、用户交互接受；已验证/跳过/外部阻塞分别列明 |
| 后端runtime拆分 | 已由applications/full接替；唯一Boot主类与配置/迁移资源保留；旧五模块记录为历史 | 当前IDEA原配置/full宿主启动已验证；跨环境部署与实库业务接受独立，不由离线Bean图替代 |
| BM-01～07 后端模块组合 | **十四轮边界调整，部分关口保留**：[实施范围](../decisions/backend-module-composition.md#implementation)；最新复杂SQL修复后verify为32项目成功、913项（839通过/74跳过/0失败或错误；提交前前端全量131文件/763项通过，类型/架构/构建通过；含4项真实PostgreSQL绑定回归、4项Agent持久化/授权回归及23项续跑/审批回归），core/local/Chat最小组合、显式完整产品装配；知识上下文去workflow依赖、管理事务下沉服务、Expert执行分析/资源端口化、CLI通道下沉local/存储失败拒绝、codegen原型查询端口及证据存储/DTO归属修正（已去workflow依赖）、专家定义领域查询分离、固定流程定义/调度独立、能力输入按领域分离及按专家选择/固定执行策略、行为id/version持久绑定（目录/保存/启用/执行/历史观察，含本地PostgreSQL回归）、SQL自主Agent工具循环及授权/短事务/取消、持久检查点/租约/预算、自动后台调度与单SQL候选审批UI；IDEA原配置启动与产品注册表调试已通过（重复Bean旧进程根因未复现） | EA-02固定流程/能力输入分离、策略解析及专业行为版本持久绑定已实现；EA-03 SQL只读Agent后端已实现且Fake模型/实库通过；SQL行为编辑器及专家分层UI已交付；其他行为编辑器、真实供应商效果、通用应用输入及旧DAG长事务、EA-04已实现SQL Agent检查点显式续跑/文件候选审批/UNKNOWN不重放，显式后台任务自动恢复与审批UI已实现，Chromium视觉/模拟审批交互已验，真实Responses文本请求与Windows原生100%/125%技术检查已验，普通API Responses工具及真实两轮取证/候选/审批/文件读回/重启终态已验；复杂SQL效果/其他系统缩放/用户接受、通用写工具及UNKNOWN人工处置仍待，产品目录/CLI程序登记审批及Chat产品用例/工具可选贡献继续解耦（workflow整体仍依赖SQL/MCP）；领域schema、跨环境服务和实库业务/官方MCP/供应商独立验收 |

## 已完成切片与后续顺序

CP-03用户标注Comment 1已做限定调整：模型/发送成组靠右，缺模型提示独立下置，356px控件区及四视口验证通过；前端全量556项，详见[记录](frontend-history.md#reference-ui-review)。不关闭规划/Agent执行或总体体验关口。

| 已交付切片 | 提交 | 保留边界 |
|---|---|---|
| 工作面分离与执行安全纠偏 | `1f38cd8` | 不等于全部视口和用户体验接受 |
| Run独立验证 | `04edef5` | 当前验证覆盖frontend，检查成功不自动完成任务 |
| 源码交付与测试人工决定 | `a63d27e` / `ca3b0a2` | EXTERNAL_MANUAL样例接受不是用户产品接受 |
| 生成前基线与持久单文件应用 | `f6aed04` / `f614272` | 非多文件事务；未知结果仍阻塞 |
| POST_HOC与PREBOUND关联 | `544b8f9` / `69892f3` | 只读Git Run不是实现执行器；真实供应商闭环仍待 |
| 单专家授权知识到Chat | `c9d23a7` | 不执行DAG，不开放其他资源与工具 |
| Skill文本导入/版本/Chat引用 | `2b0fe26` | 不支持目录导入、脚本执行或任意资源组合 |

后续只安排剩余关口，不从头重复上述切片；技术细节与退出矩阵见[技术路线决定](../decisions/agent-runtime-evolution.md#7-分阶段切片与退出门禁)：

1. **工程交付验收线**：用户确认目标页面、设计、允许范围和真实供应商/Agent调用后，复用PREBOUND与现有应用/验证/决定链走一次EAP自身改页；授权未具备时保持待验收，不伪造模型结果。
2. **上下文与资源能力线**：CE-01（含 mock 预算展示/超限）/KR-01(含 FTS+延迟观测+本机实库对照+排序质量样本)/MCP-01(stdio+官方矩阵含 memory/`read_graph`+http+legacy SSE+Streamable-HTTP+生产白名单+GET 续传)/MEM-01（含对抗失效与约束/事实 UI）离线首片已落地；下一步生产检索样本或继续追加已验证官方包（含门禁实跑 memory）。规划/Agent、Work仍各设最小合同；A2A、MCP Server、自动长期记忆及Skill目录导入不隐式启动。
3. **工具与本地环境线**：TD-01与TC-01继续现有Git；TC-01停止等待现判UNKNOWN，服务端进程终止协议/真实失败矩阵仍待。TC-02实例人工读取首片已做，下一关是用户交互接受与后续Host协议评审，非重复开发读取按钮；反向Agent调用另批。发现不等于授权，Java执行不需前端复制实现。FS-01物理迁移仍待批准，再做TM-01一个受管工具；sidecar/包验证独立，签名另需凭据。
4. **可信插件与场景线**：PL-01已追加显式Task列表只读检查，Run/整体健康、用户接受与在途停用矩阵仍独立；再做PL-02设计器与SC-03场景依赖，保留版本/候选/产物和五入口合同。外部安装器/市场/第三方隔离延期；不先建空SDK。
5. **总体质量与接受**：本轮34项前端回归已收敛，不重复安排该欠账；继续全页面真实系统缩放/焦点/错误矩阵、SQL/CLI剩余业务回归、其他mock合同复核和构建包体积评估。真实供应商流式/取消与自身改页需明确授权，最终由用户逐项接受。

技术补强不是自身单页面交付的全套前置；已有UNKNOWN缺陷不得因路线调整关闭。负责人、具体工具/服务器、物理目录/保留期限与实施时间尚待切片确认。KR-02/FW-01由证据触发，不预设换栈。

获得提交/推送授权后，各阶段提交仅包含该阶段文件，提交前独立审查和实测，推送后回读远端SHA。阶段失败或外部验收未达成时保留未完成状态，不创建空提交。

## 提交前规划同步门禁

历史快照（1e13b66之前一轮）：当时34项失败保留为欠账；本轮已按当前SSE合同修复而非删除断言。旧HEAD归档副本复现同名34项，另有环境失败25项，不作等价完整环境；当时包管理器改写共享junction已恢复。当前不再运行该副本、不共享可写依赖目录。原失败记录保留，不覆盖上面的724项最新实测。

用户发现后端 `Invalid UUID string: c1`：确认为前端旧夹具漏网请求，不是正常会话故障。全量测试停止后补根 test setup，最终仅允许本worker创建的精确literal loopback地址+端口；拒绝localhost/DNS别名与wildcard扩权，禁同步XHR以阻断happy-dom隐式子进程。fetch/Axios/异步XHR在socket连接前拒绝未拥有目标，不改生产网络/UUID校验。7项隔离回归通过；后续 `EAP_TEST_NETWORK_BLOCKED` 是测试进程内拦截，不是8080响应。早期无限并发一轮649通过/56失败，含SkillManager超时级联；最终限并发673/34，SkillManager单独25通过，保留原始失败证据。保护不覆盖显式启动的外部子进程，不能视为OS沙箱；不再跑无保护基线。

历史快照提交`119391f`：当时用户明确要求提交并推送全部工作树改动，仅排除`application.yml`；此前用户自有`AiChatApplicationTest.java`格式调整一并纳入。此次为工程规范化及现有场景配置切片的快照提交，不关闭上表场景UNKNOWN保存/删除缺陷或产品验收。提交前最新复跑：前端104文件601项、根check（378格式/294 lint零问题）、类型与构建通过；后端661项0失败/错误68条件跳过（未开启实库/Mission门禁），不冒充此前实库11项的重跑。vsh审查反例修复及限定独立复核通过，详见[工具决定](../decisions/frontend-tooling-boundaries.md)。

每次功能提交前同步主方案对应进度/验收条目、本台账及相关decision，不能只在主方案顶部追加阶段日志。已完成的子能力从“下一步”中移除，剩余范围具体列出；历史证据保留日期并明确非当前状态。代码实现、测试通过、浏览器验证、用户接受与已推送分别记录。审查未通过的阶段不得标完成。提交前检查暂存文档与本次代码范围一致，未同步或互相矛盾则暂停提交。
