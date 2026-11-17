# Cookbook: synchronizing DSH Personal with upstream

English | [中文](sync-dsh-upstream.zh.md)

## Summary

This contributor procedure updates the imported DSH sources while preserving the native Vue implementation. It applies to the repository copy, not the installed DSH application. The [migration plan](../../migration-plan.md) owns completion status; writing this guide does not establish a successful upgrade.

## Contents

- [Prepare](#prepare)
- [Compare](#compare)
- [Integrate](#integrate)
- [Validate and recover](#validate)
- [Record template](#record)

<a id="prepare"></a>

## 1. Prepare an isolated update

Run this Bash preflight from the EAP root. The first synchronization uses the inventory baseline; after a fully accepted update, replace BASE_COMMIT with the commit in that record. Resolve remote HEAD rather than assuming the default branch is main.

```sh
set -eu
UPSTREAM_URL=https://github.com/deepseek-ai/deepseek-harness.git
git status --short --branch
git rev-parse HEAD
git ls-remote --symref "$UPSTREAM_URL" HEAD
BASE_COMMIT=$(node -p "JSON.parse(require('node:fs').readFileSync('dsh-personal/source-inventory.json','utf8')).sourceCommit")
TARGET_COMMIT=$(git ls-remote "$UPSTREAM_URL" HEAD | cut -f1)
test "${#TARGET_COMMIT}" -eq 40
if [ "$BASE_COMMIT" = "$TARGET_COMMIT" ]; then
  printf "NO_UPSTREAM_CHANGE %s\n" "$TARGET_COMMIT"
else
  printf "UPDATE_AVAILABLE %s -> %s\n" "$BASE_COMMIT" "$TARGET_COMMIT"
fi
```

Stop on a failed remote query or an empty result; neither means no update. NO_UPSTREAM_CHANGE means B equals U: retain the query output and current Personal state, record no-change, and skip candidate creation, dependency installation and product builds. Do not advance the baseline. This verifies version discovery, not conflict resolution or Vue behavior porting. Continue with isolation only for UPDATE_AVAILABLE.

Read the [fixed-source inventory](../../source-inventory.json), [contract audit](../../contract-audit.md), and [migration plan](../../migration-plan.md). Preserve the original inventory and its blob IDs as historical evidence. Record later accepted upstream versions in dated upgrade records linked from the plan; do not overwrite the original inventory to imply that a newer version was the migration input.

Use three inputs: B = last fully accepted upstream commit, U = proposed upstream commit, P = current Personal checkpoint. Before the first completed synchronization, B is the sourceCommit in the inventory. A partially integrated candidate does not advance B; record applied and deferred changes individually.

Inspect git status, branch, HEAD and remotes at the EAP repository root. Preserve existing changes and use an isolated worktree for integration. The origin remote belongs to EAP; importing a directory does not establish shared Git ancestry with DSH. Do not run an unconditional upstream merge or rebase on the EAP branch.

Prepare a separate upstream checkout containing both B and U, and retain the P source/artifact checkpoint. Before runtime tests, back up the test profile and persistent data; use isolated data rather than the installed application data. Synchronization includes reading upstream and preparing an isolated candidate; confirm commits, pushes, publication and deployment separately. A worktree contains committed state only. For a dirty checkout, also retain a binary diff and untracked sources, then inspect and restore them in the candidate; HEAD alone is not the complete P.

<a id="compare"></a>

## 2. Compare upstream changes and local changes

In Bash, set UPSTREAM_DIR to that checkout and BASE_COMMIT/TARGET_COMMIT to verified full commits. These are parameterized commands for a future upgrade, not a claim that the upgrade has been rehearsed.

```sh
git -C "$UPSTREAM_DIR" rev-parse --verify "${BASE_COMMIT}^{commit}"
git -C "$UPSTREAM_DIR" rev-parse --verify "${TARGET_COMMIT}^{commit}"
git -C "$UPSTREAM_DIR" diff --name-status --find-renames "$BASE_COMMIT" "$TARGET_COMMIT"
git -C "$UPSTREAM_DIR" diff --stat "$BASE_COMMIT" "$TARGET_COMMIT"
git -C "$UPSTREAM_DIR" diff "$BASE_COMMIT" "$TARGET_COMMIT" -- packages/core packages/api packages/client apps scripts
```

The unfiltered name-status report defines coverage; the final command only helps inspect common areas. Include all other changed paths, lockfiles, vendor sources and persistence changes. Compare B against P separately using source files rather than generated lib, dist or node_modules trees. Record renames and deletions explicitly.

| Change class | Integration rule |
| --- | --- |
| Unmodified Host/core logic | Apply the upstream change after checking consumers and tests; directory membership alone does not prove it is unmodified. |
| Locally modified shared logic | Compare B/U/P and reconcile behavior and lifecycle obligations. |
| React components/hooks/rendering | Port the behavior to the mapped Vue component, selector, scope or slot; do not restore the replaced React runtime. |
| Build, dependencies and platform registry | Preserve the Vite+ entry and shared Vue identity; reconcile manifests before regenerating the lockfile. |
| Session formats, schemas and wire APIs | Review migration requirements and update all consumers and applicable persistence acknowledgements. |
| New/deleted/renamed modules | Classify product scope, ownership and replacement; check registrations, imports, tests and documentation together. |

<a id="integrate"></a>

## 3. Integrate by behavior

Create one mapping row per affected module using the template below. Confirm current paths in the working tree; the contract audit explains migration choices but is not a complete file mapping. Resolve shared Host/API changes first, Vue consumers second, and build/configuration changes with their consumers. A clean textual merge is not proof of equivalent behavior.

Preserve synchronous business state changes, cancellation, stale-result protection, scope disposal, focus, drafts and session isolation. For upstream tests tied to React internals, retain user-visible assertions while adapting their harness. Record why any upstream change is deferred; a deferred applicable change keeps the candidate partial.

<a id="validate"></a>

## 4. Validate, accept or recover

Run commands from the candidate dsh-personal directory after reconciling dependencies. The [testing policy](../testing.md) owns test selection. Run focused behavior and positive/negative type checks, then the artifact build and its aggregate checks in order.

```sh
vp install --frozen-lockfile
vp run build:artifacts
vp run build:check
vp run test:docs
vp run doc-sync
vp run lint
git diff --check
```

Start the candidate through the supported dsh profile entry, using its own host and data. Verify affected real-browser flows on desktop and narrow screens, plugin unload/reload, draft retention and cancellation. Audit application bundles for reintroduced React runtime; indirect documentation-tool dependencies are a separate concern. Compare failures against the same tests on B and P; keep existing migration failures distinct from new regressions.

Record exact commands, source revision, environment, results and evidence locations. Mark passed, failed, skipped and unverified separately. Advance B only after all applicable upstream changes are accounted for and the agreed acceptance checks pass; update the plan and link the accepted record. Existing migration acceptance remains independently tracked.

On failure, stop the candidate host and preserve its logs and diff. Keep the accepted version active or restore the saved source/artifact checkpoint. Restore data only from the matching pre-upgrade backup after stopping writers; older code is not assumed to read a newer Session format or database schema. Avoid destructive resets of a shared working tree.

<a id="record"></a>

## Reference: upgrade record template

Store each real attempt as a dated record beside the migration evidence and link it from the plan. This template is not an existing successful upgrade record.

```text
Date / owner:
Status: no-change | proposed | partial | validated | accepted | rolled-back
Original inventory: source-inventory.json (unchanged)
B / U / P: full upstream commits / Personal checkpoint
Upstream checkout / candidate worktree / isolated data:
Backup and recovery checkpoint:
Upstream path | Personal path | local change reason | action | evidence
Applied / deferred / not-applicable changes and reasons:
Commands / source revision / environment / evidence paths:
Passed / failed / skipped / unverified:
Pre-existing migration failures / new regressions:
Acceptance decision / accepted upstream commit / rollback result:
```

## Dev note

This guide defines a maintenance procedure, not an automated synchronization tool. No target upstream commit is selected here. Actual upgrade, build and runtime results belong to the dated record; document checks alone do not establish product acceptance.
