# Cookbook: synchronizing DSH Personal with upstream

English | [中文](sync-dsh-upstream.zh.md)

## Summary

This contributor tutorial prepares an upstream update for the repository copy while preserving native Vue behavior. Start with an existing Personal checkout, installed workspace tooling and a separate upstream Git checkout. The result is a reviewable candidate and evidence; the [migration plan](../../migration-plan.md) owns acceptance status. The installed DSH application is a separate deployment.

## Contents

- [Prepare](#prepare)
- [Compare](#compare)
- [Integrate](#integrate)
- [Validate and accept](#validate)
- [Record template](#record)

<a id="prepare"></a>

## 1. Fix the three inputs

Select the upgrade track first: a release upgrade uses explicit start and end tags; tracking master uses a fixed default-branch commit. A version tag and the merge that synchronizes its release branch back to master can have different trees. For release work, add `--mode release --release-base TAG_B --release-target TAG_U` to check the intended range; for master work, use `--mode master`. Resolve a reported `scope-mismatch` before treating additional master changes as required release work. Remote HEAD discovery selects the master track, not a release tag.

Use B = last fully accepted upstream commit, U = proposed upstream commit and P = Personal checkpoint. The [state file](../../upstream-sync-state.json) owns the accepted baseline: schemaVersion is 1; acceptedUpstreamCommit is B; acceptedPersonalCommit and acceptedRecord identify its acceptance evidence, or remain null for the historical import. Its pending entry records targetUpstreamCommit, personalBaseCommit and record for an unresolved candidate. A pending or partial candidate never advances B.

Run these Bash commands from the Personal root. Inspect status and preserve P before creating a candidate. The EAP origin remote is not the upstream DSH remote; a directory import creates no shared Git ancestry. Preserve a binary diff, staged changes and untracked sources when P is dirty: a worktree made from HEAD alone omits them.

```sh
set -eu
git status --short --branch
git rev-parse HEAD
pnpm exec tsx scripts/upstream-sync.ts --help
UPSTREAM_URL=https://github.com/deepseek-ai/deepseek-harness.git
pnpm exec tsx scripts/upstream-sync.ts --discover "$UPSTREAM_URL"
```

Discovery performs one git ls-remote --symref query and returns its symbolic ref and full commit. Save that output once and pin U to the returned commit; do not query HEAD again to populate another field. A failed query, empty response, detached or ambiguous remote HEAD stops the operation. The discovered result is neither no-change nor acceptance. An existing pending target must match U; resolve that candidate before selecting another target.

Prepare a separate, non-nested upstream checkout whose root contains both B and U. Obtain missing objects explicitly before the local planner runs. Preserve the [original inventory](../../source-inventory.json) and blob IDs; later upgrades use accepted state rather than rewriting historical input. Back up the candidate profile and persistent data separately from the installed application.

<a id="compare"></a>

## 2. Produce the complete read-only plan

Set UPSTREAM_DIR to the checkout root and TARGET_COMMIT to the pinned full U hash. The state path resolves from the command working directory and must exist inside Personal. The planner validates full commit objects and B ancestry of U, then emits JSON with B/U/P, commitCount, summary and every diff entry. It reads state and Git; it performs no merge, install, source update or acceptance write.

```sh
UPSTREAM_DIR=/path/to/upstream-checkout
TARGET_COMMIT=FULL_UPSTREAM_COMMIT
pnpm exec tsx scripts/upstream-sync.ts --personal . --upstream "$UPSTREAM_DIR" --target "$TARGET_COMMIT" --state upstream-sync-state.json
```

Capture stdout in a dated evidence file if required. For the first import only, replace --state upstream-sync-state.json with --initial to read source-inventory.sourceCommit. Alternatively pass --baseline FULL_ACCEPTED_COMMIT explicitly. Exactly one of these inputs is required; missing or malformed state never falls back to the inventory. The checked-in pending entry records a target awaiting acceptance and leaves acceptedPersonalCommit and acceptedRecord null.

A no-change result means B equals U: retain discovery and Personal evidence, then skip candidate creation, installation and product builds. update-available means different commits even when their trees match. The underlying comparison uses git diff --name-status -z --find-renames over the entire B/U range, without path filters. Count both rename paths. An API compare response limited to 300 files, a printed excerpt or a rename-free path list is not the complete comparison.

Planning disables implicit lazy fetch. A missing object, invalid UTF-8, truncated output, non-ancestor baseline, Git failure, 30-second per-command timeout or output beyond 64 MiB stops the plan. Fix the checkout or record the failure before retrying; never reinterpret a failed comparison as no-change.

The plan's `upgradeScope` compares both endpoint trees against the release tags and reports commit, file and line counts for both ranges. `incremental` reads workspace manifests from B/U to assign owners, direct changes, downstream impact, dependency batches and validation suggestions; it does not use manifests from an unrelated checked-out revision. Runtime, optional and peer dependencies precede consumers, cycles form one SCC batch, and dev dependency consumers appear separately as test impact.

Reconcile APIs, types and dependencies before their consumers. Independent work within a batch can run concurrently; consumers start once dependency interfaces are clear. Retain Personal customizations and evidence outside the B/U delta. A version manifest change does not require remigrating every source file in that package. Preserve both owners for renames and deletions.

Before expensive builds, run the [platform preflight](../../scripts/upstream-platform-preflight.ts) on the fixtures included in the plan:

```sh
node --import tsx/esm scripts/upstream-platform-preflight.ts --root . --platform win32 --plan PLAN_JSON
```

The preflight distinguishes filesystem paths, mention/clipboard protocol paths, JSON/ARIA strings and shell argv. Its `problem` and `review` findings identify demonstrated mismatches and review candidates, not passing tests. Run Bash examples in Bash; PowerShell uses different environment, quoting and redirection syntax. Prefer Node with structured argv for portable steps while retaining tests that exercise a specific shell.

<a id="integrate"></a>

## 3. Reconcile behavior in an isolated candidate

Create the candidate from the saved P, including preserved local changes, and retain B/U/P snapshots separately. When formatting dominates the diff, create derived B/U/P copies with the same formatter and options, then compare those copies. Keep raw Git output, original blobs and original snapshots unchanged; a formatting-only finding needs both raw and normalized evidence. Do not rewrite the actual historical checkout or inventory to simplify comparison.

Build one mapping row per changed entry; confirm paths in the current tree and use the [contract audit](../../contract-audit.md) to understand local decisions. An upstream TSX path may map to a Vue component, composable, selector or slot under a different directory. Map both ends of every rename and trace every deletion to its replacement or removal. Close imports, registrations, exports, tests, styles and documentation together; every complete diff entry needs an applied, deferred or not-applicable disposition with evidence.

| Change class | Integration rule |
| --- | --- |
| Host/core and shared APIs | Reconcile B/U/P and all consumers; directory membership does not establish unchanged behavior. |
| React components and hooks | Port behavior to mapped Vue ownership without restoring the replaced React runtime. |
| Build and dependencies | Use Vite+ Pack and existing build scripts; do not restore tsdown or a standalone vitest dependency. Reconcile manifests before the lockfile. |
| Session schemas and wire APIs | Update consumers, migrations and required persistence acknowledgements together. |
| Added, deleted and renamed modules | Close ownership, references, registration and replacement evidence for both old and new paths. |

The [Vue converter](../../scripts/upstream-vue-codemod.ts) handles the fixed case of known Ref selectors created in setup-returned render functions or computed getters. It defaults to dry-run with explicit hooks and files. `--apply` also requires each file's `--expect SHA256`, keeps an exclusive .bak original and checks content and hashes before writing. Whole React files, arbitrary hooks, slots and event semantics remain outside this converter; complex closures and render-local dependencies receive manual-review findings. Review its report and diff before applying supported rules:

```sh
pnpm exec tsx scripts/upstream-vue-codemod.ts --hook useAccount --hook useConnectorAccounts --file SOURCE_FILE
```

Resolve shared Host/API behavior before Vue consumers, then reconcile build configuration with its consumers. Preserve synchronous state changes, cancellation, stale-result protection, scope disposal, focus, drafts and session isolation. Adapt upstream tests to assert behavior with vite-plus/test. A textual merge or passing type check does not establish equivalent Vue interaction; any deferred applicable change leaves the candidate partial.

<a id="validate"></a>

## 4. Validate, accept or recover

Run focused behavior tests and positive/negative type checks in the candidate Personal directory. Reconcile the lockfile deliberately before a frozen install, and use the [testing policy](../testing.md) to select additional checks. The commands below describe acceptance preparation; record actual outcomes rather than assuming they pass.

```sh
pnpm install --frozen-lockfile
pnpm run build:artifacts
pnpm run build:check
pnpm run test:docs
pnpm run doc-sync
pnpm run lint
git diff --check
```

Select validation from the changes and their dependency impact. The build commands above apply to a product candidate, not every script or documentation edit.

| Change | Required checks | Broaden when |
| --- | --- | --- |
| Host/shared API | Owner and direct-consumer tests, types and affected snapshots | Public types cross build faces or focused failures reveal wider impact |
| Vue component/selector | Real selector-adapter tests, reactive updates, disposal and affected browser paths | Shared rendering or state infrastructure changes |
| Build/dependencies/code generation | Owning script tests, latest official artifacts and build:check, plain Node artifact loading | Global build configuration, workspace dependencies or published layout changes |
| Tests/docs | Affected tests, lint or documentation pairing | The tested execution path also changes |

Install matching browsers only when the Playwright version changes or required binaries are absent. Start one affected browser case to verify the [Web scaffold](../../apps/web/tests/scaffold.ts), then run the affected dependency range. Set WEB_SPEC and WEB_CASE to the affected path and case before running:

```sh
DSH_SNAPSHOT=replay pnpm run test:web:built "$WEB_SPEC" -t "$WEB_CASE"
```

Use the full Web replay for explicitly requested repository-wide validation, global Client infrastructure changes or demonstrated propagation from focused failures. It is not the default upgrade step. After source changes, old builds and browser results remain historical evidence; rebuild before verifying the changed runtime.

Retain replay mode throughout acceptance; do not refresh snapshots. A scaffold startup error is a failed check, not a platform skip.

Launch the built candidate with an isolated profile and data. Verify browser or desktop behavior for every affected Vue path, including empty/error states, cancellation, drafts and cleanup; retain source revision and evidence. Separate passed, failed, skipped and unverified checks, and pre-existing migration failures from new regressions. Successful static checks or product builds alone leave runtime acceptance open.

After every applicable change is reconciled and required acceptance is recorded, explicitly advance acceptedUpstreamCommit to U, set acceptedPersonalCommit to the accepted Personal checkpoint, link acceptedRecord and clear pending. This is a reviewed state change, not a planner command. Update the migration plan and its acceptance rows together. Until then retain B and pending; a partial or merely built candidate is not an accepted upgrade. Keep pending while a real Personal commit containing the upgrade does not yet exist.

Recover by restoring the saved candidate source, profile and data checkpoint or discarding the isolated candidate. Preserve failure evidence and leave the accepted baseline unchanged. Inspect dirty changes before any recovery; avoid blanket resets of the shared workspace. Commit, push, publish and deployment are separate actions.

<a id="record"></a>

## Reference: upgrade record template

Create a dated record linked from pending while work remains open, and from acceptedRecord only after acceptance. This template establishes no execution or acceptance result.

```text
Date / owner:
Status: no-change | proposed | partial | validated | accepted | rolled-back
Original inventory and raw evidence (unchanged):
B / U / P and accepted baseline source:
Discovery output / complete diff JSON / commit and path counts:
Candidate checkout / profile / data / recovery checkpoint:
Derived B/U/P formatter and options / original snapshot locations:
Upstream old/new path | Personal path | local reason | disposition | evidence
Applied / deferred / not-applicable changes and reasons:
Commands / source revision / environment / evidence paths:
Passed / failed / skipped / unverified:
Pre-existing migration failures / new regressions:
Acceptance decision / state change / rollback result:
```

## Dev note

The read-only [planner](../../scripts/upstream-sync.ts) and its [tests](../../scripts/upstream-sync.spec.ts) own discovery and plan validation. This guide owns the contributor sequence; dated records own execution evidence. A pending target and successful document checks do not establish an accepted Personal upgrade.
