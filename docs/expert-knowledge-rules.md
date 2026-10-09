# Experts, knowledge bases and rules

This document defines how the platform stays configurable. It exists because an earlier revision of
the codebase got this wrong in a way that is easy to repeat:

> **The example SQL expert was implemented as a Java class.** The JSON manifest beside it declared
> `"rules": [...]` that no code ever read, the ~15 checks were hard-coded string constants inside
> `DeterministicSqlAnalyzer`, and the capability dispatch was a `switch (capability)` in the executor.
> The result looked configurable and was not: changing the JSON changed nothing, and adding a check
> required recompiling the backend.

If you are about to add domain judgement, read §2 first. If you are about to write
`if (expertId.equals("…"))`, read §5 first. If you are about to reference a rule pack from an expert
without adding the nodes that feed it, read §3 — the graph is validated against the pack's declared
capabilities, and a mismatch is rejected rather than left to fail silently.

## 1. The one rule

**The expert is data. Code only extracts facts.**

```text
        ┌──────────────────────── code (generic) ────────────────────────┐
SQL ──▶ │ SqlFactExtractor                                               │
        │   parse → flat fact map   {"select.allColumns": true, …}       │
        └────────────────────────────┬───────────────────────────────────┘
                                     ▼
        ┌──────────────────────── data (editable) ───────────────────────┐
        │ Rule pack JSON                                                 │
        │   {"when": {"fact":"select.allColumns","op":"eq","value":true}, │
        │    "severity":"low", "suggestion":"…"}                         │
        └────────────────────────────┬───────────────────────────────────┘
                                     ▼
        ┌──────────────────────── code (generic) ────────────────────────┐
        │ RuleEngine   evaluate conditions → findings                     │
        └────────────────────────────────────────────────────────────────┘
```

Everything that answers *"is this good or bad, how bad, and what should be done"* lives on the right
of that picture and is a JSON file or a database row. The left side only answers *"what is
structurally true about this statement"*.

A second rule is just as load-bearing: **every fact names the capability that produces it.** The fact
map is not a global bag — `sql.parse` publishes the 33 facts about statement shape, `knowledge.search`
publishes 2, and `database.schema.read` / `database.index.read` / `database.explain` publish 4, 4 and 5
respectively (`Fact.producedBy` in `SqlFactVocabulary`, 48 facts today). That single field is what
makes capability requirements *derivable* instead of guessed: a rule reading `plan.seqScan` can only
fire when `database.explain` ran, so the pack that contains it needs that capability, and any expert
referencing that pack needs a node providing it. §2 and §3 make that chain enforceable rather than
advisory. Without it the failure mode is silence — the pack loads, the run succeeds, and the rule
simply never matches.

Three different things are called "rules" in this codebase. Keep them apart:

| Term | Where it lives | Who owns it | Example |
|---|---|---|---|
| **Platform invariant** | `manifest.rules` | Platform | `database.credentials.never-expose` |
| **Rule pack** | `rules/*.json` or `eap.rule_pack` | You | `sql-antipatterns` |
| **Rule** | inside a rule pack | You | `predicate.like.leading_wildcard` |

Platform invariants are a closed vocabulary validated by `ExpertGraph`; an expert cannot opt out of
them. Rule packs are open-ended and entirely yours.

## 2. Adding a rule without touching code

Real example. Suppose you want to flag queries that reference a table whose name ends in `_bak`.
There is no matching code anywhere, and none is needed.

**Step 1 — find the facts you can use.** `GET /api/rule-packs/vocabulary` lists every fact the
extractor guarantees. Relevant here: `table.list` (string), `table.count` (number).

**Step 2 — copy a shipped pack so you are not editing a built-in.**

```shell
curl -s localhost:8080/api/rule-packs/sql-antipatterns | jq -r .manifest > my-pack.json
# change "id" to "my-team-sql" and edit
curl -X POST localhost:8080/api/rule-packs -H 'content-type: application/json' \
  -d "{\"manifest\": $(jq -Rs . my-pack.json)}"
```

**Step 3 — add the rule.**

```json
{
  "id": "custom.backup_table_touched",
  "title": "命中了备份表",
  "category": "结构",
  "severity": "high",
  "when": { "fact": "table.list", "op": "matches", "value": "_bak\\b" },
  "evidence": "语句涉及备份表：{{table.list}}。",
  "suggestion": "确认是否应当查询生产表；备份表通常缺少索引且数据滞后。"
}
```

**Step 4 — see it work before publishing.**

```shell
curl -X POST localhost:8080/api/rule-packs/dry-run -H 'content-type: application/json' -d '{
  "sql": "select id from orders_bak where id = 1",
  "manifest": "…the full pack JSON…"
}'
```

The response contains the matched `facts`, the `findings`, `rulesFired`, `severityCounts` and the
`summary` — everything a reviewer needs, with nothing saved.

**Step 5 — attach it to an expert.** Add the pack id to the expert manifest and re-save:

```json
{ "rulePacks": ["sql-antipatterns", "my-team-sql"] }
```

Enabling the expert re-validates that every referenced pack exists. Missing packs are rejected at
enable time and reported (not silently ignored) at run time.

### Which capabilities a pack needs (`requires.capabilities`)

A rule that reads `plan.seqScan` can only ever fire if `database.explain` ran. Nothing in the pack used
to say so, and the failure looked like success — the pack loaded, the expert ran, and the rule simply
never matched. A pack must therefore declare its dependencies, and the declaration is checked against
the facts its rules actually reference:

```json
{
  "requires": {
    "capabilities": ["sql.parse", "database.explain"],
    "note": "顺序扫描判断依赖 EXPLAIN 快照事实；缺少该能力时相关规则不予判定。"
  }
}
```

`RulePacks.validate` derives the required set from the pack itself — every rule condition, every
`severityWhen` condition and the `policy.complexity` inputs — resolves each fact to its producing
capability, and rejects the pack when:

| Error | What it means |
|---|---|
| `规则包必须声明所需能力 requires.capabilities；按规则引用的事实推导，至少需要：…` | The declaration is missing entirely. The derived list is included so the author never has to guess. |
| `requires.capabilities 缺少规则实际依赖的能力：…` | Partial declaration. The omitted capabilities are exactly the ones whose rules would silently never fire. |
| `requires.capabilities 引用了不发布事实的能力：…` | A capability that publishes no fact cannot support a rule condition. |

`RulePacks.requiredCapabilities(pack)` returns the declared set when present, otherwise the derived
one, so an invalid hand-written pack still reports what it *would* need instead of pretending it needs
nothing. `GET /api/rule-packs`, `GET /api/rule-packs/{id}` and `POST /api/rule-packs/dry-run` report
`requirements.declared` alongside `requirements.derived` (and the derived contributor set,
`factProducers`), so the mismatch is visible while editing rather than only at save time.

### The condition language

A condition is either a combinator or a leaf.

```jsonc
{ "all": [ … ] }            // every child must hold
{ "any": [ … ] }            // at least one child must hold
{ "not": { … } }            // negation
{ "fact": "join.count", "op": "gte", "value": 1 }   // leaf
```

| `op` | Meaning |
|---|---|
| `eq`, `ne` | Equality; numeric-aware, so `"2"` equals `2` |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison |
| `in` | Fact value is one of a list |
| `contains` | Substring (string fact) or membership (list fact) |
| `exists`, `absent` | Fact is present and truthy / absent or false |
| `matches` | Case-insensitive regular expression |

`evidence` and `suggestion` may interpolate any fact with `{{fact.key}}` — that is how a rule stays
declarative while still naming the offending object.

**Facts and operators are validated.** `RulePacks.validate` rejects a pack that references an
undeclared fact or an unsupported operator, and a test asserts every fact the extractor can produce is
declared in `SqlFactVocabulary`. So a typo in `"fact"` is a validation error, not a rule that
quietly never fires.

### Severity and escalation are data too

```json
{
  "severity": "low",
  "severityWhen": [ { "when": { "fact": "join.count", "op": "gte", "value": 1 }, "severity": "medium" } ]
}
```

The first matching override wins. The shipped pack uses exactly this to escalate `select *` from `low`
(single table) to `medium` (joined) — previously a hard-coded ternary in Java.

### The confidence policy is data too

`policy` in the pack controls the weights, the confidence values and the point at which the platform
decides deterministic evidence is insufficient:

```json
{
  "policy": {
    "severityWeights": { "critical": 1.0, "high": 0.75, "medium": 0.45, "low": 0.2, "info": 0.05 },
    "actionableWeight": 0.75,
    "complexity": { "weights": { "metric.joinCount": 2, "metric.subqueryCount": 2 },
                    "multiTableFact": "table.count", "multiTableAbove": 1, "multiTableWeight": 1 },
    "reviewComplexityThreshold": 4,
    "cleanConfidence": 0.9, "actionableConfidence": 0.85, "partialConfidence": 0.5
  }
}
```

`actionableWeight` and `reviewComplexityThreshold` together produce `requiresModelReview`, which is
the input to the routing decision in [pipeline.md](pipeline.md) §3 — so **when the platform escalates
to a model is itself configurable per pack**.

## 3. Adding an expert without touching code

An expert is a manifest (`eap/v1`). Nothing in it is SQL-specific.

```json
{
  "apiVersion": "eap/v1",
  "kind": "Expert",
  "id": "java-reviewer",
  "name": "Java 变更评审",
  "knowledgeBases": ["<uuid of a knowledge base>"],
  "databaseProfiles": [],
  "steps": [
    { "id": "diff",    "label": "读取变更", "capability": "git-diff",       "required": true },
    { "id": "search",  "label": "检索规范", "capability": "knowledge.search","required": true },
    { "id": "status",  "label": "工作区状态","capability": "git-status",     "required": false }
  ],
  "edges": [
    { "source": "diff", "target": "search" },
    { "source": "search", "target": "status" }
  ],
  "rulePacks": [],
  "rules": ["database.credentials.never-expose"]
}
```

1. `POST /api/experts/validate` — graph, capability vocabulary, knowledge/database references and
   rule pack references are all checked server-side.
2. `POST /api/experts` — saves a **disabled draft**.
3. `PUT /api/experts/{id}/activation` — enabling is the explicit authorisation step; it writes the
   knowledge/database **and MCP tool** grants, and disabling revokes all of them.
4. `POST /api/experts/{id}/execute`.

### Capabilities are typed, described and availability-aware

A capability is a closed vocabulary because it is code (§5), but a bare name answers none of the
questions an operator actually has. Each handler therefore also declares **what kind of thing it is**
(`CapabilityKind`), **who may turn it on** (`CapabilityScope`), a **descriptor** and whether it is
runnable **right now** (`CapabilityAvailability`):

| Kind | Scope it is born with | What has to exist outside the platform | Shipped today |
|---|---|---|---|
| `command` | `platform` | Nothing. Runs in-process, no network. | `sql.parse`, `knowledge.search`, `database.schema.read`, `database.index.read`, `database.explain` |
| `cli` | `platform` | The binary must be on `PATH`; invoked through `ProcessExecutor` with an argument array. | `git-status`, `git-diff`, `rg-search` |
| `mcp` | **`expert`** | A registered, enabled and trusted MCP server whose allow-list publishes the tool. | none yet |
| `http` | **`expert`** | An explicitly allow-listed remote endpoint, same policy as the model gateway. | none yet |

```java
@Override public Set<String> capabilities() { return Set.of("rg-search"); }
@Override public CapabilityKind kind() { return CapabilityKind.CLI; }
@Override public CapabilityAvailability availability() {
    // The binary is resolved per call, so an operator override takes effect without a restart.
    return LocalBinaries.resolve(channels.binaryFor("rg-search", SHIPPED_BINARY)).isPresent()
            ? CapabilityAvailability.AVAILABLE : CapabilityAvailability.MISSING_BINARY;
}
@Override public List<CapabilityDescriptor> describe() {
    return List.of(new CapabilityDescriptor("rg-search", kind(), "工作空间检索",
            "用 ripgrep 在工作空间内做有界检索，用于定位代码或配置证据。忽略 .git，参数以数组传入，不做 shell 拼接。",
            List.of("pattern（最多500字符）"), List.of("读取当前工作空间"),
            "ProcessExecutor · rg --line-number --hidden",
            "rg",                                        // the executable it ships with — see §3 below
            List.of(),                                   // facts it publishes — none, it returns evidence
            List.of("stdout", "stderr", "exitCode"), true));
}
```

Three properties matter here. **Availability is probed, not assumed** — `LocalBinaries.resolve` checks
either a bare name against `PATH` or an absolute path against the filesystem, without executing
anything (no `--version` probe); a `cli` capability whose binary cannot be found is reported as
`缺少可执行文件` instead of being listed as if it worked. **Facts a capability claims are checked** — a
test asserts the declared `facts` and the facts actually published agree, and
`CapabilityContext.publish` rejects anything not in the vocabulary. **The descriptor is written by the
handler, never inferred by the UI**, so the console cannot invent metadata the runtime does not honour.

`GET /api/capabilities` returns the catalog grouped by kind (`items`, `kinds` with per-kind counts,
scope, availability breakdown and management surface), plus reconciliation lists: `declared` (the
manifest vocabulary), `unregistered` (declared but no handler) and `undeclared` (a handler nobody
declared). Each item also carries `scope`, `expertScoped`, `registered`, `enabled`, `globallyRunnable`,
`authorisedExperts`, `notes` and `usedBy` / `declaredBy` — which experts reference it — read from
`expert_definition`. `GET /api/experts/catalog` exposes the same structured items as `capabilityItems` /
`capabilityKinds`; a test asserts the declared list and the registered handlers are identical, so the
two can never drift.

### Every kind of capability has a management entry point

A catalog you cannot act on is only half a catalog, and the honest answer to "where do I add one"
differs per kind. So the answer is declared next to the kind (`CapabilityManagement`) rather than
improvised in the UI:

| Kind | How an instance comes into existence | What an operator can change | What is refused, on purpose |
|---|---|---|---|
| `command` | **Code.** One `@Component` implementing `CapabilityHandler`, one entry in `ExpertGraph.CAPABILITIES`, and every fact it publishes registered in `SqlFactVocabulary`. | Enable / disable, and a note saying why (`eap.capability_setting`). | Creating or deleting. The set of published facts is a contract every rule pack depends on, so it must arrive through review rather than a form. |
| `cli` | **Code** for the command line, arguments and facts; **configuration** for the executable's location. | Override the binary (a name or an absolute path, `eap.cli_channel`), enable / disable, and run an explicit probe. | Changing the command or its arguments, and adding a new CLI capability. Those change what the capability *means*. |
| `mcp` | **A registered server.** The operator records the location and the tool allow-list (`eap.mcp_server`); the tools are the server's, not the platform's. | Register, edit, enable, trust, allow-list tools, delete, probe the transport. | A manifest naming a server into existence, and treating "registered" as "available to every expert" (§ below). |
| `http` | Nothing yet — no handler, no management surface. | Nothing. The catalog reports zero instead of inventing a section. | A page with nothing to do. A kind gets a sub-page when it can be managed or has entries. |

The on/off switch is one concept for every kind (`eap.capability_setting`, `CapabilitySettings`), so
"disabled" never means two different things. Three properties of it matter:

- **Absent means enabled.** Settings are an opt-out: a capability nobody configured must be runnable,
  otherwise a fresh install would silently offer nothing. Failing closed is right for trust decisions
  (`McpServerRegistry`) and wrong for a switch whose default is on.
- **A capability an enabled expert runs cannot be switched off.** The attempt is refused with the expert
  list, exactly like deleting a rule pack or a knowledge base in use. Draft references block nothing —
  drafts do not run.
- **Disabled is not missing.** `CapabilityAvailability.DISABLED` is its own state, and a manifest
  referencing a switched-off capability is rejected with *能力 X 已在平台停用…请在能力目录中重新启用*.
  Reporting it as "未实现的能力" would send the reader hunting for a bug instead of flipping a switch
  back. The expert editor's node picker excludes disabled capabilities and lists what it excluded, for
  the same reason.

CLI channels have one more property worth stating, because it is the difference between a cosmetic
setting and a real one: **the override is live.** `GitCapability` / `RipgrepCapability` take a
`Supplier<String>` for their binary and resolve it per execution, so changing the channel does not
require restarting the backend. Nothing is executed while rendering a page — `LocalBinaries` is a pure
lookup. The one place a binary is run for a management question is `POST
/api/capabilities/{name}/cli/probe`, which runs `<binary> --version` with a short timeout, as an
argument array, and redacts and truncates the output; a `PATH` lookup cannot tell "installed" from
"installed but broken".

MCP registration is validated at the source rather than at first use: a server id and a tool name both
end up inside the capability id `mcp.<server>.<tool>`, whose shape `ExpertGraph` validates, so
registration enforces the same charset (lower case, digits, `_`, `-`) and rejects a name that would only
fail later. An endpoint containing what looks like a credential is refused as well — the platform does
not store tokens, and a location is not a secret store.

### Expert-scoped capabilities are never enabled globally

This is the one place where "it is just another capability" is actively dangerous, so it is a scope
rather than a convention.

An MCP server keeps state per connection: a session id, cursors, negotiated capabilities, and the
identity it was opened for. If the platform registered such a tool "for everyone" — the way it
registers `sql.parse` — then two experts calling it would be served from the same session. Expert B's
call could land in expert A's state and A's authenticated context, a cursor half-consumed by A would
skip rows for B, and the audit trail would attribute both to whoever opened the connection. Routing
around that by "being careful" does not hold; the four rules below do, and each is enforced in code
and pinned by a test:

| Rule | Where it is enforced |
|---|---|
| A tool is only known if an operator registered its server, **enabled** it and **trusted** it, and only on the server's tool allow-list. A manifest cannot conjure a server by naming it. | `McpServerRegistry` (`eap.mcp_server`), `ExpertGraph.validate` |
| An expert must declare the tool in `mcpTools`; the declaration is the authorisation, and activation writes it as a grant. A node using an undeclared tool is rejected. | `ExpertGraph.validate`, `ExpertDefinitionService.activate` (`eap.expert_mcp_grant`) |
| The run-time lookup is scope-aware: even with the handler registered, `resolveFor` returns nothing for an expert that did not declare it. | `CapabilityHandlerRegistry.resolveFor` |
| A call runs in a session owned by exactly one `(execution, expert, server)` triple, is never handed to another expert or run, and is closed when the execution ends — including when it fails. | `McpCallScope`, `McpSessionRegistry`, `ExpertExecutionService` `finally` |

Naming follows the same logic: the capability id is `mcp.<server>.<tool>`, so two servers publishing a
tool with the same name can never collide and an operator can always tell which server a node would
call. The console renders the distinction (`平台级` / `专家级`, `globallyRunnable`, the server list, the
authorisation block in the expert editor) instead of offering every name in one flat picker.

```jsonc
// expert manifest — the only way to reach an MCP tool
{ "mcpTools": ["mcp.registrydb.query"],
  "steps": [ { "id": "parse", "capability": "sql.parse", "required": true },
             { "id": "query", "capability": "mcp.registrydb.query", "required": false } ] }
```

Rejection messages, verbatim:

> 流程节点 query 使用了专家级能力 mcp.registrydb.query。MCP/远端工具不会在运行时全局启用，必须由本专家在清单中显式声明授权：`"mcpTools": ["mcp.registrydb.query"]`，缺少声明时该节点不会执行，也不会因为"平台注册过"就对所有专家生效。

> mcpTools 声明的工具未在任何已启用并信任的 MCP 服务器中发布：mcp.unknown.query。请先在平台登记该服务器及其工具白名单；清单不能凭名字让一个服务器存在。

**Not implemented yet.** There is no MCP client, so no tool is registered and the catalog honestly
reports zero. What exists is the contract above: the registry, the scope-aware dispatch, the grant
table and the session isolation. A handler added later inherits all of it by declaring
`kind() = MCP`, and cannot accidentally become globally runnable.

### An expert must contain the nodes its rule packs need

The pack declaration above is only half of the contract; the graph is the other half. `ExpertGraph`
resolves every referenced pack to the capabilities it needs and requires the manifest to contain a
node for each:

> 规则包 X 需要能力 Y 来产出它所依赖的事实，但流程中没有对应节点；缺失时该规则包的这些规则永远不会命中，请添加对应能力节点或从清单中移除该规则包。

This runs at save and at activation (`ExpertDefinitionService.validateGraph`, `POST /api/experts/validate`),
so the reference cannot be saved in the first place. Concretely, attaching the shipped
`sql-snapshot-evidence` pack — which reads plan, schema and index facts — to an expert that only has a
`sql.parse` node is rejected until the graph provides the producers:

```json
{ "steps": [
  { "id": "parse",  "label": "解析 SQL",     "capability": "sql.parse",            "required": true  },
  { "id": "schema", "label": "读取表结构",   "capability": "database.schema.read", "required": false },
  { "id": "index",  "label": "读取索引",     "capability": "database.index.read",  "required": false },
  { "id": "plan",   "label": "读取执行计划", "capability": "database.explain",     "required": false }
] }
```

The example above names no rule packs, so it has no capability requirements to satisfy — but as soon
as `"rulePacks"` is non-empty, the two lists must line up.

**Declaration is not the same as execution.** An optional node that did not run (no snapshot supplied,
or a CLI whose binary is missing) leaves its facts unproduced. Judgement therefore runs *after* the
whole graph, over the accumulated fact base, and `RuleEngine` reports the affected rules as **blocked**
rather than as clean:

```jsonc
"blockedRules": [ { "rule": "plan.seq_scan",
                    "missingFacts": ["plan.seqScan", "plan.nodeCount"],
                    "missingCapabilities": ["database.explain"] } ],
"ruleCapabilities": [ { "id": "sql-snapshot-evidence",
                        "required": ["sql.parse","database.explain","database.schema.read","database.index.read"],
                        "met": false, "missing": ["database.explain"] } ],
"executedCapabilities": ["sql.parse", "database.schema.read"]
```

The summary says it plainly — `…；另有 N 条规则因所需能力未执行而未能判定，结果不完整。` — and the executor
promotes the run to `partial` with an explicit advice line per blocked rule, because a rule that could
not be judged must never be counted as a rule that passed. `rulePackRequirements` /
`executedCapabilities` are returned on every analysis so the console can show which capabilities
actually backed the result.

## 4. Knowledge bases

A knowledge base is a named collection of documents, chunked on ingest and searched locally.

- **Storage.** `eap.knowledge_base` → `eap.knowledge_document` → `eap.knowledge_chunk`, plus
  `eap.expert_knowledge_grant` for access. Chunks keep a SHA-256 of the source content.
- **Retrieval.** PostgreSQL full-text search (`simple` configuration) combined with local keyword
  matching, including Chinese bigram segmentation via `KnowledgeRepository.terms`. There is **no**
  vector retrieval in the current phase — see [environment.md](environment.md).
- **Authorization.** Deny by default. `knowledge.search` reads only the bases granted to the running
  expert; no grant means no query is issued at all. Only excerpts of granted documents are returned,
  always with `knowledgeBase` and `source` so a claim can be traced.
- **Secrets.** Documents whose title or content looks like a credential or JDBC URL are rejected on
  write, and every retrieved excerpt is passed through `SensitiveData.redact` before it reaches the
  response, the console or a model prompt.
- **CRUD.** `GET/POST/PUT/DELETE /api/knowledge`, `GET/POST/DELETE /api/knowledge/{id}/documents`,
  `GET /api/knowledge/search`. Deleting a knowledge base that an enabled expert still references is
  refused.

## 5. What must stay in code, and why

Fact extraction is code. Parsing SQL is not configuration, and pretending otherwise would be worse
than the problem it solves. The boundary is enforced, not merely documented:

- `SqlFactExtractor` is the **only** place SQL structure is interpreted, and it emits facts only.
- `SqlFactVocabulary` declares every fact, **including which capability produces it**; a test fails if
  the extractor produces an undeclared fact, if a published fact is not declared, and if a declared
  fact's producer does not match the capability that publishes it. `CapabilityContext.publish` refuses
  an undeclared fact at run time as well, so a typo cannot create a phantom fact.
- `CapabilityHandlerRegistry` owns capability dispatch; a test fails if the registry and
  `ExpertGraph.CAPABILITIES` disagree, and if the descriptors' declared `facts` and the published
  facts disagree.
- A test proves a rule pack authored entirely inside the test — with an id that appears nowhere in
  `src/main/java` — still changes the findings. Hard-coding a rule back into the analyser breaks it.
- A test proves a cross-capability rule fires only when its producers actually ran, and is reported as
  blocked when they did not.

Anti-patterns that this design exists to prevent:

| Don't | Do |
|---|---|
| `if (expertId.equals("sql-expert"))` | Let the expert be a normal `expert_definition` row (`builtin = true`) |
| A Java `switch (capability)` in the executor | Register a `CapabilityHandler` bean |
| Severity chosen by a Java conditional | `severity` / `severityWhen` in the pack |
| A Chinese message string in Java | `evidence` / `suggestion` in the pack |
| A threshold constant in Java | `policy` in the pack |
| A rule that quietly never fires because its capability was not in the graph | `requires.capabilities` in the pack, checked against the graph and reported as a blocked rule at run time |
| "Report all capabilities" so the UI can hard-code groups | `kind` / `describe()` / `availability()` declared by the handler |
| Registering an MCP tool as a platform capability so every expert can call it | `kind() = MCP` → expert scope: declared in `mcpTools`, granted on activation, resolved per expert, session per execution |
| One shared MCP session, "because it is faster" | `McpCallScope` + `McpSessionRegistry`: a session belongs to one `(execution, expert, server)` and is closed with the run |
| A form that creates a capability, or a second "enabled" flag per kind | Capabilities are registered in code; the one switch is `CapabilitySettings`, and the CLI page owns only the binary's location |
| Rendering a capability as runnable because it is "probably installed" | `availability` is a declared, four-valued state; a capability the operator switched off is `disabled`, not `available` |

Shipped experts and rule packs are still shipped as configuration: an expert row is seeded from
`experts/*.json` by `BuiltinResourceSeeder`, and a packed rule set is loaded from `rules/*.json`. Being
built in makes them read-only and id-reserving — copy one to customise it, exactly as you would fork
a template.

## 6. Current gaps

Honest status, so nobody reads more configurability into the code than exists:

- **`SqlMetadataInspector` is only half migrated.** It now publishes facts (`schema.loaded`,
  `schema.tableCount`, `schema.unresolvedColumn`, `schema.typeMismatch`, `index.loaded`,
  `index.count`, `index.uncoveredJoinColumn`, `index.leadingColumnMatch`) and a shipped pack
  `rules/sql-snapshot-evidence.json` judges them, including cross-capability rules over SQL shape +
  snapshot + plan. The remaining Java is the *advice strings* it still returns alongside those facts
  (`Inspection.advice()`), which duplicate what the pack says. Removing them is the last step.
- **`DeterministicTaskPlanner` is still hard-coded.** Keyword → capability mapping for generic tasks.
- **There is no MCP client yet.** The scope, registry, grant table, server-management API and
  session-isolation contract are implemented and tested (§3), but nothing speaks the protocol:
  `eap.mcp_server` is empty on a fresh install, the `mcp` kind counts zero, and any `mcpTools`
  declaration is rejected because no server publishes the tool. Registering a server does list its
  declared tools in the catalog — marked `registered: false` and `尚未接入`, since a catalog entry
  without an implementation must not look runnable. `McpSessionRegistry.McpSession` is the seam a
  client fills, and `McpServerService.probe` reports `verified: false` rather than pretending the
  allow-list was discovered.
- **Availability probing covers `cli` only.** `LocalBinaries` answers "is this binary there" — it
  cannot tell whether the binary works (that is what the explicit probe is for), and there is no
  equivalent check for a declared-but-unreachable MCP server or HTTP endpoint. A server's
  `enabled`/`trusted` flags are operator assertions, not probes.
- **CLI channels cannot carry extra arguments.** `eap.cli_channel` stores a binary location and
  nothing else, deliberately: appending flags would change what the capability means while looking
  like configuration, and facts are produced by reviewed code. A capability that needs different
  arguments is a different capability.
- **A capability switch survives a manifest edit only as a refusal.** Disabling is blocked while an
  enabled expert runs the capability; if the state changes behind the platform's back (a direct row
  edit, a restored backup), the run fails with *能力 X 已在平台停用* rather than a mysterious node
  error.
- **Rule pack versioning is a revision counter, not a content-addressed history.** Diffing two
  revisions is not yet possible.
- **Knowledge ingest is single-shot.** There is no re-index or embedding-version migration path until
  [roadmap.md](roadmap.md) Phase 10.

## 7. Extending the platform

A new deterministic capability, in full:

```java
@Component
public class MavenTestHandler implements CapabilityHandler {
    private static final String SHIPPED_BINARY = "mvn";

    @Override public Set<String> capabilities() { return Set.of("maven-test"); }
    @Override public CapabilityKind kind() { return CapabilityKind.CLI; }
    @Override public CapabilityAvailability availability() {
        return LocalBinaries.resolve(channels.binaryFor("maven-test", SHIPPED_BINARY)).isPresent()
                ? CapabilityAvailability.AVAILABLE : CapabilityAvailability.MISSING_BINARY;
    }
    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor("maven-test", kind(), "运行模块测试",
                "对指定模块执行 mvn test，参数以数组传入；不部署、不发布、不访问网络仓库以外的资源。",
                List.of("module"), List.of("读取当前工作空间"), "ProcessExecutor · mvn",
                SHIPPED_BINARY,                   // declares the executable, so the CLI page can manage it
                List.of(),                        // no facts: this capability contributes evidence, not facts
                List.of("exitCode", "stdout"), false));
    }
    @Override public NodeResult handle(CapabilityContext context) { /* argument arrays only */ }
}
```

Nothing else changes: the executor looks handlers up by name, `ExpertGraph` validates against the
registry, and both `/api/capabilities` and the console pick the new capability up — including its kind
group, its declared metadata, its availability, its on/off switch in the catalog, and (for a `cli`
capability that declares a `binary`) its own channel entry where an operator points it at this
machine's executable. This is the capability plugin boundary that [roadmap.md](roadmap.md) Phase 7
delivers; adding the handler plus its one declaration in `ExpertGraph.CAPABILITIES` is the whole
change. There is no catalogue API that creates a capability, and that is not an omission: see §5.

**If the new capability publishes facts**, two more steps are mandatory, and both are enforced:

1. declare each fact (with `producedBy = "maven-test"`) in `SqlFactVocabulary`, and list the same keys
   in `describe().facts()` — a mismatch fails a test;
2. any rule pack that references those facts must list the capability in `requires.capabilities`, and
   any expert referencing that pack must contain a `maven-test` node, or validation refuses it.

That is deliberate friction: it is the price of never again shipping a rule that silently cannot fire.

**If the new capability talks to an MCP server**, declare `kind() = MCP` and nothing else is needed to
get the safe behaviour: the scope becomes `expert`, the catalog stops calling it globally runnable, a
graph node using it requires an `mcpTools` declaration, activation records the grant, and the call must
obtain its session from `McpSessionRegistry` with a `McpCallScope` built from
`CapabilityContext.executionId()` and `expertId`. The registry will refuse a session opened outside an
execution, refuse a call made on behalf of another expert, and close everything when the execution ends.

