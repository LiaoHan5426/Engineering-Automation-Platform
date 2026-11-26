# py-backend (thin MVP)

Colocated local Chat host: FastAPI + SQLite. Virtualenv lives **inside this directory**
(`.venv`), not at the repository root. Decision: `docs/decisions/py-backend-thin-mvp.md`.

## Git execution architecture

The Git HTTP routes call `app/application/git_executions.py`. The application
service coordinates request deduplication and completed observations using the
execution record in `app/domain/git_execution.py`. The app factory injects the
local Git runner and SQLite store from `app/infrastructure/`. The store uses
the existing `git_execution` table.

## Chat turn architecture

`app/application/chat.py` coordinates turns and yields structured execution
events. The HTTP adapter in `app/api/conversations.py` encodes these events as
SSE. `app/domain/execution_journal.py` owns in-memory execution state and
interlocks. The app factory injects the conversation store and model stream
adapters from `app/infrastructure/`. The conversation adapter persists the user
and assistant messages in one transaction.

## Plugin lifecycle and Host architecture

`app/application/plugins.py` coordinates plugin lifecycle changes, Host
synchronization, and install-failure notifications. The plugin and same-origin
sidebar routers translate HTTP requests into these use cases. The registry,
installer, and Cordis Host bridge are composed from
`app/infrastructure/plugins/`.

## Built-in local-workspace plugins

The local Host registers workspace files and Git as global
capabilities in `app/infrastructure/local_workspace/registry.py`. Web lists
them through `GET /api/local-workspace/plugins` and calls registered methods via
`POST /api/local-workspace/{method}`. The DSH sidebar keeps its existing wire
protocol and dispatches to the same registry. File and Git reads use the
configured workspace root, including when no DSH sidebar is installed.

To enable saving existing UTF-8 files and staging or unstaging repository
paths, set `EAP_LOCAL_WORKSPACE_WRITE_ENABLED=true` in the local Host environment
and restart it. Enable this for a trusted local workspace. Saves require the
`mtimeMs` returned by `fs.read` as `expectedMtimeMs` and return `fs-conflict`
when the file changed. The DSH client's raw `POST /sidebar/write` uses the
same save handler as `fs.write`.

## Setup (Windows PowerShell)

```powershell
cd py-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip "setuptools>=84.1.0" "wheel>=0.45.0"
pip install -e ".[dev]"
copy .env.example .env
# edit .env — set EAP_MODEL_API_KEY when you want real model calls
```

Fresh venvs often ship an old `setuptools` (e.g. 65.5.0) that scanners flag; upgrade it before
installing the project.

## Run

```powershell
cd py-backend
.\.venv\Scripts\Activate.ps1
python main.py
```

Host/port/reload come from `.env` (`EAP_HOST` / `EAP_PORT` / `EAP_RELOAD`, default
`127.0.0.1:8080` with hot reload on). Reloads watch `app/` only (with a short
delay and `WATCHFILES_FORCE_POLLING=1` on Windows drive-letter roots so edits
are not missed). Disable with `EAP_RELOAD=false`. Equivalent:
`uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload`.
After a reload blip the plugin Host re-syncs from the registry on the next
request; if the Vite page still shows Host errors, refresh once.

Health: `GET http://127.0.0.1:8080/api/health`

## Tests

```powershell
cd py-backend
.\.venv\Scripts\Activate.ps1
pytest -q
```

## Contract subset

Compatible with `@eap/runtime-client` Chat paths under `/api/ai/…`
(open / messages SSE / graph / cancel / connections) and the shell catalogs
(`/capabilities`, `/databases`, `/experts`, `/tasks`, `/stats`, `/knowledge`,
`/rule-packs`, `/skills`, `/scenarios`, `/mcp-servers`). Point the Vue app base URL at
`http://127.0.0.1:8080/api` for live wiring (**frontend accept: verified 2026-11-25** — non-mock Vue, shell boot six keys, Chat `toolMode=none` one real SSE round; MCP protocol, edit/regenerate, board/SQL out of scope).

Each chat turn binds catalogs in one order before the model call: enabled rule
packs, enabled skills, knowledge excerpts plus the builtin tool observation,
then MCP tools that are enabled and trusted. A registered MCP tool is not a
completed call (`probe.verified` stays false). Decision:
`docs/decisions/py-backend-agent-architecture.md`.

Default data directory: `py-backend/.eap/` (gitignored via root `.eap/`). Override with `EAP_DATA_ROOT`.

## L2 plugins (Cordis Client + Host bridge)

- **Authority:** install/enable, Agent tools, Host `/sidebar/api/*` (fs / settings / session) stay on py-backend.
- **Workspace:** `Settings.workspace_root` + Host `session.cwd` — aligned with dsh-personal working directory. **No EAP Cordis profile** directory or profile id.
- **Frontend:** `@eap/plugin-runtime` assembles Cordis Client packages (ui-slots / ui-sidebar-right / dockkit) like dsh-personal; Vue shell only syncs contributions and mounts `#eap-cordis-sidebar-right`. Decision: `docs/decisions/py-backend-plugin-host-l2.md`.
