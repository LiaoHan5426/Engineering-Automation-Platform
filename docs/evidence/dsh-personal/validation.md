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

The final aggregates are complete. The PR remains a draft while submission and review are finalized; the explicitly recorded baseline and platform limits remain.

## Limits

Earlier Forge Host Git/lens suites retained 20 five-second timeouts after a targeted retry (147 of 167 cases passed). A representative case also times out on the independent React baseline under the same limit; that control does not prove the cause of every timeout. These Host cases remain unverified under the configured budget.

Existing Session release-cancellation and Inspector teardown diagnostics were retained rather than suppressed. Passing browser assertions does not mean that every diagnostic stream is empty.

Repository automation currently exposes no GitHub Actions workflows or PR checks. Local validation therefore supplies the build and test evidence; no remote CI success is claimed. Human review and merge remain separate.

Actual matched screenshots and revision details are recorded in [the visual evidence](README.md).

## Remaining demonstration prerequisite

No real-model GIF has been recorded. The repository recording workflow requires a real model round plus `ffmpeg` and `ffprobe`; neither media executable is available on PATH in this worker. A normal credentials file exists, but authenticated model access has not been verified and no credential value was read. Actual application Before/After captures and keyless browser tests are available; they are not substituted for a real-model demonstration. This leaves the handoff incomplete under that recording requirement.
