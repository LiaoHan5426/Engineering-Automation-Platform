# Decision: py-backend agent architecture

**Date:** 2026-11-25  
**Status:** Accepted for the catalog + turn slice  
**Extends:** [`py-backend-thin-mvp.md`](py-backend-thin-mvp.md). Does not adopt LangGraph and does not dual-run Java Chat.

## Context

The Vue console calls `@eap/runtime-client` for shell boot (capabilities, databases, experts, tasks, stats, health) and for the catalogs a turn needs (knowledge, rule packs, skills, MCP, scenarios). Those routes 404 on the thin Chat host, so the console stays in error even when SSE chat works. The agent path ran at most one builtin tool and then the model, with no binding of rules, skills, knowledge, or MCP.

## Decisions

1. **One host, one catalog.** FastAPI remains the HTTP gateway. Operator-owned rules, skills, knowledge, MCP registrations, experts, database profiles, and scenarios live in the same SQLite file as chat. `CatalogService` is the only writer. The chat turn reads that service; it does not keep a second copy.
2. **Wheels stay behind the gateway.** SQLModel/SQLite stores the catalogs. httpx stays the OpenAI-compatible stream client. Capability tools stay argv arrays (no shell). A new library is added only when a route needs its protocol. The MCP Python SDK is not a dependency until `tools/list` and `tools/call` are the production path.
3. **Turn order is fixed.** `app/agent/turn.py` builds one system preamble before the model call:
   1. Platform constraint: model output is observation, not completion evidence.
   2. Enabled rule packs, as constraints.
   3. Enabled skills, as instructions. They do not outrank rules.
   4. Knowledge hits (SQLite substring match, capped) and the builtin tool observation already produced this turn, as evidence.
   5. MCP tools whose server is enabled, trusted, and has a non-empty tool list. The names are registered, not called.
4. **A declared tool is not a call.** `POST /mcp-servers/{id}/probe` returns `verified: false`. Disabled, untrusted, or empty servers are not `usable` and never enter the preamble.
5. **Illegal wire values are rejected.** Scenario status, MCP transport, skill digest, and secret-looking database metadata keys return ProblemDetail codes (`INVALID_SCENARIO`, `INVALID_MCP_SERVER`, `SKILL_DIGEST_MISMATCH`, `CREDENTIAL_NOT_ACCEPTED`). They are not stored as business `UNKNOWN`.
6. **Stats stay honest.** With no task table, `model.share` and `deterministicShare` are `null`. An empty task list is not a 0% claim.
7. **Still out of this slice.** SQL analysis, board/mission, code proposals, knowledge FTS, and MCP protocol execution. Java remains frozen for those domains until a later cutover.

## Acceptance

- `GET /api/health` includes `service`.
- Shell boot GETs return the runtime-client list shapes instead of 404: `/capabilities`, `/databases`, `/experts`, `/tasks`, `/stats`, `/knowledge`, `/rule-packs`, `/skills`, `/scenarios`, `/mcp-servers`.
- A turn preamble contains an enabled rule and skill, a knowledge excerpt, and a trusted MCP tool name, and omits an untrusted server's tool.
- Builtin `toolMode` still runs before the model, through `CapabilityRegistry`.
