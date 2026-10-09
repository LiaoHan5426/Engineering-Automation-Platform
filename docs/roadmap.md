# Roadmap

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
- `LlmGateway` + `OpenAiCompatibleProvider`: LRU cache, endpoint policy (loopback by default, remote
  needs `EAP_LLM_ALLOW_REMOTE=true` + HTTPS), fail-closed.
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
each other inside the server. It would: an MCP session carries a session id, cursors and an
authenticated identity, so a shared session means expert B's call runs in expert A's state and audit
context. The answer is a scope, not a convention.)*

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
- `McpServerService` + `/api/mcp-servers` CRUD: register / edit / enable / trust / allow-list / delete /
  probe. Ids are validated **at the source** against the same segment shape `ExpertGraph` requires of
  `mcp.<server>.<tool>`, transports are limited to `stdio` / `http` / `sse`, credentials in an endpoint
  are refused, and deletion is refused while an enabled expert holds a grant on one of the server's
  tools. The probe reports `verified: false`, because there is no protocol client yet.
- Console (`CapabilityManager.vue`) + prototype: four sub-pages, per-capability enable/disable + note,
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
the argument-injection surface); and an audit trail for switch and override changes.

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
client-side. The Vue app is aligned to it for: the eight-route shell with a page-scoped inspector, the
results browser and pipeline routing block, read-only rule browsing with the dry-run and fact
vocabulary, the four-page capability catalog with its management surfaces (Phase 2e), knowledge-base
container CRUD with scoped search, database CRUD, expert create/validate/activate, and the task timeline.

Still prototype-only (tracked per slice in `docs/frontend-prototype.md`): inline rule editing,
draft-based expert editing with a generated manifest, the finding actions (复制建议 / 查看候选改写 /
标记忽略), and the supplement composer.

**Exit criteria:** the console renders live observations, the SQL findings with severity, the
knowledge citations, the model-advisor routing block and the independent-validation state; `vp build`
passes; narrow screens collapse to the same navigation order.

## Phase 5 — Master / supervisor and supplements ⬜

**Goal.** Aggregate evidence, judge against acceptance criteria, and pause safely when context is
missing.

Deliverables: `Master` decision layer; conflict and scope detection; `awaiting-user` with
append-only supplements; replan that reuses valid evidence and invalidates affected conclusions.

**Exit criteria:** state-machine tests cover complete / fail / escalate / awaiting-user / replan
paths.

## Phase 6 — CodingAgentProvider adapters ⬜

**Goal.** Escalate to an external coding agent only when deterministic capabilities cannot complete
the task.

Deliverables: `CodingAgentProvider` SPI with Codex / Claude / Hermes adapters behind policy gates;
provider output routed back through the validator.

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

Deliverables: `DesktopPlatform` contract; Tauri 2 adapter; scoped workspace selection; signed
installers. See [desktop-spec.md](desktop-spec.md).

**Exit criteria:** identical task/evidence semantics on web and desktop; no shell or Node REPL
exposed to the renderer.

## Phase 10 — Optional vector retrieval ⬜

**Goal.** Add semantic retrieval **only if** full-text search proves insufficient.

Delivered-then-reverted: V1 shipped a pgvector schema; V5 removed mandatory embeddings. Reintroduce
deliberately, with an explicit embedding version, migration and re-index policy — never by silently
changing a column dimension. See [environment.md](environment.md).

**Exit criteria:** a documented retrieval-quality comparison shows vector search beats full-text for
the target corpus, with an immutable versioning guarantee.
