# Engineering Automation Platform

A cross-platform engineering console built on one rule: **deterministic first, model last.**

Local capabilities produce structured, citable evidence without requiring a language model.
The SQL analysis pipeline can use bounded model enhancement when deterministic evidence is insufficient.
Chat and the versioned SQL Agent explicitly use a configured model; tool authorization, candidate
approval and independent verification remain separate from model output. Model savings and quality
must be measured for the actual workload, not inferred from this architecture.

The expert manager and GrapesJS prototype designer now share an independent three-pane editor.
See the [documentation index](docs/README.md) and [current implementation/acceptance status](docs/planning-status.md#validation-baseline)
for delivered scope, historical evidence and remaining user acceptance.

## Repository layout

```text
frontend/   Vue 3 / TypeScript monorepo (Vite+, pnpm) — apps/*, packages/*
backend/    Java 25 / Spring Boot / Maven reactor — api, engine/ai/web/spring libraries, applications/eap-full-application
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
- Capability handlers and their declared contributions are composed by the host; the executor resolves them through the existing registry.
- Fixed workflows retain `eap/v1`. The explicit `eap/v2` SQL Agent binds a versioned professional behavior, selects authorized evidence through Spring AI, and persists bounded background execution.
- A generated SQL file is only a candidate: writing requires a separate, digest-bound approval. The platform does not execute that SQL.

See [backend composition and stage evidence](docs/decisions/backend-module-composition.md#responses-tools-acceptance) for the 32-project reactor, restart recovery, approval UI and real Responses tool acceptance.

Read [docs/expert-knowledge-rules.md](docs/expert-knowledge-rules.md) for the full model and
[docs/pipeline.md](docs/pipeline.md) for the invariants that enforce it.

## Documentation

Use the [documentation index](docs/README.md) to distinguish current implementation, target designs
and retained historical acceptance. Superseded UI reviews and per-round Codex investigations are
consolidated into the canonical documents rather than maintained as parallel instructions.

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
| [docs/desktop-spec.md](docs/desktop-spec.md) | Desktop shell plan (Electron, with a configured renderer posture). |

## Build and run

Requires JDK 25, Maven 3.9+, Node.js with pnpm 12, PostgreSQL, Git and ripgrep.

Run the backend and frontend in separate terminals, each starting at the repository root.

```shell
# Backend terminal
cd backend
mvn test
mvn -pl :eap-full-application -am install -DskipTests
mvn -pl :eap-full-application spring-boot:run
```

```shell
# Frontend terminal
cd frontend
vp i
vp build
vpr dev
```

The Maven run goal uses `backend/` as its working directory. If an existing installation uses another
data directory, preserve it with `-Deap.run.working-directory=<original-absolute-directory>`; IDEA/JAR
launches must retain their existing working directory. The module move does not migrate data.

The optional SQL enhancement stage is **off by default**. Generic model integration uses Spring AI 2.0.2. To enable
the official OpenAI provider from `backend/` (POSIX shell example; credentials are injected, never committed):

```shell
EAP_AI_PROVIDER=openai EAP_AI_MODEL=<api-model-id> OPENAI_API_KEY=<injected-secret> EAP_LLM_ENABLED=true \
  mvn -pl :eap-full-application spring-boot:run
```

`EAP_LLM_ENABLED` gates SQL enhancement; it does not configure a connection. Old connection variables
require migration and are rejected when model use is enabled. The Chat workbench and SQL Agent use explicitly saved model connections and allowed models; configuration alone does not establish provider acceptance. Ordinary API Responses function tools have passed a bounded SQL candidate/approval test; Chat Git tools and account-plan SQL tools remain separately gated. See
[docs/environment.md](docs/environment.md).

Licensed under Apache-2.0.
