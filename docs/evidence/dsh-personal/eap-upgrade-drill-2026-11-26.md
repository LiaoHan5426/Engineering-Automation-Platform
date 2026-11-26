# EAP upstream import drill (Slice E)

**Date:** 2026-11-26
**Cookbook:** `dsh-personal/docs/cookbook/sync-dsh-upstream.zh.md`
**State file:** `dsh-personal/upstream-sync-state.json`

## Fixed versions

| Role | Commit |
| --- | --- |
| Accepted upstream B | `39163dd30f703a79079e2d2446545cff3c453738` |
| Pending target U | `ca33fd6843b205e279c7ccb6cb73a472c78f5760` |
| Personal base P (pending) | `4f8231d0426b6c5c620ef27b4ab458b6c570b2f1` |
| EAP consumer checkpoint | `31f2ec05` |
| EAP import manifest | `docs/evidence/dsh-personal/eap-import-manifest.json` |

**Promotion:** pending U was **not** promoted to accepted B.

## Intersection procedure (reproducible)

1. Take full Git diff `B..U` in the upstream / `dsh-personal` history used by Personal sync evidence (`docs/evidence/dsh-personal/upstream-sync-2026-11-18.md` and scope JSONs).
2. Run `python scripts/dsh-import-impact.py --plan <upstream-plan.json> --imports docs/evidence/dsh-personal/eap-import-manifest.json`. This intersects both path sides and the upstream planner's runtime, optional and peer package closure.
3. Review deletions/renames against EAP overlay exclusions (`ui-settings-account`, `deepseek-account`, `llm-deepseek-account`, `ui-account-notifications`).
4. Run the upstream Windows preflight on a detached worktree at U with the fresh B–U plan. Use a working-tree checkout at U because the scanner reads the changed files from disk.
5. Do not advance `acceptedUpstreamCommit` until product Boot + real Host gate replay passes on the new import.

## EAP adaptation delta (current)

| Area | EAP-owned | Upstream-owned |
| --- | --- | --- |
| Boot injection / composer | `frontend/packages/dsh-boot` | `dsh-client-modules` bootInjections contract |
| Enablement | py-backend plugin registry | N/A (no EAP profile) |
| Product shell / 工作台 | `frontend/apps/web` | — |
| Host fs/git/changes.ops/board | py-backend | DSH method names / envelopes |
| Overlay exclusions | `frontend/packages/dsh-boot/overlay/cordis.patch.yml` | web-app patch rows |

## Verification this drill

| Check | Result |
| --- | --- |
| Fresh Git plan intersects the EAP import manifest | **passed** (3,104 upstream entries, 1,523 affecting the closure, 10 direct packages and 281 transitive packages, all direct package names resolved) |
| Pending retained, accepted unchanged | **passed** (read `upstream-sync-state.json`) |
| Windows preflight on detached U checkout | **passed** (scanner completed and emitted 10 findings for review) |
| Vue codemod on EAP overlay | **skipped** (no pending import applied) |
| Browser main flow after hypothetical U | **unverified** |

## Outcome

The native planner generated a fresh B–U plan from the local upstream Git checkout. The EAP script reproduced the same counts from the retained historical plan. Reviewers can reproduce scope from the version pair + `eap-import-manifest.json` + this note. No baseline promotion.
