# Development environment

## What the current phase actually needs

| Component | Required? | Purpose |
|---|---|---|
| JDK 25 + Maven 3.9+ | Yes | Build and run the Java runtime. |
| PostgreSQL | Yes | Task records, expert definitions, knowledge base and grants (schema `eap`). |
| Node.js + pnpm 12 + Vite+ | Yes | Build and run the frontend console. |
| Git, ripgrep | Yes | Deterministic capabilities (`git-status`, `git-diff`, `rg-search`). Resolved on `PATH` by default; the location can be overridden per machine from the capability catalog (本地 CLI 页) without a restart. |
| Spring AI official model provider | Optional | OpenAI Starter is installed; model use remains opt-in. No model is needed for offline tests. |
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

# Spring AI connection (disabled by default; inject credentials separately)
EAP_AI_PROVIDER=none              # openai enables the installed official provider
EAP_AI_MODEL=gpt-4.1-mini         # configure an API model you are authorized to use
EAP_AI_BASE_URL=https://api.openai.com
OPENAI_API_KEY=<injected-only-when-enabled>
EAP_AUTHORIZED_ROOT=<optional-override-of-process-workspace-root>
EAP_AI_AUTHORIZED_ROOT=<legacy-fallback-same-as-EAP_AUTHORIZED_ROOT>
EAP_AI_ARTIFACT_ROOT=.eap-ai-artifacts

# SQL business stage (separate from connection configuration)
EAP_LLM_ENABLED=false
EAP_LLM_TEMPERATURE=0.1
EAP_LLM_MAX_PROMPT_TOKENS=1800     # hard preprocessing budget
EAP_LLM_MAX_COMPLETION_TOKENS=700
EAP_LLM_CACHE_ENTRIES=64
```

Never commit `EAP_DB_PASSWORD`. Keep local secrets in an untracked local environment file or a
secret manager, and inject them per environment.

## Spring AI connection migration

Spring AI 2.0.2's official OpenAI Starter owns transport, messages and tools. The backend uses
`spring.ai.openai.*`; the environment variables above are application aliases. The default provider
is `none`, and constructing a configured client never proves a successful connection. An enabled
OpenAI connection without a key produces a clear configuration error. The CLI's ChatGPT credentials
are not API credentials and are never read here.

| Retired setting | Replacement |
|---|---|
| EAP_LLM_BASE_URL / eap.llm.base-url | EAP_AI_BASE_URL / spring.ai.openai.base-url |
| EAP_LLM_MODEL / eap.llm.model | EAP_AI_MODEL / spring.ai.openai.chat.options.model |
| EAP_LLM_CONNECT_TIMEOUT_MS / EAP_LLM_READ_TIMEOUT_MS | spring.ai.openai.timeout (30s default, SDK request timeout) |
| EAP_LLM_ALLOW_REMOTE | Explicit EAP_AI_PROVIDER enablement; HTTPS required remotely; HTTP accepted only for loopback |

Remove retired keys rather than setting both sets. When AI or SQL enhancement is requested, detecting
these obsolete connection keys fails startup with property names and migration instructions, never
secret values. With AI disabled, a migration warning is emitted and non-AI capabilities remain
available. SQL's compression/token budget/cache/decision settings remain business settings.

The current official provider has not been validated against arbitrary local OpenAI-compatible
servers. Such a connection needs its own authorized integration test; do not declare it supported
from a saved URL. Chat may use a saved OpenAI-compatible connection selected in settings; that path
is auxiliary to engineering delivery — see [architecture.md](architecture.md) and
[running-context.md](running-context.md). Prefer `EAP_AUTHORIZED_ROOT` for an explicit process-bound
root. When both keys are empty, the colocated local service binds to the detected process workspace
(git root / `user.dir`). Legacy `EAP_AI_AUTHORIZED_ROOT` is only a same-path fallback; conflicting
paths refuse. This is not a remote multi-tenant grant store.

## Database initialisation

Flyway owns the `eap` schema. On 2026-10-26, the user approved resetting disposable development
databases and consolidating V1–V18 into `V1__initial_schema.sql`. This baseline creates 21 tables,
four explicit indexes and the built-in Git/ripgrep programs and operations. Other configuration
starts empty; absent capability settings mean enabled, and absent CLI overrides use default binaries.

Only `backend/eap-runtime/src/main/resources/db/migration` is active; the obsolete `backend/db`
copies were removed. Historical CLI override conversion, duplicate comments, transitional ALTERs
and the V5 legacy-adoption strategy were removed. Unused pgvector setup and its vector column were
removed; existing embedding metadata fields remain for the current mapper contract.

Existing V1–V18 development histories are not upgrade-compatible with this new baseline. Stop the
application, explicitly reset only the confirmed disposable EAP database/schema and its Flyway
history, then restart with injected database credentials. Do not use Flyway repair/baseline to hide
the mismatch. Startup never resets the database automatically; `EAP_ADOPT_EXISTING_SCHEMA` is retired.
Subsequent schema changes use V2 and later incremental migrations. This code change does not itself
perform any database reset. Real empty-database migration acceptance must be reported separately.

## Toolchain prerequisites

- JDK 25
- Maven 3.9+
- Git and ripgrep on `PATH`
- Node.js compatible with Vite+, and pnpm 12.x
- Electron **45.0.0** scaffold lives in `frontend/apps/desktop` (`dev` / `check:preload`); Node ≥22.12.
  There is still no signed package / auto-update command. Signing tools remain a later delivery.

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
