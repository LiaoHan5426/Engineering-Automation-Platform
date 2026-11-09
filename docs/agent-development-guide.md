# Agent development and acceptance guide

Root and module AGENTS files contain rules; this guide contains acceptance evidence. User-approved scope takes priority over older roadmap examples. Do not interpret target architecture as implemented code.

## Task routing

| Task | First deliverable | Completion gate |
|---|---|---|
| Prototype | interaction/state contract and clickable fixtures | user approves interactions; simulations clearly labeled |
| Architecture | source-backed audit, alternatives, staged plan | explicit approval before large implementation |
| Feature | approved contract and smallest end-to-end slice | relevant build/tests plus actual business behavior |
| Defect | reproduction and affected boundary | cause corrected, relevant regression passes |
| Frontend UI / shared module | placement decision per [frontend-ui-shared-module-boundaries](decisions/frontend-ui-shared-module-boundaries.md): search `@eap/ui` → classify L0–L5 → implement or register staging | no parallel Button/Dialog shells; boundaries + targeted tests; doc/§3.2 updated when adding a package or shared category |

Frontend agents must follow `frontend/AGENTS.md` UI placement rules on every UI change. New primitives land in `@eap/ui` first; reusable composites and planned modules (`hooks`, `effects`, `layout`, `toggle`, `plugin`) use the decision doc—do not invent ad-hoc shared packages.

## Validation commands

Run from repository root with the RTK prefix required by local instructions. Backend: `rtk proxy mvn -f backend/pom.xml test`. Frontend: `rtk proxy pnpm --dir frontend typecheck`, `rtk proxy pnpm --dir frontend test run`, `rtk proxy pnpm --dir frontend build`, `rtk proxy pnpm --dir frontend check:boundaries`. These are derived from reactor POMs and frontend/package.json; package scripts may fail if tools/dependencies are absent. Commands listed here are not passing results.

## Backend module composition validation

The executable host is `backend/eap-applications/eap-full-application`; keep `com.lh.eap.EapApplication` as main class.
Use `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am clean verify` for the host closure.
For development, first install sibling artifacts through the reactor, then run only the full application goal;
do not run `spring-boot:run -am` across library modules. The Maven run goal explicitly uses `backend/` as
working directory, matching this checkout's existing `.eap` and `.eap-ai-artifacts` locations. For an installation
that previously used another directory, set `-Deap.run.working-directory=<original-absolute-directory>`; keep
the same IDEA/JAR working directory and external configuration/data locations. No data is moved. Reimport Maven and select the new host classpath in IDEA; live restart remains a separate check.
Stop the DevTools application before a reactor clean/rebuild, then restart it after BUILD SUCCESS.
Backend `.mvn/jvm.config` fixes Maven file/stdout/stderr encoding to UTF-8; an RTK encoding error
without BUILD SUCCESS and exit 0 is not build success. Do not enable Bean overriding to hide conflicts.
Current 32-project reactor evidence and remaining optional-composition gates are recorded in
[the composition decision](decisions/backend-module-composition.md#implementation).

## Current implementation and validation baseline

The latest committed implementation is `d7c1428` (bounded observed descendant identity evidence, pushed with user authorization). The current slice, authorized for commit and push, validates controlled UNKNOWN recovery through real HTTP/PostgreSQL/Vue and adds historical execution detail selection using the existing scoped GET; no production fault endpoint, migration or process takeover is introduced.
This user-authorized commit/push delivers the continuation that adds bounded read-only inspection of captured process identities and isolated real parent/child regression.
Human review is recorded separately from executor exit/cleanup proof; it never turns UNKNOWN into success or cancellation.
Use [the validation ledger](planning-status.md#validation-baseline) for the latest recorded checks and their limits.
The [backend record](records/backend-composition-history.md) preserves migration, real-provider and gated database evidence;
the [frontend record](records/frontend-history.md#expert-workspace-evolution) preserves editor/browser checks.
Documentation-only maintenance does not rerun or renew these acceptance results.

For local frontend development, enter `frontend`, run `vp i`, then `vpr dev` (the existing dev script).
The implementation-stage run used 12 workspaces and port5173. Do not equate a running dev server with acceptance.

## Business acceptance matrix

| Area | Required real evidence |
|---|---|
| CLI | registered program with success/failure operations; actual cwd/argv/exit/output; timeout and cancellation terminate descendants; unauthorized paths/arguments rejected; credentials redacted |
| MCP | real server initialize, tool discovery and authorized tool call; denial, protocol errors, timeout and separate execution/expert sessions; Fake handler tests insufficient |
| Skill | import and manifest validation, version/scope/dependency checks, activation, on-demand instructions reaching Agent, granted-tool execution, rollback |
| Knowledge | import/chunk/index, known-answer retrieval and source citation, update and delete consistency, unauthorized expert excluded; evaluate recall before vectors |
| Capability/Expert/Rule | registration conflict and disable checks; graph/producer dependencies; failed nodes and blocked rules visible; deterministic findings separated from model observations |
| Model/external Agent | actual configured invocation; unavailable/failure routes; bounded repository changes; independent diff/build/test verification |
| Plugin | registration, collisions, enable/disable and contribution disposal; configuration persists; multiple instances isolated; disabling preserves task/history |
| Mission | durable state transitions/events; backend continues without UI; pause/resume/cancel, finite retry, approval denial, restart recovery and independently verified artifacts |
| Builder | manual edit, save/reopen, Vue interactive preview and immutable versions; approved handoff selects repository/base/scope; safe code generation, diff/build/test and human acceptance |

Classify each capability as fully implemented and verified, implemented with defects, partial flow, configuration/mock only, or absent. Independently record verification status; do not label an untested implementation fully verified.

## Spring AI acceptance and test migration

Generic model transport, messages, tool calling and memory use Spring AI 2.0.2 (Boot 4.1.1); do not
add another Provider framework or tool loop. SQL's LlmProvider/Gateway remain compatibility and
business caching/fallback only. Model tests inject the public ChatModel interface through the shared
FakeChatModels fixture, never restore HTTP/JSON emulation to satisfy an old assertion. Preserve
deterministic rule hits, skip/enhance decisions, no-model and failed-model fallback, successful-result
conversion and cache isolation. Keep provider error codes observable without serializing exceptions.

Chat tools must retain request/server grants, canonical workspace checks and Capability switches;
test denial, result return, errors, isolated memory/evidence, framework call limits and timeout/cancel
classification. Existing real process cancellation tests remain required and distinct from simulated
model exceptions. A configured client is not a successful connection; no live paid model is invoked
by default tests. Preserve existing database/real-CLI/model test gates. Board preparation, controlled Run and prototype reference persistence use `EAP_RUN_BOARD_PERSISTENCE=true`; Mission Git acceptance uses `EAP_RUN_MISSION_GIT_ACCEPTANCE=true`. Both use an existing migrated local database and own/clean only their generated sample rows; they do not create/drop/reset databases. See [board preparation evidence](records/delivery-history.md#board-task-preparation), [controlled Run evidence](records/delivery-history.md#board-controlled-run) and [prototype reference evidence](records/delivery-history.md#board-prototype-link).

Historical cleanup starts with an exact path manifest and reference/ownership check. Preserve final
audit conclusions and evidence needed by current acceptance. Completed experiment directories may
be retired together once their conclusions are consolidated and references updated; an old execution
ID, hash or one-shot lock does not imply permanent retention. Keep active test gates and locks intact;
removing retired outputs never authorizes rerunning a paid model. Do not clear the entire audits/Temp
tree, Git metadata, global caches or ambiguous user files. Reproducible output belongs in build/Temp
directories, with successful-check logs removed by default and failures retained as needed.

## Test and documentation maintenance

- 前端根 Vitest setup 默认阻止访问非本 worker 创建的 TCP 目标（含 IDEA `:8080`、Vite `:5173/:5174` 与外网），仅放行测试自身监听的精确literal loopback地址+端口，localhost/DNS/wildcard不扩展授权；同步XHR直接拒绝，避免happy-dom隐式子进程绕过。传输测试使用 `server.listen(0, '127.0.0.1')` 并清理，不使用正在运行的开发服务、真实会话或模型。`EAP_TEST_NETWORK_BLOCKED` 是夹具漏网诊断，不应通过移除 guard 或放行真实后端来“修绿”；应补正确的请求 mock/测试自有服务。此防线不约束显式外部子进程，不是 OS 沙箱。

- Frontend tests belong in each package's root `__tests__/`, sibling to `src/`; engineering tools use `frontend/scripts/vsh/__tests__/`. Test-only fixtures, snapshots, browser QA configuration and compile-time contracts follow the same ownership. See [test layout](decisions/frontend-test-layout.md) for discovery, separate type-contract checks, lint/fmt and packaging gates. Never move type contracts out of the compiler graph or production mocks into test-only directories.

- Remove an obsolete test only after tracing the assertion to current production behavior and naming its retained or replacement coverage. A gated test is not obsolete merely because this machine skips it. Keep authorization, concurrency, UNKNOWN, transactions, real-process and persistence regressions.
- Share setup only where contracts genuinely match. Fixtures must not contain inherited test methods: subclassing a test class reruns its tests and inflates reports. Do not replace behavior tests with source-string or class-name guesses.
- Keep current work items in `planning-status.md`, a short sequence in `roadmap.md`, and complete dated evidence in topic-based `records/*-history.md`. Preserve source-to-section mappings, media and failure evidence; update Markdown links/anchors when retiring files. Dates belong in chapters, not new report filenames.

### 本轮整理记录（基线82aa504）

历史快照：以下命令、数量与独立审查属于82aa504接续阶段，不是当前验证基线。

| 范围 | 调整原因与覆盖去向 |
|---|---|
| 后端候选持久化 | `CodeTaskBindingPersistenceTest`继承测试类导致5项重复执行；抽出无@Test的`CodeProposalPersistenceFixture`。原5项持久候选测试正文不变，绑定专属6项保留，UNKNOWN/并发/事务/真实文件检查不删 |
| 后端装配 | 删除按参数包名前缀猜测可注入的断言，改由`CapabilityCatalogTest`真实Spring context refresh验证；全模块构造器扫描保留 |
| Mission历史断言 | 删除V1中不含`previous_mission`的源码字符串检查；任务创建/关联/状态/并发唯一冲突/DB失败及迁移保护保留 |
| 前端模式检查 | 删除仅切`workbench.preview`却未切真实服务模式的伪双来源测试及Welcome重复执行；有效页面断言合并保留；模式配置/隔离由serviceConfig、chatService、chatHttp测试覆盖 |
| 前端局部夹具 | 三个Chat集成测试共用启动状态/模型目录夹具；发送、失败及证据mock仍各自显式配置，原assertion保留 |
| 文档 | 24份阶段文件并入5个主题完整记录，日期台账改为`planning-status.md`；旧路线和台账完整保存在路线历史。主方案分离现行合同与完整历史，不删除设计参考素材 |

父任务本轮执行：双门控`mvn -f backend/pom.xml clean verify`、前端`test run/typecheck/check:boundaries/build`均通过。统计以本次调用日志为准：后端647项、0失败/错误、6条件跳过（原652减5次继承重复）；前端97文件/572项通过（原574减2项无效重复）。跳过的环境/权限门禁保留；大chunk和Node localStorage实验告警未掩盖。未改生产逻辑、已应用迁移或用户配置，未重启服务、未调用真实模型。本轮不重新宣称浏览器/用户体验验收。

## Consistency and delivery

历史快照（82aa504接续整理）：文档独立复核确认27份来源全文（24份阶段记录、旧路线/台账、完整主方案）归一化后内容一致，27个验收ID及核心合同保留。9处旧裸引用已修正并通过补充复核；本地Markdown链接与锚点校验通过。docs内Markdown从59份整理为43份；当前主方案1685→446行、路线图750→31行，原文均可在主题历史追溯，不以删除证据换取简短。

本轮测试精简的独立只读审查通过：原候选持久化测试体、迁出的初始化/工厂/清理、任务绑定断言，以及Welcome断言均程序化比对保留。原preview循环确实不消费实际服务来源。Spring context refresh只证明该测试装配成功，不是完整运行时启动或setter行为验收；审查读取已有日志，不冒充另一次全量执行。父任务链式命令退出0确认类型/边界/构建通过。

Check links/paths and scripts when editing guidance. Module files specialize root guidance without duplicating its workflow. Target Plugin/Mission/Builder requirements do not authorize implementation. Record baseline dirty files and never include their changes as your work. Deliver file reasons, reuse/removal, commands/results/skips, risks, next plan and required decisions. Missing credentials, dependencies or protocol client are explicit unverified blockers, never passes.

## 2026-11-09 文档统一整理

实现基线 `2c7e87b`，开始时工作树干净，HEAD与origin/main一致。本次只改文档：统一入口、当前基线与剩余关口；将后端逐轮实施迁入主题记录、专家演进归入前端历史、旧台账全文归档。决策保留有效合同与旧显式锚点入口，已完成项从下一步移除。主方案、台账、路线与架构同步，修正旧“未授权推送”和模型使用范围的过度概括。

维护口径：最新阶段验证只在台账集中维护，其他入口引用；历史数字按原日期保留。特别区分前轮实库门控与本轮跳过、真实供应商与fixture写请求、旧界面原生125%与新工作台浏览器比例覆盖。用户最终接受仍未完成。

本次检查通过：Python本地链接/锚点核对覆盖51份Markdown、676个链接；归档正文与HEAD原稿按相对链接重定位后逐字比对，后端328行、专家135行、台账92行完整保留；原台账工作项标签全部保留。18个改动文件均为Markdown文档、UTF-8无BOM；`git -c core.autocrlf=false diff --check`通过。不重跑应用构建/业务测试、不重新调用模型或改变数据，既有结果不标成本次实测。


## Controlled tool UNKNOWN acceptance

The opt-in `ToolUnknownReviewAcceptanceTest` requires `EAP_RUN_TOOL_UNKNOWN_REVIEW=true` and the already approved local persistence gate `EAP_RUN_BOARD_PERSISTENCE=true`, the existing DB credential environment, `EAP_PLAYWRIGHT_MODULE` (local playwright-core) and `EAP_CHROMIUM`. From the repository root run:

`rtk proxy mvn -B -ntp -f backend/pom.xml -pl :eap-full-application -am '-Dtest=ToolUnknownReviewAcceptanceTest' '-Dsurefire.failIfNoSpecifiedTests=false' test`

Stop the DevTools application before compilation and restore its original launch parameters afterwards. The test owns a UUID schema, temporary repository, isolated socket hosts, Vite at loopback port 5187, and Java parent/child processes. Actual production service/controller/store/UI are reused; only the test executor substitutes one CLI command for controlled crash injection. No product mock responses or model calls are used. Cleanup checks the exact owned identities and schema and compares application execution-record digests unchanged. Artifacts live in `backend/target/tool-unknown-review-<uuid>`; meaningful selected evidence is retained under the frontend browser artifacts directory. This controlled test is separate from actual Git failure and human product acceptance; normal offline runs skip it.
