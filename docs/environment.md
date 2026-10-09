# Development environment

## What the current phase actually needs

| Component | Required? | Purpose |
|---|---|---|
| JDK 25 + Maven 3.9+ | Yes | Build and run the Java runtime. |
| PostgreSQL | Yes | Task records, expert definitions, knowledge base and grants (schema `eap`). |
| Node.js + pnpm 12 + Vite+ | Yes | Build and run the frontend console. |
| Git, ripgrep | Yes | Deterministic capabilities (`git-status`, `git-diff`, `rg-search`). Resolved on `PATH` by default; the location can be overridden per machine from the capability catalog (本地 CLI 页) without a restart. |
| A local model endpoint (LM Studio / vLLM) | Optional | Only needed to exercise the optional model stage. |
| RustFS / S3 object storage | No | Superseded for the current phase; see "Deferred" below. |
| pgvector + embeddings | No | Superseded for the current phase; see "Deferred" below. |

The previous revision of this document described an embedding + object-storage stack as
"required". It is not. The current implementation uses PostgreSQL full-text search for knowledge
retrieval and stores document text directly; it does not use vectors and does not require RustFS.
This file now separates what runs from what is deferred.

## Application configuration

```text
# Database
EAP_DB_URL=jdbc:postgresql://localhost:54321/postgres?currentSchema=eap
EAP_DB_USERNAME=postgres
EAP_DB_PASSWORD=<local-secret>
EAP_DB_SCHEMA=eap

# Server
EAP_SERVER_PORT=8080

# Optional model stage (disabled by default; the pipeline is deterministic without it)
EAP_LLM_ENABLED=false
EAP_LLM_BASE_URL=http://127.0.0.1:1234/v1
EAP_LLM_MODEL=local-model
EAP_LLM_TEMPERATURE=0.1
EAP_LLM_MAX_PROMPT_TOKENS=1800     # hard preprocessing budget
EAP_LLM_MAX_COMPLETION_TOKENS=700
EAP_LLM_CACHE_ENTRIES=64
EAP_LLM_CONNECT_TIMEOUT_MS=3000
EAP_LLM_READ_TIMEOUT_MS=20000
EAP_LLM_ALLOW_REMOTE=false         # remote endpoints additionally require HTTPS
```

Never commit `EAP_DB_PASSWORD`. Keep local secrets in an untracked local environment file or a
secret manager, and inject them per environment.

## Local model endpoint (optional)

The model stage speaks the OpenAI-compatible `/chat/completions` API. For local development:

1. In LM Studio (or vLLM), load a chat-capable model.
2. Start the local server, normally at `http://127.0.0.1:1234`.
3. Set `EAP_LLM_ENABLED=true`, `EAP_LLM_BASE_URL=http://127.0.0.1:1234/v1` and `EAP_LLM_MODEL=<id>`.

`EndpointPolicy` allows loopback endpoints over `http` by default. A remote endpoint is only accepted
when `EAP_LLM_ALLOW_REMOTE=true` **and** the scheme is `https`. This is enforced at construction time,
so a misconfigured endpoint disables the provider instead of leaking data.

## Database initialisation

Flyway owns the `eap` schema and applies migrations `V1..V9` automatically on start. For a database
that already contains a hand-built `eap` schema without a Flyway history, see
[runtime-workflow.md](runtime-workflow.md) for the one-time adoption procedure
(`EAP_ADOPT_EXISTING_SCHEMA=true`). Do not clean, repair or drop existing objects by hand.

`V8` adds `eap.mcp_server` and `eap.expert_mcp_grant`. Both start empty: no MCP server is registered,
no expert holds an MCP grant, and the capability catalog therefore reports zero `mcp` capabilities
until an operator registers a server and an expert declares a tool.

`V9` adds `eap.capability_setting` (the platform-wide on/off switch per capability) and
`eap.cli_channel` (the per-machine binary override for a `cli` capability). Both start **empty on
purpose**: an absent capability setting means *enabled* (the switch is opt-out), and an absent CLI
channel means *use the binary the handler ships*, so an empty database is a fully working one.

An empty database needs no adoption flag; it migrates from `V1` normally.

## Toolchain prerequisites

- JDK 25
- Maven 3.9+
- Git and ripgrep on `PATH`
- Node.js compatible with Vite+, and pnpm 12.x
- Rust toolchain only when desktop (`apps/desktop`, Tauri 2) development starts

## Deferred (not required now)

These were part of an earlier plan and are explicitly deferred until a phase in
[roadmap.md](roadmap.md) justifies them.

- **Vector retrieval / embeddings.** V1 created a pgvector schema; V5 removed mandatory embeddings
  because PostgreSQL full-text search was sufficient. Reintroduction (Phase 10) must define a stable
  embedding version, dimension, migration and re-index policy — never a silent dimension change.
- **Object storage (RustFS / S3).** Only useful once uploaded binaries must be versioned as immutable
  evidence. Until then, document text is stored directly with a SHA-256 checksum.
- **Redis / Kafka.** In-process work plus PostgreSQL is enough; add a queue only when concurrency or
  durability demands it.
- **Elasticsearch / OpenSearch.** PostgreSQL is sufficient for the current retrieval path.
- **Kubernetes.** A single Java process, PostgreSQL and the frontend are enough for local
  development.
