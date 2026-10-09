# The core pipeline: deterministic first, model last

This document defines the value chain the platform is built around. Every other document is
subordinate to it. If a feature does not reduce model dependency or make model input smaller and
more auditable, it does not belong in the roadmap.

## The problem this pipeline solves

An off-the-shelf "chat with your code / chat with your SQL" tool sends almost everything to a model:
the raw artifact, every retrieved document, and a long system prompt. That is expensive, slow,
non-deterministic, and hard to audit. This platform takes the opposite default position:

> **Deterministic capabilities run first and produce structured, citable evidence. A model is only
> consulted when the deterministic result is explicitly not decisive, and it receives a compressed,
> structured prompt — never the raw artifact.**

Two measurable goals follow from this:

1. **Reduce model dependency.** Most analyses never call a model at all.
2. **Reduce model cost.** When a model is called, the prompt is compressed and cached, and the
   compression is measured and reported.

## The five stages

```text
   ┌─────────────┐   ┌───────────────────┐   ┌──────────────────┐   ┌───────────────┐   ┌──────────────┐
   │ 1. Ingest   │ → │ 2. Deterministic  │ → │ 3. Decision      │ → │ 4. Compress   │ → │ 5. Model     │
   │  + redact   │   │    evidence       │   │    (route)       │   │   (preprocess)│   │   (optional) │
   └─────────────┘   └───────────────────┘   └──────────────────┘   └───────────────┘   └──────────────┘
        always             always               always                 only if routed        only if routed
                                                      │ skip
                                                      ▼
                                             deterministic result
```

### 1. Ingest and redact (always)

Input is normalised and redacted before anything else. `SensitiveData` removes credentials, tokens
and JDBC URLs. Redaction is applied to persisted evidence as well as to anything sent to a model.

### 2. Deterministic evidence (always)

A capability parses the artifact with a real parser, not a regex guess, and emits **structured
findings**. For SQL that is a two-step split, and the split matters:

1. `SqlFactExtractor` parses the statement and emits a flat map of **structural facts** — what is
   true about the SQL. It contains no judgement. For example:

   ```jsonc
   { "statement.type": "SELECT", "select.allColumns": true, "join.count": 2,
     "select.limit": true, "select.hasOrderBy": false, "table.list": "orders、customer",
     "metric.joinCount": 2, "predicate.functionOnColumn": "UPPER" }
   ```

2. `RuleEngine` evaluates the expert's **rule packs** against those facts and produces findings, per
   finding:

   | Field | Meaning |
   |---|---|
   | `code` | stable rule identifier, e.g. `predicate.like.leading_wildcard` |
   | `category` | grouping, e.g. `谓词`, `连接`, `分页` |
   | `severity` | `critical` / `high` / `medium` / `low` / `info` |
   | `evidence` | the observed structure that triggered the rule, interpolated from facts |
   | `suggestion` | a semantics-preserving suggestion |
   | `confidence` | declared on the rule, or derived from the pack's severity weights |

   Which checks exist, how severe they are and how they escalate is **configuration** — see
   [expert-knowledge-rules.md](expert-knowledge-rules.md).

   Judgement is one evaluation over the **whole run's** fact base, not per node: `sql.parse` publishes
   the statement's shape, `database.index.read` / `database.schema.read` add snapshot facts and
   `database.explain` adds plan facts, so a single rule can combine SQL structure with what the
   environment actually says. Because every fact names its producing capability, a rule whose facts
   were never produced is reported as a **blocked** rule — `…；另有 N 条规则因所需能力未执行而未能判定，结果不完整。`
   — and the run degrades to `partial`. A rule that could not be judged is never presented as a rule
   that passed, and the fact base the judgement saw is returned in the response.

The stage also reports `tables`, `joinKeys`, `joinColumns`, the raw `facts`, `blockedRules`,
`ruleCapabilities`, `executedCapabilities`, a `complexity` score, `severityCounts`, and a
`deterministicConfidence` derived from the pack's `policy`. This is the evidence base for everything
that follows, and it is what the UI renders.

### 3. Decision — route or skip (always, cheap)

`DecisionProvider` decides whether a model is worth calling. The default
`RuleBasedDecisionProvider` policy for the SQL pipeline is:

| Condition | Decision | Why |
|---|---|---|
| Parse failed | `skip` | The model cannot improve an unparseable artifact. |
| Operator explicitly requested enhancement | `enhance` | Explicit intent wins. |
| `requiresModelReview` | `enhance` | Deterministic evidence is insufficient. |
| Otherwise | `skip` | Deterministic evidence is already actionable. |

`requiresModelReview` is not a constant: `RuleEngine` derives it from the rule pack's `policy`
(`actionableWeight` vs. the highest severity that fired, and `reviewComplexityThreshold` vs. the
complexity score). A stricter pack therefore escalates to a model sooner, and a pack with a higher
`actionableWeight` keeps more work local — **the escalation point is configuration**, and the
compression below is what bounds the cost when it does escalate.

The decision, its confidence and its rationale are recorded and returned to the UI, so "why did we
call/not call a model" is always answerable. The provider is optional and fails closed: an outage or
an unknown decision kind falls back to `skip`.

### 4. Preprocess — compress the evidence (only if routed)

`PromptPreprocessor` converts the structured evidence into a compact, token-bounded prompt:

- findings are included as one line each (code + severity + evidence), no prose duplication;
- join keys and metadata notes are clipped;
- knowledge is limited to the top-k excerpts and each excerpt is clipped;
- every section is dropped, in a defined order, until the prompt fits `eap.llm.max-prompt-tokens`.

Crucially, it reports a **compression ratio** against a naive "send everything" baseline:

```text
baselineTokens  = tokens(raw artifact + all findings + all knowledge + all notes + rules)
estimatedTokens = tokens(system prompt + prepared prompt)
compressionRatio = 1 - estimatedTokens / baselineTokens
```

This number is returned in the API response and stored with the task, so cost reduction is a
measured outcome rather than a claim.

### 5. Model call (optional, fail-closed, cached)

`LlmGateway` selects the first available provider, serves identical prompts from an LRU cache so
repeated analyses are free, and converts any failure into "no model output". `OpenAiCompatibleProvider`
speaks the OpenAI-compatible API and enforces `EndpointPolicy`: loopback endpoints are allowed by
default, remote endpoints require `EAP_LLM_ALLOW_REMOTE=true` **and** HTTPS.

Model output is an **unverified observation**. It is stored, rendered separately from deterministic
findings, and never mutates the deterministic analysis or changes a task to `completed` on its own.

## Invariants

These are non-negotiable and are enforced in code and tests.

1. Deterministic stage always runs, even if the model is disabled.
2. The model receives only preprocessed, redacted, token-bounded input.
3. The model cannot approve a rule violation, grant permission, or authorise execution.
4. Semantic-preserving suggestions only: no candidate rewrite is auto-executed, and none changes the
   meaning of the original query.
5. Every model call records provider, model, prompt/completion tokens, latency, and compression ratio.
6. Fail closed: model unavailability degrades to the deterministic result, never to an error page.
7. Coverage is explicit: a rule whose facts could not be produced (its capability never ran) is
   reported as a *blocked* rule, the run is marked `partial`, and the capability requirements are
   returned per rule pack. Absence of a finding is only ever reported as "clean" for rules that were
   actually evaluated.

## How to verify the pipeline

```shell
cd backend
# deterministic rules and the preprocessing/decision layers
mvn -pl eap-runtime -am test

# run the runtime with a local model (LM Studio / vLLM) and observe routing in logs
EAP_LLM_ENABLED=true EAP_LLM_BASE_URL=http://127.0.0.1:1234/v1 \
  mvn spring-boot:run -pl eap-runtime -am
```

Submit an SQL through the frontend and read the `modelAdvisor` block in the response: it reports the
`decision`, `rationale`, and `preprocessing.compressionRatio` for that specific request.
