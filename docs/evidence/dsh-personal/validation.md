# Native Vue migration verification

This record describes the independent `dsh-personal` application. It does not establish EAP backend integration or user acceptance.

## Earlier production checkpoint

The following table records the checkpoint before the final static and fixture cleanup. Updated evidence follows below; earlier aggregate checks do not validate subsequent changes.

Commands run from `dsh-personal` with the installed Vite+ CLI:

| Command or coverage | Result |
| --- | --- |
| `vp run build:artifacts` | Eight gates passed in 25.41 seconds; 395 Client artifacts and three public values recorded. |
| `vp run build:check` | Host and Vue Client aggregate checks passed in 10.23 seconds after artifact generation. |
| Composer editability and editor-focus unit suites | Ten tests passed, including initial/deferred root publication and accepted-echo ordering. |
| Original workspace-management, chat-scroll-contract and workspace-recency browser suites | All 35 tests passed in 110.63 seconds with normal configuration and unchanged assertions/goldens. |
| `vp run test:docs` | All 21 read-only documentation gates passed in 16.14 seconds. |

The editor applies its DOM editability gate after transcript commit and before publishing its root to synchronous Lexical listeners. Changing editability does not rebind the root. The previous initial-focus failures are covered by real browser verification; the large-input case remains within its original 2px reversal limit.

The recency fixture advances a page-owned logical calendar between completed actions. Native timers, animation frames and Vue event guards are unchanged. Both original goldens and all 24 assertions pass normally and after a probe-only native 35-second delay; the preceding real-time clock fails the same delay. Separate actual Vue controls verified that existing listeners receive the event while a listener attached during that event is rejected until the next action.

## Browser coverage across interrupted runs

Host restarts interrupted the wider replay. Completed file results were retained, and only unfinished or failed files were resumed. Results below use the latest complete result for each file, rather than adding overlapping runs:

- 250 files and 1,100 tests covered.
- 1,070 tests passed; one failed; 29 were skipped by their existing conditions.
- The final remaining segment ran for 599.24 seconds: 147 files passed, one failed and four were skipped; 306 tests passed, one failed and 13 were skipped.

This is combined coverage, not a single all-green run. Earlier retained successes predate the final root-publication ordering change; the directly affected complete workspace and chat suites were rerun afterward. Skipped platform/opt-in cases are not claimed as validated.

The remaining failure is `schedule-phone.e2e.ts`, the French weekly editor at an 800px viewport: the original zero-overflow assertion detects 1px horizontal overflow. The independently built fixed React baseline reproduces the same failure, geometry and styles under the same browser. No CSS, golden or assertion tolerance was changed to conceal it.

## Final cleanup verification

On November 17, the complete type-aware lint passed across 7,301 files and 90 rules with zero diagnostics. The refreshed artifact build passed all eight gates in 32.40 seconds, recording 395 Client artifacts and three public values. The subsequent Host aggregate passed; the Client aggregate exposed test-only module-augmentation identity and sidebar fixture narrowing errors. After those corrections, both final aggregates passed: Host in 9.65 seconds and Vue Client in 47.56 seconds (47.57 seconds total).

Against those refreshed artifacts, eight actual browser suites passed in 374.75 seconds: 95 tests passed and four retained their existing skips. These cover chat scrolling, workspace management, model-menu observation, plugin management, document previews, right-sidebar interactions, bonus notices and the Vue Host smoke scenario. This focused run supplements the historical coverage above; its counts are not added to that coverage.

The hygiene run passed 23 of 25 gates. Its unknown-cast gate was subsequently rerun successfully after pruning retired fingerprints: 1,194 existing assertions remain, with no added fingerprint or count increase. The vendor gate initially encountered deleted generated files still present in the index; after their verified deletions were staged, only four pre-existing token residues remained. All four files and the checker are byte-identical to the fixed React baseline, and both checkers report the same four files/six lines. The flagged `cordis` values are product preset IDs, not package imports; neither historical fixtures nor the checker were changed to hide them. The domain graph's 86 reported edges are also unchanged from the fixed baseline, with no added or removed edge.

Documentation initially passed 19 of 21 gates. Both failures have been corrected and independently rechecked: 596 primary type-equivalence blocks and 596 derivatives pass, and all 436 English package summaries meet the length limit. Both edited bilingual README pairs pass pairing checks. No gate configuration, assertion tolerance or golden was relaxed.

The broader `vp run doc-sync` subsequently passed 38 of 43 gates. Its five stale generated outputs were regenerated and their owning checks passed: API and slot catalogs changed only displayed type formatting, package listings reflect Vue descriptions, and persistence catalogs changed source locations only. All 66 persistence root digests remain unchanged and match 25 history records. Because inspection providers consume the generated text at runtime, a fresh complete `vp run build` followed: all ten gates passed in 25.07 seconds, with 395 Client artifacts and three public values. The catalog text changes do not invalidate the earlier UI interaction results.

The final aggregates are complete. PR #8 has merged; baseline and platform limits remain recorded separately.

## Limits

Earlier Forge Host Git/lens suites retained 20 five-second timeouts after a targeted retry (147 of 167 cases passed). A representative case also times out on the independent React baseline under the same limit; that control does not prove the cause of every timeout. These Host cases remain unverified under the configured budget.

Existing Session release-cancellation and Inspector teardown diagnostics were retained rather than suppressed. Passing browser assertions does not mean that every diagnostic stream is empty.

Repository automation currently exposes no GitHub Actions workflows or PR checks. Local validation therefore supplies the build and test evidence; no remote CI success is claimed. Human review and merge remain separate.

Actual matched screenshots and revision details are recorded in [the visual evidence](README.md).

## Current OpenAI acceptance — 2026-11-17

Migration implementation and real-model demonstration are complete. User acceptance remains separate. The user's instruction defers verified upstream issues; it does not turn failures or skips into passes.

The candidate used an isolated DSH_HOME with the current desktop OpenAI route, model openai/gpt-6-astra, and the existing credentials plugin file reference. No credential value or bootstrap token was exported. The prepared worktree's application source matched the main checkout before testing.

Actual UI requests returned DSH_OPENAI_MIGRATION_OK and DSH_TOOL_OK:323. The trajectory independently shows pwsh executing node -p "17*19" with output 323. A third real request returned DSH_NATIVE_CAPTURE_OK; reload restored the conversation. Edge 141.0.3537.71 captured ten native frames during that request. The [GIF](openai-validation.gif) combines those frames with before/after and tool evidence; it is sampled recording, not a continuous video. Blank DOM-rendered captures were replaced.

The [Forge review](forge-review.json) preserves exact failures and skips; [source comparison](forge-source-comparison.json) verifies 21 files against fixed upstream blobs. Five-second execution: 46 passed, 6 failed, 19 skipped, 43.37 seconds. Thirty-second diagnostic: 51 passed, 1 failed, 19 skipped, 152.67 seconds. The remaining timeout is the HEAD/index/first-commit case. This 71-case run does not reconstruct the historical 167-case roster. Platform skips retain their original conditions.

Maintenance documentation: bilingual records generated and Chinese testing link corrected. vp run test:docs passed all 21 checks in 44.66 seconds. vp run doc-sync completed 41/43 in 394.02 seconds; its pairing failure was subsequently fixed and passed in test:docs. The remaining documentation-site failure is EPERM while creating a symlink in scripts/project-doc-site.spec.ts:160 on Windows. No assertion or test budget source was weakened. Earlier build and browser results above remain the evidence for unchanged production code; this round does not claim a new full-suite pass.

Final static rerun: vp run lint checked 7,301 files with 90 rules and found one redundant type assertion in the ChangesTab test helper. Removed that assertion and its obsolete comment; no production code or behavioral assertion changed. Focused lint passed with zero warnings/errors (5.8 seconds); the existing ChangesTab suite passed 149/149 (39.65 seconds). vp run build:check passed both Host and Vue Client aggregates in 128.35 seconds after the edit. The full lint run remains recorded as one failure followed by a focused fix verification, not a second full green run. The negative stale-tab test emitted a Vue render warning; no diagnostic was suppressed.

## Vite+ Pack migration — 2026-11-17

Module bundling now uses package-owned Vite+ pack configurations. Root selection keeps absolute package working directories, replaces explicit entry/format arrays, appends only plugins, and removes empty-string disabled faces before Pack can auto-discover src/index.ts and overwrite Host outputs. JavaScript decorators are lowered as well as TypeScript decorators. Inspector publication has bounded Windows rename retries; NodeNext consumers use Windows junctions. Preview scripts use vp pack.

| Executed command or coverage | Result |
| --- | --- |
| `pnpm run build:artifacts` | 8 passed, 0 failed/skipped in 65.98s after disabled-face selection was fixed. |
| `pnpm run build:check` | Host and Client passed in 25.72s after those artifacts. A final aggregate run passed both gates in 28.08s after extracting the identical selector and adding its tests. |
| Plain Node import of packages/core/session/lib/index.js | Session imported, exit 0 after both Host and Client passes. Earlier green builds had retained decorators and failed this probe; their runtime outcome is superseded. |
| Chrome Vue Host and DevTools frontend browser cases | 2 files, 2 tests passed in 22.91s, using DSH_PLAYWRIGHT_EXECUTABLE_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe with the normal vitest.web.config.ts. Covers Vue factory/HMR/disposal and authenticated prebuilt DevTools delivery. |
| `pnpm exec tsx scripts/verify-node-next-types.ts` | 391 workspace declaration APIs compile under NodeNext. |
| Pack configuration / purity / externals | Earlier 79 passed; final selector suite 7 passed, including two real Pack cases preserving Host bytes while producing Client output. Counts overlap and are not added. |
| Decorator Pack, plugin and worker regressions | 30 passed, including actual js/mjs/ts Pack outputs executed under plain Node and decorator method/initializer semantics. |
| Build orchestration / consumers | 179 passed, 5 skipped; separate RRULE/Client Host related run: 184 passed. |
| Dependencies / static import review | 101 packages passed dependency policy; 7,722 files scanned; 335 multi-level relative-import candidates had no normalized cross-package escape. Computed paths are not covered by that static conclusion. |
| Inspector source/publication regressions | 43 passed; publication ran twice successfully: 768 files, 22,750,474 bytes. Actual lock contention was not reproduced. |
| Focused lint / whitespace | Config/publish, runtime, selector and NodeNext checks passed with zero diagnostics; git diff --check passed. |

Full doc-sync ran 40/43: old config links and stale workflow guest output were then fixed and their checks passed; the Windows documentation-site symlink case remains failed. Pairing, upgrade-guide and markdown-link checks passed after repairs. The earlier full GUI run retained unrelated Windows symlink, timeout and CSS-source assertion failures; no full GUI or full doc-sync green result is claimed. Official Chromium download timed out and was stopped; the two browser cases used installed Chrome without weakening assertions. This validation round did not change EAP backend integration or establish user acceptance; no commit or push was created during that round.

On 2026-11-18, the user requested workspace cleanup verification followed by commit and push. Removed 45 untracked migration logs and the temporary Node import probe (2,660,785 bytes); retained production source, regression tests and formal evidence. Existing passing build, NodeNext and browser evidence above remains applicable because this cleanup did not change implementation. Retained Windows doc-sync and GUI failures remain separate from technical completion. Git commit and remote equality are verified during publication.
