# Single expert knowledge context for Chat

This slice resolves **one enabled expert's knowledge sources**, not its DAG, Skill/MCP instructions or tools. It does not change model connections, Git/CLI/MCP grants, migrations or workspace authority.

## HTTP contract

- Existing `GET /api/experts` supplies identity, enabled state and revision.
- `POST /api/ai/expert-context/preview`: exact body `{ "expertRef": { "id": "expert-id", "revision": 2 }, "query": "question" }`. Read-only retrieval; no conversation creation, model call, tool registration or persistent write.
- Send uses optional `context.knowledgeExpertRef` with the same exact identity object, only in `mode: "chat"` with `toolMode: "none"`. A knowledge selection with any other string tool mode is rejected with `EXPERT_CONTEXT_MODE_UNSUPPORTED`, even when expert authorization and Git availability are valid; no model/tool call is made. Omit the reference to remove knowledge. Explicit null, partial objects, extra fields, nonintegral/string revisions, nonpositive revisions and code mode are rejected. IDs use the existing lowercase alphanumeric/hyphen form, maximum 120 characters; no normalization.
- Preview query and the send's original message must be nonblank and at most **500 Java/JavaScript UTF-16 code units** when knowledge is selected. No trimming or silent truncation. Files/instructions are not part of the retrieval query. The existing handler no longer appends an empty table suffix.
- Result: `{expertRef,status:"ready"|"no_matches",references:[{id,source,knowledgeBase,excerpt,retrievalMode}]}`. At most 5 references; excerpt ≤1200, source ≤500, knowledgeBase ≤200, retrievalMode ≤40 code units. Existing repository redaction is retained and bounded output is redacted again. Optional base/document IDs are not emitted in this slice.
- Send response adds `knowledgeContext: <result>|null` and `knowledgeMemoryCleared: boolean`. References describe the retrieved material prepared for the model, **not proof that the model cited or used it**. Empty retrieval is an explicit `no_matches`, not fabricated evidence.

## Authority and concurrency

`KnowledgeExpertRef.parse` is shared by preview and send. Every send retrieves again; preview is not a grant or a cached request payload. Effective knowledge bases are manifest declarations intersected with `ExpertDefinitionService.knowledgeGrants`. An empty intersection is denied, never global search. Resolution uses the existing `CapabilityHandlerRegistry.resolveFor(manifest,"knowledge.search")`, `KnowledgeSearchHandler` and `KnowledgeRepository.searchAuthorized`.

The resolver's short transaction takes `FOR SHARE` on the exact expert row, preserving identity/enabled/revision/manifest against the existing activation/draft row writers while reading persisted grants and knowledge. A second row/grant/settings observation fails closed on changes observed during retrieval. Queries use parameters; no database/schema creation or new migration is required.

This is a **request-time snapshot**, not a lock held across the external model. Knowledge content is the snapshot of the retrieval statement; authorization is checked through the end of the resolver transaction immediately before prompt composition/model submission. Updates/deletions/revocations committed before the next send are observed by that send. Changes after a statement/snapshot has been read may not cancel the already-prepared/in-flight call. No claim is made to recall data already sent to a provider. Operator activation/draft changes waiting on the shared row lock commit after that resolver completes. The model is never called inside that transaction.

## Memory policy

Reuse `AiConversationRegistry.exclusive` and its shared Spring AI `ChatMemory`. After a conversation first selects knowledge, **every later send attempt clears its full model memory before parsing the next payload**, even when selection is removed, an expert/revision changes, retrieval is empty, authorization is revoked or the request is malformed. The first knowledge selection also clears prior memory before authorization/model work. This deliberately sacrifices multi-turn memory for that conversation until a new conversation is opened; it also removes derived assistant text, not just reference snippets.

The entire parse/check/retrieval/model/proposal path holds the existing exclusive turn. Concurrent send, model rebind or deletion receives `CONVERSATION_BUSY`; a rejected competing request cannot clear an active turn's memory. Success and expected send rejection responses carry `knowledgeMemoryCleared`. Busy/unknown-conversation and browser-origin/content-type guard failures happen before a turn is acquired and do not claim a clear.

Retrieved JSON is appended to the **user** message as untrusted task material, never substituted into system instructions. No expertise selection changes tool authority or grants filesystem/CLI/MCP/DAG execution.

## Error codes

Expected errors remain `ProblemDetail.detail` (not a new envelope):

| HTTP | Detail |
|---|---|
| 400 | `INVALID_EXPERT_CONTEXT` (identity/request shape, invalid mode, blank query) |
| 400 | `EXPERT_CONTEXT_MODE_UNSUPPORTED` (knowledge selection with non-`none` string tool mode) |
| 400 | `EXPERT_CONTEXT_QUERY_TOO_LARGE` |
| 404 | `EXPERT_CONTEXT_NOT_FOUND` |
| 409 | `EXPERT_CONTEXT_STALE` (includes identity/revision disagreement) |
| 409 | `EXPERT_CONTEXT_DISABLED` |
| 403 | `EXPERT_CONTEXT_NOT_AUTHORIZED` |
| 403 / 503 | `EXPERT_CONTEXT_CAPABILITY_UNAVAILABLE` (disabled/missing or failed adapter/service) |
| 503 | `EXPERT_CONTEXT_UNAVAILABLE` (send database failure, no database detail exposed) |

Existing `INVALID_TASK_CONTEXT`, `INVALID_CHAT_REQUEST`, `CONVERSATION_BUSY`, model/target/tool errors and `CAPABILITY_SETTINGS_UNAVAILABLE` retain their meaning. Preview database errors retain the existing safe database error handler. When both stale and disabled, stale revision is reported first: reselecting an old catalog item is not silently repaired.

Send validation order is body/context/identity parsing → message and tool-mode field validation → knowledge/tool-mode compatibility → availability and knowledge resolution. Thus, with a valid context shape, a blank/non-string message, a message over 32000 code units, or missing/non-string `toolMode` returns `INVALID_CHAT_REQUEST` before retrieval or stale-revision checks. A malformed expert identity or code-mode selection is rejected earlier as `INVALID_EXPERT_CONTEXT`. Preview's blank/non-string query remains `INVALID_EXPERT_CONTEXT`; a valid send message over 500 but at most 32000 code units reaches the knowledge limit and returns `EXPERT_CONTEXT_QUERY_TOO_LARGE`. These rejections retain the existing memory-clearing policy.

## Verification

New tests: `KnowledgeExpertContextTest`, `ExpertKnowledgeContextServiceTest`, `ExpertKnowledgeChatTest`, `ExpertKnowledgePersistenceTest`, plus the HTTP preview contract in `AiChatApplicationTest`.

Persistence tests opt into `EAP_RUN_BOARD_PERSISTENCE=true`, read the existing configuration inside the test process without printing credentials, use the real local PostgreSQL retrieval and existing activation flow, and remove/read back only randomly identified fixture rows. They do not start/stop the application or contact a model. FakeChatModels records actual Spring AI prompts and asserts no retrieval transaction is held during model submission.

Full regression command from repository root:

```bash
EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test
```

Verified locally after the second contract review: the full command completed with **584 tests, 0 failures, 0 errors, 6 skipped** (578 passed). Both PostgreSQL fixture tests ran rather than skipped. Existing skipped gates were CLI integration, Codex configuration, real Codex smoke, prototype delivery integration, schema probe, plus a platform-dependent symlink check. Historical Surefire XML files were excluded when reconciling counts to current source classes and the completed invocation summary.

TDD evidence: the valid-authority/Git-available combination initially returned HTTP 200 instead of 400; the new rejection test then passed with zero model/tool calls. `ExpertKnowledgeChatTest` now passes 6 tests, including send validation ordering and clearing prior retrieved/derived memory after tool-mode rejection. The mock contract's 6 new counterexamples initially failed with wrong error codes/order; all 45 `expertContext.test.ts` cases now pass. `rtk proxy pnpm --dir frontend test run` passes **475 tests across 86 files**; frontend `typecheck` and `check:boundaries` pass. Full regression commands used a 600-second timeout and no live model gate.

Live provider/billing behavior, browser UI acceptance and adversarial model instruction-following are not established by these backend tests.
