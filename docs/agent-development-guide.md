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
by default tests. Preserve existing database/real-CLI/model test gates. Board preparation and controlled Run persistence use `EAP_RUN_BOARD_PERSISTENCE=true`; Mission Git acceptance uses `EAP_RUN_MISSION_GIT_ACCEPTANCE=true`. Both use an existing migrated local database and own/clean only their generated sample rows; they do not create/drop/reset databases. See [board preparation evidence](decisions/board-task-preparation-2026-10-31.md) and [controlled Run evidence](decisions/board-controlled-run-2026-10-31.md).

Historical cleanup starts with an exact path manifest and reference/ownership check. Preserve final
audit conclusions and evidence needed by current acceptance. Completed experiment directories may
be retired together once their conclusions are consolidated and references updated; an old execution
ID, hash or one-shot lock does not imply permanent retention. Keep active test gates and locks intact;
removing retired outputs never authorizes rerunning a paid model. Do not clear the entire audits/Temp
tree, Git metadata, global caches or ambiguous user files. Reproducible output belongs in build/Temp
directories, with successful-check logs removed by default and failures retained as needed.

## Consistency and delivery

Check links/paths and scripts when editing guidance. Module files specialize root guidance without duplicating its workflow. Target Plugin/Mission/Builder requirements do not authorize implementation. Record baseline dirty files and never include their changes as your work. Deliver file reasons, reuse/removal, commands/results/skips, risks, next plan and required decisions. Missing credentials, dependencies or protocol client are explicit unverified blockers, never passes.
