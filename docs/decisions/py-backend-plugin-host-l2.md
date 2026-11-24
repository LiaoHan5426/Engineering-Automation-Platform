# Decision: py-backend L2 plugin host (DSH-better-sidebar, control stays on server)

**Date:** 2026-11-24  
**Status:** Accepted for this slice  
**Fixture:** `dsh-better-sidebar@0.31.1` (real npm/DSH package; no hand-rolled demo plugin)

## Context

EAP’s thin Python Chat host must manage installable third-party plugins so the Vue console gains real UI after enable (L2), while remaining front/back separated. DSH’s Cordis model co-locates Host+Client; EAP must **not** move Host/Agent control into the browser just to render plugin UI.

Frontend plugin UI is assembled the **same way as [dsh-personal](../../dsh-personal/) Cordis Client packages** (Context + client `apply` composition). EAP does **not** invent a parallel “profile” runtime or profile directory tree — DSH working-directory / EAP `workspace_root` + `session.cwd` are enough.

## Decisions

1. **Package contract = DSH shape** (`package.json` `dsh.bundle` / `dsh.client`, `cordis.patch.yml`, `exports["./client"]`). No parallel EAP-only demo plugin for acceptance.
2. **Authority on py-backend:** install, enable/disable, Host JSON/WS APIs (`/sidebar/api/*` and equivalents), agent/tool registration, session-authoritative state.
3. **Cordis Client (browser) follows dsh-personal:** PLATFORM libs (`ui-slots` / `ui-dockkit` — **not** Cordis `apply`) + Cordis plugins **`ui-renderer.apply` → slots** and **`ui-sidebar-right.apply` → RightbarSeat** (no hand-rolled seat). Plugin `./client` loads after. Remotes use DSH namespaces `session` / `settings` / `workspaceFiles` (EAP maps file ops to Host `fs.*`) → py-backend. Forbidden: install/enable, tool handlers, agent loop, forging Host success in-browser.
4. **No EAP profile:** do not add `profiles/`, profile ids, or a Cordis “profile” identity beside workspace. Workspace authority = `Settings.workspace_root` + Host `session.cwd` (aligned with dsh-personal working directory).
5. **Host bridge:** in-process bridge and/or Node sidecar supervised by py-backend; FastAPI is the gateway. Not “Host logic in the Cordis island.”
6. **`@eap/runtime-client`:** Plugin management + Host API clients (baseUrl → py-backend). Does **not** execute Agent.
7. **`@eap/plugin-runtime`:** Cordis Client assembly + plugin `./client` loader; no control-plane APIs. Hand-drawn Vue/React “compat panels” for better-sidebar are not the production path.
8. **Boundary — what stays Client vs py-backend:**
   - **Client (like dsh-personal):** slots rendering, `sidebarRight` / `sidebarRightTabs` layout state (expanded, guide, tab focus).
   - **py-backend:** Agent tools, install/enable, authoritative session/fs/settings Host methods, execution evidence.

## Supersedes

- [`py-backend-thin-mvp.md`](py-backend-thin-mvp.md) deferred “no plugins / no UI contributions” for this track.
- “runtime-client never discovers executable UI modules.”
- “Never introduce Cordis in EAP” — Cordis Client assembly only; Host/Agent stay server-side.
- Hand-rolled `settingsPanel()` mount samples and hand-rolled right-rail guide cards as the L2 acceptance path.
- Any proposal to introduce an EAP Cordis **profile** (directory, id, or dual identity with workspace).

## Ownership table

| Capability | Authority |
|---|---|
| Install / enable | py-backend |
| `/sidebar/api/*`, uploads, Host WS | py-backend Host bridge |
| Agent tools (`sidebar_open`, …) | py-backend Chat/tools |
| Workspace / cwd | py-backend settings + Host `session.cwd` |
| Client UI render (slots, right sidebar seat) | Cordis Client assembly (dsh-personal-style packages) |
| Shell triad chat/builder/board enable | unchanged localStorage this slice |
| EAP profile | **Forbidden** — do not create |

## Acceptance

Enable `dsh-better-sidebar@0.31.1` → Better Sidebar UI via Cordis Client seat (guide / tabs), not a Vue-only redraw; disable removes it; file/API/agent traffic hits backend/Host bridge; no EAP profile artifact in-repo.

## References

- Plan: Cordis 前端按 dsh-personal 装配，Agent API 归 py-backend（无 profile）
- [`dsh-personal`](../../dsh-personal/) Cordis Host/Client split + client packages
- Package: `dsh-better-sidebar@0.31.1`
