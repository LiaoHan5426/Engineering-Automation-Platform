# Agent development and acceptance guide

Root and module AGENTS files contain rules; this guide contains acceptance evidence. User-approved scope takes priority over older roadmap examples. Do not interpret target architecture as implemented code.

## Task routing

| Task | First deliverable | Completion gate |
|---|---|---|
| Prototype | interaction/state contract and clickable fixtures | user approves interactions; simulations clearly labeled |
| Architecture | source-backed audit, alternatives, staged plan | explicit approval before large implementation |
| Feature | approved contract and smallest end-to-end slice | relevant build/tests plus actual business behavior |
| Defect | reproduction and affected boundary | cause corrected, relevant regression passes |

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

## Consistency and delivery

Check links/paths and scripts when editing guidance. Module files specialize root guidance without duplicating its workflow. Target Plugin/Mission/Builder requirements do not authorize implementation. Record baseline dirty files and never include their changes as your work. Deliver file reasons, reuse/removal, commands/results/skips, risks, next plan and required decisions. Missing credentials, dependencies or protocol client are explicit unverified blockers, never passes.
