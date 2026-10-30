# @eap/desktop

Electron shell **scaffold** for EAP. Implements the `window.eap` preload surface from
[`docs/desktop-spec.md`](../../../docs/desktop-spec.md):

- `chooseWorkspace()` — native directory picker
- `getPlatformInfo()` — shell/platform metadata (`scaffold: true`, `electronMajor`)
- `openExternal(url)` — http(s) only
- `showNotification({ title, body })`

## Electron 45 adaptation

Current target: **Electron ^45.0.0** (Chromium 156 / Node 24).

| Topic | Adaptation |
|---|---|
| Sandboxed preload | Must be **CommonJS** (`src/preload.cjs` + `require('electron')`). ESM `import` is not supported in sandbox preload. |
| Main process | Remains ESM (`src/main.mjs`) |
| Removed sandbox shims | Do not use `Buffer` / `require('url'|'timers'|'events')` in preload; use WHATWG `URL` in main when validating |
| Popups | `setWindowOpenHandler` denies; Electron 45 would otherwise inherit sandbox onto guest windows |
| Node engine | `>=22.12.0` (Electron 45 requirement) |

```bash
pnpm --filter @eap/desktop run check:preload
```

## Boundaries

- Renderer: `contextIsolation`, `nodeIntegration: false`, `sandbox: true`
- No domain logic (tasks, Agent, validation) in main process
- Local Java service remains separately started (`docs/running-context.md`)
- This is **not** a signed installer or auto-update channel

## Run

```bash
# Terminal A — web UI (required for the scaffold load URL)
pnpm --dir frontend --filter @eap/web dev

# Terminal B — Electron shell
pnpm --dir frontend --filter @eap/desktop install
pnpm --dir frontend --filter @eap/desktop dev
```

Override the UI URL with `EAP_DESKTOP_URL` when needed.
