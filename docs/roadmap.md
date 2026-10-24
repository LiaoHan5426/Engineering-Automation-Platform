# Roadmap

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
| Spring AI | 2.0.2 / Boot 4.1.1 integration implemented; ChatClient, official tool loop, memory and read-only Git tested offline; no live provider acceptance |
| SQL model enhancement | Deterministic rules/cache/fallback retained; production transport uses the Spring AI compatibility bridge; old connection settings require migration |
| Test consolidation / generated cleanup | Legacy tests migrated plus shared Fake ChatModel; 190 total / 186 passed / 4 unchanged skips; initial 82-file cleanup followed by removal of 302 historical files and all 24 audit subdirectories; final conclusions and inventory retained |
| Documentation | Single docs/README.md entry; old UI reviews and per-round Codex reports consolidated; 14 superseded documents/prototype files retired, valid decisions and active console prototype retained |
| Codex P1-C | Adapter, model communication, process and Artifact evidence implemented; file delegation was denied, acceptance remains incomplete; investigation paused |
| Chat workbench | S1 wired on 2026-10-24: `GET /api/ai/status`, `POST /api/ai/conversations`, `POST /api/ai/conversations/{id}/messages`, and a `#chat` page. In-memory sessions, synchronous requests, no reliable cancel, no live provider acceptance. The landing page remains the SQL workbench |
| Workspace plugins | 原型已实现，自测通过，待用户交互验收。仅 P0/P1，见 [S2 plugin ADR](decisions/s2-workspace-plugin-contract.md)。交接记录已实现。持久任务壳已完成。只读 git-status 单步执行已实现 |
| Mission | 持久任务壳已完成。只读 git-status 单步执行已实现：启动与创建分开，Git 命令只由能力入口构造，取消终态需要进程退出证据。未知执行会阻塞下一次启动。人工解除机制尚未实现，不能算可恢复 Mission。见 [Mission single-step contract](decisions/mission-single-step-execution-contract.md)。没有调度、审批流、自动续跑或独立验证 |
| Builder | GrapesJS editor, semantic schema and repository handoff are not implemented. The P0/P1 prototype has a manual Vue preview bound to the browser draft, plus a separate version preview. A saved version is immutable only because the application inserts and has no update path. V17 has no update trigger; V18 only corrects the table comments and says they are not a database guard. Content is redacted before it is stored and hashed. One delivery sheet cites that version. Preview responses are dropped when they no longer match the open version. Repository, baseline and Agent stay unbound. Historical hashes stay stored as written; new saves use Jackson. That is not a claim that every historical payload can be recomputed, and there is no hash-check API or algorithm registry. `PrototypeDeliveryAcceptanceTest` runs only when `EAP_RUN_CLI_INTEGRATION=true` plus explicit `EAP_DB_URL`, `EAP_DB_USERNAME` and `EAP_DB_PASSWORD`, and then creates, migrates and drops its own database. Status: 实现及离线检查通过，隔离数据库验收、最终页面冒烟未执行. Acceptance is not complete. Isolated database acceptance and the final page smoke are separate todos and do not gate each other. Without an explicitly authorized environment the database test stays skipped and daily credentials are not read. The page smoke was not executed. No container, database admin script, or test framework was added. `b3813a1` and `4d1cf0d` are already separate commits and are outside this slice |
| P1-D | Independent Diff/Build/Test validation remains unimplemented and separately gated |

Next: 只读 git-status 已收敛到共享运行时和单一 Git 入口。未知执行会阻塞，人工解除机制尚未实现，不能算可恢复 Mission。调度、审批流、自动续跑、独立验证和仓库写入仍未实现。见 [Mission single-step contract](decisions/mission-single-step-execution-contract.md)。
S1 is implemented; see [S1 Chat design](decisions/s1-chat-spring-ai-design.md). Its close-out on this worktree recorded
`mvn -f backend/pom.xml test` as 205 passed, 0 failed, 4 skipped, and `pnpm --dir frontend test run` as 51 passed.
That suite was not re-executed while writing this status note. The P0/P1 close-out on 2026-10-24 re-ran `pnpm --dir frontend test run` (12 files, 56 passed), `pnpm --dir frontend typecheck`, and `pnpm --dir frontend check:boundaries`. The backend suite was not re-run; the prototype does not change it. Build was verified in the implementation pass and was not repeated for this wording change. The P2 handoff close-out on 2026-10-24 re-ran `mvn -f backend/pom.xml test` (209 passed, 0 failed, 4 skipped), `pnpm --dir frontend test run` (13 files, 59 passed), and `pnpm --dir frontend build`. Live database checks are separate from those results. The mission-shell close-out on 2026-10-24 re-ran `mvn -f backend/pom.xml test` (216 passed, 0 failed, 4 skipped), `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (14 files, 61 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. Live database checks stay separate. The git-status execution slice on 2026-10-24 re-ran `mvn -f backend/pom.xml test` (231 passed, 0 failed, 4 skipped), `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (14 files, 61 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. Live database checks stay separate from that suite. The git entry close-out on 2026-10-24 applied only the proposed files onto `9692fa7` in an isolated checkout and re-ran `mvn -f backend/pom.xml test` with the committed POMs (237 passed, 0 failed, 4 skipped). The earlier workspace run of 241 included uncommitted POM edits and is not the commit proof. This commit still includes the git-status frontend files. Their checks were recorded with that slice on 2026-10-24: `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (14 files, 61 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. Those frontend checks were not re-run for this close-out. The builder version offline check recorded on 2026-10-24 is `mvn -f backend/pom.xml test` (245 tests, 0 failed, 5 skipped). `PrototypeDeliveryAcceptanceTest` is the additional skip because `EAP_RUN_CLI_INTEGRATION`, `EAP_DB_URL`, `EAP_DB_USERNAME` and `EAP_DB_PASSWORD` were unset, so that test did not connect or migrate. V18 was added after that suite; `SchemaAndWiringTest` was re-run and passed (5 tests). The same combination passed `pnpm --dir frontend typecheck`, `pnpm --dir frontend test run` (16 files, 67 passed), `pnpm --dir frontend check:boundaries`, and `pnpm --dir frontend build`. The daily service authorized root was not changed. That offline run was not repeated for this delivery note. `backend/eap-runtime/pom.xml` is already in `b3813a1`, and the expert-sdk formatting is already in `4d1cf0d`; neither belongs to the remaining 24-file slice, and the old exclusion wording is retired. Status: 实现及离线检查通过，隔离数据库验收、最终页面冒烟未执行. Acceptance is not complete. Isolated database acceptance and the final page smoke are separate todos and do not gate each other. Without an explicitly authorized environment the database test stays skipped and daily credentials are not read. A previous daily-database check does not replace the isolated run. The page smoke was not executed: no save, reopen, temporary click, close-and-reopen or second delivery sheet. No container, database admin script, or test framework was added. Mission core lifecycle must remain independent
of any board plugin. Builder repository delivery depends on Mission execution and independent P1-D
verification; Electron follows those paths. EAP owns grants, engineering tools, execution records and
Artifacts; Spring AI owns generic model/tool-calling infrastructure; Codex remains an independent
external agent adapter. No parallel Provider or Agent Runtime framework is planned.

See [Spring AI implementation](audits/spring-ai-integration-report.md) and
[consolidation and cleanup](audits/spring-ai-consolidation-report.md) for validation and migration details.

The roadmap is ordered so that each phase unlocks a **measurable** part of the value chain in
[pipeline.md](pipeline.md): first make the deterministic stage real, then make the model stage cheap
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
[expert-knowledge-rules.md](expert-knowledge-rules.md).)*

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
[expert-knowledge-rules.md](expert-knowledge-rules.md) §6).

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
skips; commands come from [the development guide](agent-development-guide.md). The external
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
[desktop-spec.md](desktop-spec.md).

**Exit criteria:** identical task/evidence semantics on web and desktop; no shell or Node REPL
reachable from the renderer, and no direct `electron` / `fs` / `child_process` import in the renderer
bundle.

## Phase 10 — Optional vector retrieval ⬜

**Goal.** Add semantic retrieval **only if** full-text search proves insufficient.

Delivered-then-reverted: V1 shipped a pgvector schema; V5 removed mandatory embeddings. Reintroduce
deliberately, with an explicit embedding version, migration and re-index policy — never by silently
changing a column dimension. See [environment.md](environment.md).

**Exit criteria:** a documented retrieval-quality comparison shows vector search beats full-text for
the target corpus, with an immutable versioning guarantee.
