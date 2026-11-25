# Decision: py-backend thin MVP (FastAPI + SQLite Chat host)

**Date:** 2026-11-23  
**Status:** Accepted for the thin MVP slice  
**Supersedes (component mapping only):** “Python = installer/bootstrap only” in [`docs/running-context.md`](../running-context.md) §组件职责 — **does not** supersede A1 product placement (single-operator, loopback, keys on machine, no multi-tenant, deterministic-first).

## Context

Development pace on the Java full-stack was too slow for a usable daily Chat path. The thin MVP authorizes a **colocated Python local-service host** for Chat + tools + SQLite, composed from existing ecosystem libraries, while keeping the same HTTP/SSE vocabulary as `@eap/runtime-client` so the Vue console can later point at this host without a second dialect.

## Decisions

1. **Layout:** business Python lives under [`py-backend/`](../../py-backend/). Virtualenv is **`py-backend/.venv`**, never the repository root (avoids colliding with [`scripts/eap_bootstrap.py`](../../scripts/eap_bootstrap.py), which remains non-Agent).
2. **Stack:** FastAPI + Uvicorn + SQLModel/SQLite + httpx OpenAI-compatible streaming. Capability tools use argv arrays (no shell). LangGraph is not the default agent loop.
3. **One production path for Chat:** `py-backend` is the Chat authority for this track. Do not dual-run Java Chat against the same UI without an explicit cutover. Other Java domains stay frozen until separately migrated or retired.
4. **Data root:** default `py-backend/.eap/` (override with `EAP_DATA_ROOT`); SQLite at `<root>/.eap/db/eap.sqlite`, connections under `.eap/config/model-connections.json` (GET never returns raw secrets). Aligns with FS-01 intent in [`agent-runtime-evolution.md`](agent-runtime-evolution.md) §5.2.
5. **Contracts stubbed now:** `ChatExecutionStatus`, `AiToolMode`, `TaskMode`, ProblemDetail `code`, SSE `protocolVersion: "1"`. Illegal wire values → 400, never business `UNKNOWN`. Incomplete execution after process stop → `UNKNOWN` / no auto-resume ([`chat-execution-log-persistence.md`](chat-execution-log-persistence.md)).
6. **Message graph:** SQLite columns include `parent_id` / `sibling_index`; MVP writes a linear chain only. Server-owned history; no `localStorage` authority ([`local-chat-history-migration.md`](local-chat-history-migration.md)).

## Deferred

Edit/regenerate branching, full CT-01 DB event append-only, board/code proposals, MCP protocol calls (`tools/list` / `tools/call`), knowledge FTS, Postgres, managed-tool installer, LangGraph default loop, deleting the Java reactor.

**Update (2026-11-24):** L2 DSH plugin host (install/UI contributions with control on server) is accepted in [`py-backend-plugin-host-l2.md`](py-backend-plugin-host-l2.md); that slice supersedes “no plugins” for this track only.

**Update (2026-11-25):** Shell catalog registration and the chat turn binder are accepted in [`py-backend-agent-architecture.md`](py-backend-agent-architecture.md). That slice does not adopt LangGraph and does not treat a declared MCP tool as a completed call.

## Acceptance (this slice)

- Install/run from `py-backend` with module `.venv`.
- `POST /api/ai/conversations`, SSE `…/messages`, `GET …/graph`, `POST …/cancel`, connections list/create.
- Offline/test mode may inject a fixed reply; real model uses `EAP_MODEL_*` or stored connection secret.
- `toolMode=git_status` emits a structured `tool` SSE event via argv `git`.
- Frontend live accept (2026-11-25): non-mock Vue → `127.0.0.1:8080`; shell boot six keys pass; Chat `toolMode=none` real-model one SSE round pass. Does not cover MCP protocol, edit/regenerate, or board/SQL.

## References

- [`py-backend/README.md`](../../py-backend/README.md)
- [`docs/running-context.md`](../running-context.md) A1
- [`docs/pipeline.md`](../pipeline.md)
- [`docs/decisions/domain-status-and-backend-i18n.md`](domain-status-and-backend-i18n.md)
