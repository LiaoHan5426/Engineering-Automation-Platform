# Decision: py-backend L2 plugin host (DSH-better-sidebar, control stays on server)

**Date:** 2026-11-24  
**Status:** Accepted; **amended 2026-11-26** for roadmap option 2 (`__DSH_BOOT__` + full `ui-*` client closure). Prior clause that forbade loading `ui-renderer` / `ui-sidebar-right` is **superseded** below.

**Fixture:** `dsh-better-sidebar@0.31.1` (real npm/DSH package; no hand-rolled demo plugin)

**Related:** [`dsh-personal-eap-vue-vite-roadmap.md`](dsh-personal-eap-vue-vite-roadmap.md)

## Context

EAP’s thin Python Chat host must manage installable third-party plugins so the Vue console gains real UI after enable (L2), while remaining front/back separated. DSH’s Cordis model co-locates Host+Client; EAP must **not** move Host/Agent control into the browser just to render plugin UI.

Frontend plugin UI is assembled the **same way as [dsh-personal](../../dsh-personal/) Cordis Client packages** (`__DSH_BOOT__` graph + `AppWebEntry` + client `apply` composition). EAP does **not** invent a parallel “profile” runtime or profile directory tree — DSH working-directory / EAP `workspace_root` + `session.cwd` are enough.

## Decisions

1. **Package contract = DSH shape** (`package.json` `dsh.bundle` / `dsh.client`, `cordis.patch.yml`, `exports["./client"]`). No parallel EAP-only demo plugin for acceptance.
2. **Authority on py-backend:** install, enable/disable, Host JSON/WS APIs (`/sidebar/api/*` and equivalents), agent/tool registration, session-authoritative state. **py-backend is the sole plugin enablement source**; the Node boot composer does not own enablement truth and regenerates the boot graph from that state on cold start, refresh, enable/disable, and uninstall.
3. **Client (browser):** production path uses Host-injected `__DSH_BOOT__` / `__ModuleLoader__` / `__DSH_BOOT_READY__` and `AppWebEntry`. Seed links `ui-slots`; Cordis loads `ui-renderer`, `ui-layout`, and `ui-sidebar-right` as the layout/seat/renderer closure. Remotes use DSH namespaces `session` / `settings` / `workspaceFiles` (EAP maps file ops to Host `fs.*`) → py-backend. Forbidden: install/enable, tool handlers, agent loop, forging Host success in-browser. The transitional `@eap/plugin-runtime` island/shim is **not** the production end state and must be retired when the real-Host gate passes.
4. **No EAP profile:** do not add `profiles/`, profile ids, or a Cordis “profile” identity beside workspace. Workspace authority = `Settings.workspace_root` + Host `session.cwd` (aligned with dsh-personal working directory).
5. **Host bridge:** in-process bridge and/or Node sidecar (boot composer) supervised by py-backend; FastAPI is the gateway. Not “Host logic in the Cordis island.”
6. **`@eap/runtime-client`:** Plugin management + Host API clients (baseUrl → py-backend). Does **not** execute Agent.
7. **`@eap/plugin-runtime`:** Transitional Cordis Client island only until cutover; no control-plane APIs. Hand-drawn Vue/React “compat panels” for better-sidebar are not the production path.
8. **Boundary — what stays Client vs py-backend:**
   - **Client (like dsh-personal):** `__DSH_BOOT__` assembly, slots rendering via `ui-*`, `sidebarRight` / tab focus, plugin UI contributions.
   - **py-backend:** Agent tools, install/enable, authoritative session/fs/settings Host methods, execution evidence, enablement set for boot composition.
9. **Cutover gate:** production `apps/web` must not switch away from the shim until an independent Boot entry has passed real py-backend contracts and browser main flows. Fixture/reference-Host results prove client assembly only.

## Supersedes

- [`py-backend-thin-mvp.md`](py-backend-thin-mvp.md) deferred “no plugins / no UI contributions” for this track.
- “runtime-client never discovers executable UI modules.”
- “Never introduce Cordis in EAP” — Cordis Client assembly only; Host/Agent stay server-side.
- Hand-rolled `settingsPanel()` mount samples and hand-rolled right-rail guide cards as the L2 acceptance path.
- Any proposal to introduce an EAP Cordis **profile** (directory, id, or dual identity with workspace).
- **2026-11-25 clause:** “Cordis, `ui-renderer`, and `ui-sidebar-right` are not loaded; the Vue shell alone declares seats.” Replaced by decision 3 above (full `ui-*` closure under `__DSH_BOOT__`).

## Ownership table

| Capability | Authority |
|---|---|
| Install / enable | py-backend |
| Boot graph / combo URLs from enablement | Node boot composer (input = py-backend enablement + EAP overlay) |
| `/sidebar/api/*`, uploads, Host WS | py-backend Host bridge |
| Agent tools (`sidebar_open`, …) | py-backend Chat/tools |
| Workspace / cwd | py-backend settings + Host `session.cwd` |
| Client UI render (slots, right sidebar) | DSH `ui-slots` seed + `ui-renderer` / `ui-layout` / `ui-sidebar-right` |
| Shell triad chat/builder/board enable | unchanged localStorage this track |
| EAP profile | **Forbidden** — do not create |

## Acceptance

Enable `dsh-better-sidebar@0.31.1` → Better Sidebar UI via DSH `ui-*` seats (guide / tabs), not a Vue-only redraw; disable/uninstall removes contributions and refreshes the boot graph from py-backend; file/API/agent traffic hits backend/Host bridge; no EAP profile artifact in-repo. Production cutover only after the real-Host gate on the independent Boot entry.

## References

- Roadmap option 2: [`dsh-personal-eap-vue-vite-roadmap.md`](dsh-personal-eap-vue-vite-roadmap.md)
- [`dsh-personal`](../../dsh-personal/) Cordis Host/Client split + client packages
- Package: `dsh-better-sidebar@0.31.1`
