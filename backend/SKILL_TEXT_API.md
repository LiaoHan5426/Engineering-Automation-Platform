# Skill text API (backend slice)

This is a bounded text subset, not full Agent Skills specification support. The backend never reads a submitted path, fetches Markdown links, extracts archives, runs scripts or grants tools.

## Routes and payloads

- `POST /api/skills/preview`: `SkillImportInput` → `SkillSnapshot`.
- `POST /api/skills`: `{input: SkillImportInput, expectedDigest: string, confirmed: true}` → stored `SkillSnapshot`.
- `GET /api/skills`: `{items: SkillSummary[]}`. Metadata SQL does not fetch raw text or resource bodies.
- `GET /api/skills/{id}/versions/{version}`: full `SkillSnapshot`.
- `POST /api/skills/{id}/versions/{version}/activation`: `{enabled: boolean, stateRevision: integer}` → `SkillSnapshot` with incremented revision (including same-state writes).
- `POST /api/skills/context/preview`: `{skillRef: SkillRef, resourcePaths: string[]}` → `SkillContext`; requires an enabled, exact current reference.

```text
SkillImportInput = {rawSkillMd, version, sourceLabel,
                   resources: [{path, mediaType, content}], requiredCapabilities: string[]}
SkillRef = {id, version, digest, stateRevision}
SkillSummary = {id, version, description, digest, enabled, stateRevision,
                sourceLabel, createdAt, dependencies: [{id, status}]}
SkillSnapshot = SkillSummary + {schemaVersion: 1, entry: 'SKILL.md', rawSkillMd,
                  instructions, resources, requiredCapabilities, scope, trust}
SkillContext = {skillRef, instructions, resources, dependencies}
trust = null | {operator, confirmedAt}
```

Preview has `enabled=false`, `stateRevision=1`, `createdAt=null`, `trust=null`; these are not a saved version or a trust statement. Persisted timestamps are ISO instants. Dependency status is `unknown | disabled | available`, diagnostic only (including expert-scoped capabilities); even `available` is not authorization. Unknown dependencies do not block ordinary chat advice.

All import fields and resource fields are required; extra fields, nulls, duplicate JSON keys, malformed types and silent coercions are rejected. JSON requests are capped at 200000 UTF-16 code units before parsing. The existing local-origin/host/JSON write guard also protects `/api/skills` posts. The guard uses Spring's decoded, matrix-free path segments (excluding the deployment context) rather than raw URI prefixes. API POST paths containing literal `;` or encoded `%3b`/`%3B` are rejected with HTTP 400 `PATH_REJECTED`, including `/api/ai` siblings and otherwise trusted local JSON requests. Encoded ordinary segments that Spring routes to Skill/chat still require the host/origin/JSON checks; prefixes, duplicate slashes and encoded semicolons are covered against actual MVC routing rather than assumed normalization.

## Parsing limits

- `rawSkillMd`: at most 16000 UTF-16 code units; must start immediately with `---` LF/CRLF, have a closing delimiter and nonblank body. Original text and body line endings are preserved.
- Frontmatter required `name` (1–64, lowercase ASCII alphanumeric segments separated by single hyphens) and nonblank string `description` (≤1024).
- Optional nonblank string `license` (≤200), `compatibility` (≤500), `metadata` (≤16 entries; nonblank string keys ≤64, string values ≤500). Retained in original `rawSkillMd`, not executable metadata.
- `allowed-tools` and all other unknown YAML fields are rejected. No YAML anchors, aliases, explicit tags, merge keys, duplicate keys, multiple documents or explicit document-end markers. SafeConstructor, depth ≤5, ≤160 parser events, ≤16000 code points.
- `version`: `major.minor.patch`, digits only, no leading zero except `0`, total ≤32. No `latest`, prerelease or build suffix.
- `sourceLabel`: nonblank, ≤200.
- Resources: ≤4; individual content ≤16000; `rawSkillMd` plus all resource content ≤24000. Empty resource content is permitted.
- Paths: ASCII only, ≤240, relative slash-separated segments; each segment starts with alphanumeric/underscore/hyphen, subsequent characters additionally allow dots. No `..`, backslashes, absolute/drive/UNC paths, empty segments or a segment equal to `scripts` case-insensitively. Suffix `.md`/`.txt` (case-insensitive) must match `text/markdown`/`text/plain` exactly. Paths are unique ignoring ASCII case; resource selection uses exact original case.
- Dependencies: ≤16 unique identifiers, each ≤120, pattern `[A-Za-z0-9][A-Za-z0-9._:-]*`.
- Reject NUL/unpaired UTF-16 in text. Reuse `SensitiveData` detection on original text, provenance, resource paths/content and dependencies; reject detected credentials, never redact/truncate before digesting. Shared detection/redaction includes case-insensitive Authorization/Proxy-Authorization Bearer values (plain or JSON-quoted, including structured header maps) and PEM private-key envelopes, including truncated envelopes. Raw Markdown, source labels and resource bodies reject these with `INVALID_SKILL_SECRET`; ordinary task-context markup, design-token CSS and public-key envelopes are retained.

Digest uses SHA-256 over fixed-order, 32-bit UTF-8 byte-length-prefixed strings: schema marker, server root scope, name, version, source label, raw text, resource count, resources sorted by exact path (path/type/content), dependency count, sorted dependencies. No arbitrary local paths are read. Scope derives from the already canonical process-bound `RuntimeWorkspace.root()`.

## Persistence and chat isolation

V18 creates only `eap.skill_version` (PK scope/id/version), with immutable content/provenance/trust enforced by a DB trigger; activation requires exactly one revision increment. V19 adds DB comments without changing the already applied V18 checksum. Save reparses and rehashes the submitted input in server scope; same digest/version returns the current saved state without changing activation or trust, different digest returns conflict.

`TaskContext.skillRef` and `skillResourcePaths` are optional; omitted resource paths means none. Explicit null, paths without a reference, nonimported selections or extra reference fields are errors. Skill is only supported in `mode=chat`, `toolMode=none`, and cannot combine with `knowledgeExpertRef`, `mode=code` or `taskRef`. It is not copied into `TaskContext.instructions` or system messages.

Send re-resolves the exact immutable version under a short DB snapshot/row lock. The lock/transaction ends before calling the model; disable cannot recall data already delivered to an in-flight provider. Selected material is appended only to the user message. No new capability registry or tool loop.

The existing conversation `exclusive()` and sticky sensitivity flag are reused. First valid Skill selection clears previous memory; all subsequent turns (ordinary chat, removal, version switch, disable, malformed/rejected request) clear old source and derived answers before parsing/resolution. A competing busy turn does not clear the active turn's memory. Responses add nullable `skillContext` and boolean `contextMemoryCleared`; `knowledgeContext` and `knowledgeMemoryCleared` remain compatible. ResponseStatusException ProblemDetails preserve both memory-cleared flags.

## Error codes

HTTP 400: `INVALID_SKILL_INPUT`, `INVALID_SKILL_VERSION`, `INVALID_SKILL_FRONTMATTER`, `INVALID_SKILL_BODY`, `INVALID_SKILL_RESOURCE`, `INVALID_SKILL_SIZE`, `INVALID_SKILL_DEPENDENCIES`, `INVALID_SKILL_SECRET`, `INVALID_SKILL_IMPORT`, `INVALID_SKILL_CONFIRMATION`, `INVALID_SKILL_DIGEST`, `INVALID_SKILL_REF`, `INVALID_SKILL_RESOURCE_PATHS`, `INVALID_SKILL_CONTEXT`, `INVALID_SKILL_ACTIVATION`, `SKILL_CONTEXT_MODE_UNSUPPORTED`.

HTTP 404: `SKILL_NOT_FOUND` (including another workspace scope).

HTTP 409: `SKILL_SCOPE_UNAVAILABLE`, `SKILL_DIGEST_MISMATCH`, `SKILL_VERSION_CONFLICT`, `SKILL_STATE_STALE`, `SKILL_REF_STALE`, `SKILL_DISABLED`, `SKILL_CONTENT_MISMATCH`.

HTTP 503: `SKILL_UNAVAILABLE` for Skill persistence/resolution failures.

Existing chat errors remain: malformed outer JSON/duplicate JSON keys, blank/oversized/nonstring message or absent/nonstring toolMode → `INVALID_CHAT_REQUEST`; malformed generic TaskContext → `INVALID_TASK_CONTEXT`; combined total model material limit → `TASK_CONTEXT_TOO_LARGE`. Identity/TaskContext parsing precedes basic send validation; valid Skill references with invalid basic send fields do not reach resolution/model. Browser guard errors (`PATH_REJECTED`, `HOST_REJECTED`, `ORIGIN_REJECTED`, `CONTENT_TYPE_REJECTED`) are shared by Skill/chat writes.

## Executed verification

Final security-fix invocation: `EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` (timeout 600 seconds), completed 2026-11-01 19:31:51 +08:00: **BUILD SUCCESS; tests run 647, failures 0, errors 0, skipped 6 (641 passed)**. Counts were reconciled from this invocation's 96 per-class results, not stale XML reports. PostgreSQL tests verified Flyway versions 18 and 19, the table comment, immutable-field trigger, concurrent CAS single-winner, scoped reload/idempotency, and real persistence → FakeModel user-material/memory boundaries.

Security TDD evidence: the real MVC context with production `WebConfiguration` CORS and mock services first reproduced three matrix-path writes returning 200 instead of rejection (5 tests, 3 failures); shared Bearer/PEM and Skill parser tests first failed 14 of 22 tests; structured Authorization detection separately failed 1 of 15 tests before its fix. Final targeted `AiBrowserRequestGuardRoutingTest`, `SensitiveDataTest`, and `SkillTextParserTest` ran 54 tests, all passing. Routing coverage includes the actual controller resolver, same-origin hostile Host, legitimate local JSON writes, `/api/ai` siblings, matrix/encoded segments, duplicate slashes, prefix lookalikes and deployment context. Synthetic credential probes are not echoed in assertions. The shared detector remains the parser's admission check; no controller `consumes` workaround or Skill-local credential regex was added.

Conditional skips remained in `BoardVerificationSourceTest`, `CliProgramIntegrationTest`, `CodexLocalConfigTest`, `CodexRealSmokeTest`, `PrototypeDeliveryAcceptanceTest`, and `DatabaseSchemaProbeTest`; these are not claimed as verified by this invocation. Existing code/prototype/knowledge regressions and both explicitly enabled gates ran. No paid model or external coding agent was invoked, no application process was started/stopped, no migration was manually run/repaired, no database was reset. The protected application configuration was not edited or inspected directly; persistence fixtures used the existing approved configuration loader.

Scoped static marker scan found no credential/shell-injection/unsafe-deserialization findings, and `git diff --check` passed. Independent review and frontend/user interaction acceptance remain the parent task's gate.

## Verification entry points

`SkillTextParserTest`, `SkillApiTest`, `SkillWiringTest`, `SkillPersistenceTest`, `SkillChatTest`, `SkillChatPersistenceTest`. Persistence tests require the pre-existing approved local PostgreSQL and `EAP_RUN_BOARD_PERSISTENCE=true`; they load existing configuration without printing credentials, never migrate/repair/reset, and clean only their randomly scoped fixture rows. FakeModel assertions prove user-vs-system placement and memory isolation, not paid-provider effectiveness.
