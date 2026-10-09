# Engineering Automation Platform

A cross-platform engineering console built on one rule: **deterministic first, model last.**

Most "AI for engineering" tools send everything to a model. This platform runs local, deterministic
capabilities first and turns their output into structured, citable evidence. A language model is
consulted only when the deterministic result is explicitly *not* decisive — and when it is called,
it receives a compressed, token-bounded, structured prompt instead of the raw artifact.

That produces two measurable outcomes:

1. **Less dependency on models** — the common case never calls one.
2. **Cheaper model calls** — each call is compressed, cached and its compression ratio is reported.

## Repository layout

```text
frontend/   Vue 3 / TypeScript monorepo (Vite+, pnpm) — apps/*, packages/*
backend/    Java 25 / Spring Boot / Maven reactor — eap-api, eap-runtime
scripts/    optional Python tooling
docs/       architecture, pipeline, roadmap, environment, prototype
```

## How it works

```text
Ingest + redact → Deterministic evidence → Decision (route/skip) → Compress → Model (optional)
```

- `SqlFactExtractor` parses SQL and emits **structural facts** — no judgement.
- `RuleEngine` evaluates the expert's **rule packs** (JSON) over those facts and produces findings
  (`code`, `severity`, `evidence`, `suggestion`, `confidence`), complexity and a confidence.
- `DecisionProvider` decides whether a model is worth calling, and records why.
- `PromptPreprocessor` compresses the evidence under a hard token budget and reports the ratio.
- `LlmGateway` caches calls and **fails closed**: no provider, no problem — the deterministic result
  stands.

## Experts and rules are configuration

An expert is a manifest, not a class. Adding a check — its severity, wording and escalation
threshold — means editing a rule pack, not recompiling the backend:

```jsonc
// rules/sql-antipatterns.json  (or POST /api/rule-packs)
{ "id": "predicate.like.leading_wildcard", "category": "谓词", "severity": "high",
  "when": { "fact": "predicate.leadingWildcardLike", "op": "eq", "value": true },
  "evidence": "LIKE 模式以前导通配符 % 开头。",
  "suggestion": "前导通配符使普通 B-Tree 索引失效；可评估范围检索或 trigram 索引。" }
```

- Preview a rule against real SQL before publishing: `POST /api/rule-packs/dry-run`.
- Attach packs to an expert with `"rulePacks": ["sql-antipatterns"]`.
- Capabilities are one `@Component` each; the executor has no per-capability branches.

Read [docs/expert-knowledge-rules.md](docs/expert-knowledge-rules.md) for the full model and
[docs/pipeline.md](docs/pipeline.md) for the invariants that enforce it.

## Documentation

| Document | Contents |
|---|---|
| [docs/pipeline.md](docs/pipeline.md) | The deterministic-first / model-last value chain. **Start here.** |
| [docs/architecture.md](docs/architecture.md) | What is implemented today vs what is planned. |
| [docs/roadmap.md](docs/roadmap.md) | Phased plan with measurable exit criteria. |
| [docs/backend-architecture.md](docs/backend-architecture.md) | HTTP API and execution flow reference. |
| [docs/frontend-prototype.md](docs/frontend-prototype.md) | Console information architecture and prototype. |
| [docs/expert-knowledge-rules.md](docs/expert-knowledge-rules.md) | Experts, knowledge bases and declarative rule packs. |
| [docs/environment.md](docs/environment.md) | What the environment actually needs. |
| [docs/runtime-workflow.md](docs/runtime-workflow.md) | Operator runbook, incl. schema adoption. |
| [docs/desktop-spec.md](docs/desktop-spec.md) | Desktop shell plan (Tauri 2). |

## Build and run

Requires JDK 25, Maven 3.9+, Node.js with pnpm 12, PostgreSQL, Git and ripgrep.

```shell
# Backend
cd backend
mvn test
mvn spring-boot:run -pl eap-runtime -am

# Frontend
cd frontend
vp install
vp build
vp dev
```

The model stage is **off by default**. To enable it, point the runtime at an OpenAI-compatible local
endpoint:

```shell
EAP_LLM_ENABLED=true EAP_LLM_BASE_URL=http://127.0.0.1:1234/v1 EAP_LLM_MODEL=<id> \
  mvn spring-boot:run -pl eap-runtime -am
```

Remote endpoints require `EAP_LLM_ALLOW_REMOTE=true` and HTTPS. See
[docs/environment.md](docs/environment.md).

Licensed under Apache-2.0.
