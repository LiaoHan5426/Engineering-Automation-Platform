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

Run from repository root with the RTK prefix required by local instructions. Backend: `rtk proxy mvn -f backend/pom.xml test`. Frontend uses Vite+ per [frontend guidance](../frontend/AGENTS.md): `rtk proxy vp -C frontend run typecheck`, `rtk proxy vp -C frontend test run`, `rtk proxy vp -C frontend run check:architecture` (includes boundaries and cycles). For the Web production build, run `rtk proxy vp build` from `frontend/apps/web`; the root build failed in the [last implementation validation](records/validation-history.md#implementation-commit-validation), while the app-directory build passed. Do not report the root entry as repaired. These are execution entry points, not passing results.

Before resuming application work, check Java 25/JAVA_HOME, Maven, RTK, Vite+, workspace dependencies, and Python with ripgrep for the domain-contract script. The [2026-11-14 review](records/validation-history.md#development-readiness-review) records the initially missing tools, their subsequent user-authorized Linux installation, actual checks, and the remaining Windows-specific Junction test failure; it does not replace historical Windows acceptance. RTK was unavailable in that session, so the recorded executions used the underlying commands directly. Database/browser/provider checks are separately opt-in; inspect each test's gate before running it, and use only an explicitly authorized datasource.

## Backend module composition validation

The executable host is `backend/eap-applications/eap-full-application`; keep `com.lh.eap.EapApplication` as main class.
Use `rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am clean verify` for the host closure.
For development, first install sibling artifacts through the reactor, then run only the full application goal;
do not run `spring-boot:run -am` across library modules. The Maven run goal explicitly uses `backend/` as
working directory, matching this checkout's existing `.eap` and `.eap-ai-artifacts` locations. For an installation
that previously used another directory, set `-Deap.run.working-directory=<original-absolute-directory>`; keep
the same IDEA/JAR working directory and external configuration/data locations. No data is moved. Reimport Maven and select the new host classpath in IDEA; live restart remains a separate check.
Stop the DevTools application before a reactor clean/rebuild, then restart it after BUILD SUCCESS.
When an existing host must remain running, package a separate artifact without cleaning or replacing its JAR:
`rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am package -DskipTests -Deap.application.final-name=eap-full-application-review`.
This changes only the host artifact filename; it uses the same dependencies, Boot packaging and main class.
Use a fresh name if that review artifact is already running. A successful package does not prove startup or business acceptance.
Backend `.mvn/jvm.config` fixes Maven file/stdout/stderr encoding to UTF-8; an RTK encoding error
without BUILD SUCCESS and exit 0 is not build success. Do not enable Bean overriding to hide conflicts.
Current 32-project reactor evidence and remaining optional-composition gates are recorded in
[the composition decision](decisions/backend-module-composition.md#implementation).

## Current implementation and validation baseline

当前实现、最近验证及剩余关口统一见[规划台账](planning-status.md#validation-baseline)，各设计交付切片见[统一索引](records/design-delivery-index.md)。本指南仅维护可执行命令和验收要求，不维护第二份阶段进度。

2026-11-13 开发基线已将 V1～V37 合并为 `V1__initial_schema.sql`；现行 `CurrentContractTestSchema` 在 UUID 自有 schema 中执行该 V1，`DesignerLifecycleAcceptanceTest` 复用它。这不证明日常数据库已重置或常驻服务已升级。旧开发库使用新基线前须单独明确数据处置；后续变化采用增量迁移，不隐式 clean、repair 或 baseline。可选示例数据独立于 Flyway，见[环境说明](environment.md)。

历史提交、V30/V31实库迁移、PL-02旧隔离方式与测试数字已完整迁入[开发指南阶段快照](records/validation-history.md#development-guide-snapshots)。文档整理不续期旧验收结果；用户复核与技术ACCEPT分别记录。

本地前端开发进入 `frontend` 后运行 `vp i`、`vp dev`；独立Mock使用 `vp run dev:mock-server` 与 `vp run dev:mock`。启动成功不等于业务验收。

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

- Frontend tests belong in each package's root `__tests__/`, sibling to `src/`; engineering tools use `frontend/scripts/vsh/__tests__/`. Test-only fixtures, snapshots, browser QA configuration and compile-time contracts follow the same ownership. See [test layout](decisions/frontend-test-layout.md) for discovery, separate type-contract checks, lint/fmt and packaging gates. Never move type contracts out of the compiler graph. Development HTTP mocks belong to apps/backend-mock/src, with their tests in that package root __tests__; web production source must not import them.

- Remove an obsolete test only after tracing the assertion to current production behavior and naming its retained or replacement coverage. A gated test is not obsolete merely because this machine skips it. Keep authorization, concurrency, UNKNOWN, transactions, real-process and persistence regressions.
- Share setup only where contracts genuinely match. Fixtures must not contain inherited test methods: subclassing a test class reruns its tests and inflates reports. Do not replace behavior tests with source-string or class-name guesses.
- Keep current work items in `planning-status.md`, a short sequence in `roadmap.md`, and complete dated evidence in topic-based `records/*-history.md`. Preserve source-to-section mappings, media and failure evidence; update Markdown links/anchors when retiring files. Dates belong in chapters, not new report filenames.

## Consistency and delivery

修改指南时核对本地链接、锚点、脚本及当前调用方；历史整理与覆盖去向见[阶段快照](records/validation-history.md#development-guide-snapshots)。保留原有未提交修改，交付说明列明本次文件、原因、检查结果、未验证项及剩余关口。目标合同不构成启动实现或外部调用的指令。

## Controlled tool UNKNOWN acceptance

The opt-in `ToolUnknownReviewAcceptanceTest` requires `EAP_RUN_TOOL_UNKNOWN_REVIEW=true` and the already approved local persistence gate `EAP_RUN_BOARD_PERSISTENCE=true`, the existing DB credential environment, `EAP_PLAYWRIGHT_MODULE` (local playwright-core) and `EAP_CHROMIUM`. From the repository root run:

`rtk proxy mvn -B -ntp -f backend/pom.xml -pl :eap-full-application -am '-Dtest=ToolUnknownReviewAcceptanceTest' '-Dsurefire.failIfNoSpecifiedTests=false' test`

Stop the DevTools application before compilation and restore its original launch parameters afterwards. The test owns a UUID schema, temporary repository, isolated socket hosts, Vite at loopback port 5187, and Java parent/child processes. Actual production service/controller/store/UI are reused; only the test executor substitutes one CLI command for controlled crash injection. No product mock responses or model calls are used. Cleanup checks the exact owned identities and schema and compares application execution-record digests unchanged. Artifacts live in `backend/target/tool-unknown-review-<uuid>`; meaningful selected evidence is retained under the frontend browser artifacts directory. This controlled test is separate from actual Git failure and human product acceptance; normal offline runs skip it.


For the unchanged real-Git fault variant, also set `EAP_RUN_REAL_GIT_UNKNOWN=true`. Run the same class (both scenarios) or select `-Dtest=ToolUnknownReviewAcceptanceTest#realGitAbnormalExitWithoutDurableResultRequiresExplicitUnknownReview`. The real-Git mode preserves executable/argv/environment and uses only a test callback gate around actual execution. It stops the exact owned Git tree, crashes the isolated host before workflow receives its real failure result, then exercises UNKNOWN review through the production panel. An additional owned corrupt-index case verifies that a normally observed nonzero Git exit remains FAILED and that repair allows a new success. External OS audit identities are separate from product-captured evidence. Both variants default to skipped in the offline reactor.

For real diff recovery, additionally enable `EAP_RUN_REAL_GIT_DIFF_UNKNOWN=true` and select `-Dtest=ToolUnknownReviewAcceptanceTest#realGitDiffAbnormalExitAndRecoveryRequireScopedUnknownReview`, or run the entire class with all three scenario gates. The diff case stages a baseline, edits only the tracked working file, preserves a staged-only marker and an untracked marker, forces the exact Git diff tree to exit and crashes the owned host before workflow receives its result. Recovery checks require the unstaged tracked marker and exclusion of staged/untracked content; a corrupt-index FAILED case restores the exact original index bytes before retry. Each test uses its own schema/repository/hosts. This opt-in test is not product user acceptance.

## PREBOUND real page delivery follow-up

Current production migration is V34: V32 fixed task/prototype semantics, V33 persists selected companion sources and exact proposal counts, and V34 replaces the obsolete root-only Board delivery check. The following single-file figures are retained historical evidence. `PreboundSemanticDeliveryTest` is gated by EAP_RUN_SINGLE_CONTRACTS=true and EAP_RUN_BOARD_PERSISTENCE=true, runs V31 rejection then actual V32 in a UUID-owned schema, and verifies current prototype binding, durable application and exact bounded catalog. `BoardDeliveryControllerTest` covers read-only route scope. Production model and browser checks are separate: [commands, resource and acceptance limits](records/delivery-history.md#prebound-page-delivery). A real model call is not a fixture and must not be repeated to refresh metrics. The preserved result has one provider request and 145 files/897 tests from the application-owned independent verification, plus focused main-worktree checks.

## Persistent task source candidate recovery

BoardCodeProposalRecoveryTest (EAP_RUN_SINGLE_CONTRACTS=true and EAP_RUN_BOARD_PERSISTENCE=true) verifies real UUID-owned schema/service reconstruction without a Chat registry, exact task/workspace boundaries, apply/refuse and UNKNOWN interlocks. BoardCodeProposalControllerTest guards explicit action shape. Current production route is `/api/board/tasks/{taskId}/code-proposals`; read-only list/detail and explicit apply/refuse reuse the original CodeChangeService. Shared UI moved to apps/web/src/components without compatibility re-exports. New frontend focused checks cover 45 distinct cases; six restarted production browser groups and JDBC evidence are [recorded separately](records/delivery-history.md#board-code-recovery). No model or earlier full-suite replay.

## Component graph page delivery validation

The [bounded engineering Agent](decisions/chat-engineering-task-slice.md#bounded-engineering-agent) uses the same generation/proposal/apply path. Run `CodeSourceAgentTest` for its five focused behavior checks. `EngineeringAgentAcceptanceTest` is opt-in via `EAP_ENGINEERING_AGENT_CHROMIUM=true`, uses a UUID-owned PostgreSQL schema and temporary workspace, and drives the built production app through globally installed Playwright/Chromium. Build with `rtk proxy vp build` from `frontend/apps/web` first. The default model is an explicit Fake ChatModel at Spring AI's public boundary; real provider validation additionally requires `EAP_ENGINEERING_AGENT_REAL_MODEL=true` and an explicit `EAP_ENGINEERING_AGENT_CONNECTION_STORE` path. Never emit its credentials, reuse daily database state or repeat a real model call to refresh a screenshot. See [the separate provider and final layout evidence](planning-status.md#engineering-agent-validation). No Hermes dependency, arbitrary shell or automatic apply is involved.

Current input is one targetPath plus 0..7 componentPaths, with complete pre-model source snapshots (24KB/file, 48KB total). Exact ordered file sets, bounded static imports, root reachability and cycle rejection are mandatory. Snapshot JSON companionFiles is required; no legacy runtime fallback. The same durable apply path serves all sets, with all baselines/staging/readback and UNKNOWN interlocks; this is not an OS transaction or CAS.

ComponentTaskContextTest, ComponentGraphDeliveryTest and ComponentDeliveryConstraintTest are the focused regressions; the four-test, zero-skip result belongs to the historical component-delivery stage, not this review. At that stage, PostgreSQL CHECK validation compared V33 (rejects three files) with V34 (accepts three, rejects wrong-task/nine-file sets). The current migration baseline is a single V1, including that corrected contract; see [backend guidance](../backend/AGENTS.md) and the [authorized reset record](records/validation-history.md#flyway-fresh-baseline). Do not replay removed V33/V34 as current setup steps. Enable EAP_RUN_SINGLE_CONTRACTS=true only against an explicitly authorized datasource; UUID-owned schemas are dropped, databases are not created/dropped. Existing unrelated suites are reused.

The real three-file candidate used one configured provider request. Production application-owned independent verification ran once: typecheck, 147 files/906 tests, build, process cleanup and matching source snapshots. A backend-only V34 fix resumed the same candidate/Run/verification without repeating those checks. Read [commands and failure record](records/delivery-history.md#component-page-delivery) and [opt-in browser setup](../frontend/apps/web/__tests__/browser/README.md#component-page-delivery). Main-worktree format/CSS normalization has separate hashes and focused checks; do not replace original application evidence or report technical ACCEPT as user acceptance.

## Domain statuses and localized platform errors

Keep one finite-state definition per owning domain/function; reuse existing enums and derive frontend unions from domain constants. Do not merge CLI, persistent tool execution, source application, independent verification, Board columns or expert run states merely because some wire strings match. Machine codes and localized labels/messages have separate responsibilities. Do not add business branches that search human error text.

The [implemented current contract](decisions/domain-status-and-backend-i18n.md) separates machine `code` from localized `detail`. ProblemResponses is the single HTTP error builder; request guards and local handlers retain allowed context. Language selection is deterministic zh-CN/en-US. Axios and SSE use runtimeLanguage; worker locale is captured at request entry and snapshots render in the viewer language without changing journal evidence. Mock uses the same fields, remains explicitly simulated, and has no old-detail fallback.

Run `rtk proxy python scripts/verify-domain-contracts.py` when editing a wire vocabulary or error catalog. It checks Java/TypeScript state parity, unique codes, paired UTF-8 resource keys and catalog coverage. DomainWireAndMessagesTest and PlatformProblemContractTest additionally cover strict states, safe errors, locale selection, arguments, filters and asynchronous SSE. SQL binds domain-derived state values; historical migrations stay frozen. DTO String wire fields require strict enum validation. Mission UNKNOWN remains an observation projection, never a stored terminal substitute.

The [historical validation record](records/delivery-history.md#domain-status-i18n) distinguishes ordinary regression, opt-in database cases, full HTTP/Chromium evidence, deterministic provider failure and unverified scenarios. At that stage V35 added the missing companion_sources comment without rewriting V33/V34; the subsequent authorized V1 consolidation includes this contract. Use the current migration directory rather than those removed version filenames. The browser harness explicitly loads a test entry with ordinary same-package imports; product sources do not import test hooks. Earlier real model/component-delivery evidence is retained independently.
