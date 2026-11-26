"""Server-side Host bridge for DSH plugin Host halves.

Control plane stays here (or in a supervised Node sidecar). The Cordis Client
island may only call these HTTP/WS endpoints — never execute Host/Agent logic
in the browser.

Workspace authority is Settings.workspace_root + session.cwd only — there is
no EAP Cordis profile directory or profile id beside workspace.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.infrastructure.local_workspace.files import FsConflictError, FsDirectoryError
from app.infrastructure.local_workspace.registry import workspace_handler
from app.infrastructure.plugins.registry import PluginRegistry

# Default prefs document shape expected by dsh-better-sidebar client boot.
_SIDEBAR_PREFS_DEFAULTS: dict[str, Any] = {
    "autoOpenSubagent": True,
    "autoOpenJobs": True,
    "tasksViewMode": "graph",
    "tasksAutoFoldSettled": True,
    "tasksAutoFoldBranches": True,
    "tasksAutoFoldIdle": True,
    "jobsAutoCollapse": True,
    "mobileNoAutoOpen": True,
    "mobileDefaultTree": True,
    "agentOpenTools": False,
    "editorExplorer": False,
    "editorGitGutter": True,
    "explorerExclude": [".DS_Store", "Thumbs.db"],
    "customCss": "",
    "htmlViewerNoSandbox": False,
    "htmlViewerDefaultUnsafe": False,
    "tabsEnabled": {},
    "viewersEnabled": {},
    "pluginSettings": {},
}


@dataclass
class HostBridgeState:
    """In-process stand-in for plugin Host APIs until/alongside Node sidecar."""

    name: str
    version: str
    root: Path
    workspace: Path
    ready: bool = True
    prefs: dict[str, Any] = field(default_factory=lambda: dict(_SIDEBAR_PREFS_DEFAULTS))
    calls: list[dict[str, Any]] = field(default_factory=list)


class PluginHostBridge:
    def __init__(self, registry: PluginRegistry, workspace: Path, *, write_enabled: bool = False) -> None:
        self._registry = registry
        self._write_enabled = write_enabled
        self._workspace = workspace.resolve()
        self._active: dict[str, HostBridgeState] = {}

    def sync_enabled(self) -> None:
        listed = self._registry.list_plugins()["items"]
        enabled_names = {item["name"] for item in listed if item.get("enabled")}
        for name in list(self._active):
            if name not in enabled_names:
                del self._active[name]
        for item in listed:
            if not item.get("enabled") or item.get("broken"):
                continue
            name = item["name"]
            if name in self._active:
                continue
            info = self._registry.package_info(name)
            self._active[name] = HostBridgeState(
                name=info.name,
                version=info.version,
                root=info.root,
                workspace=self._workspace,
            )

    def primary_sidebar_plugin(self) -> str | None:
        self.sync_enabled()
        if "dsh-better-sidebar" in self._active:
            return "dsh-better-sidebar"
        return next(iter(sorted(self._active)), None)

    def status(self, name: str) -> dict[str, Any]:
        self.sync_enabled()
        state = self._active.get(name)
        if state is None:
            raise LookupError("HOST_NOT_ACTIVE")
        return {
            "name": state.name,
            "version": state.version,
            "ready": state.ready,
            "controlPlane": "py-backend",
            "sidecar": "in-process-bridge",
            "callCount": len(state.calls),
            "workspaceRoot": str(state.workspace),
        }

    def handle_sidebar_api(
        self,
        name: str,
        method: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Gateway for better-sidebar Host `/sidebar/api/{method}` (POST JSON).

        Wire envelope matches DSH Host: `{ok: true, value: ...}` or
        `{ok: false, error: {code, message}}`. Callers (Cordis island) must keep
        using this server path so the browser never owns Host logic.
        """
        self.sync_enabled()
        state = self._active.get(name)
        if state is None:
            raise LookupError("HOST_NOT_ACTIVE")
        method = method.strip().lstrip("/")
        record = {
            "method": "POST",
            "path": method,
            "bodyKeys": sorted((body or {}).keys()),
        }
        state.calls.append(record)
        try:
            value = self._dispatch(state, method, body or {})
            return {"ok": True, "value": value, "controlPlane": "py-backend"}
        except KeyError as exc:
            return {
                "ok": False,
                "error": {"code": "not-found", "message": str(exc)},
                "controlPlane": "py-backend",
            }
        except FsConflictError as exc:
            return {"ok": False, "error": {"code": "fs-conflict", "message": str(exc)}}
        except FsDirectoryError as exc:
            # DSH wire: client EditorHost promotes the tab to a folder window
            # when code === "fs-directory" (see editor-load.isDirectoryReadError).
            return {
                "ok": False,
                "error": {"code": "fs-directory", "message": str(exc)},
                "controlPlane": "py-backend",
            }
        except ValueError as exc:
            return {
                "ok": False,
                "error": {"code": "bad-request", "message": str(exc)},
                "controlPlane": "py-backend",
            }
        except PermissionError as exc:
            return {
                "ok": False,
                "error": {
                    "code": "permission-denied",
                    "message": str(exc) or "没有权限访问此路径",
                },
                "controlPlane": "py-backend",
            }
        except OSError as exc:
            return {
                "ok": False,
                "error": {"code": "fs-error", "message": str(exc)},
                "controlPlane": "py-backend",
            }

    def resolve_bundle(self, name: str, chunk: str) -> Path:
        """Serve lazy client chunks from the installed package (Host `/sidebar/bundle`)."""
        self.sync_enabled()
        state = self._active.get(name)
        if state is None:
            raise LookupError("HOST_NOT_ACTIVE")
        safe = chunk.replace("\\", "/").lstrip("/")
        if ".." in safe.split("/") or not safe.endswith(".js"):
            raise ValueError("invalid bundle path")
        # better-sidebar chunks are sibling files under lib/
        candidate = state.root / "lib" / f"client-{safe.removesuffix('.js')}.js"
        if candidate.is_file():
            return candidate
        alt = state.root / "lib" / safe
        if alt.is_file():
            return alt
        raise FileNotFoundError(safe)

    def open_sidebar_tool(self, name: str | None = None) -> dict[str, Any]:
        """Agent-callable tool: ask Host bridge to mark sidebar open intent.

        Registered on py-backend Chat/tools — never executed in the Cordis island.
        """
        self.sync_enabled()
        target = name or self.primary_sidebar_plugin()
        if target is None or target not in self._active:
            return {
                "ok": False,
                "code": "HOST_NOT_ACTIVE",
                "summary": "no enabled sidebar plugin host",
            }
        state = self._active[target]
        state.calls.append({"method": "TOOL", "path": "sidebar_open", "bodyKeys": []})
        return {
            "ok": True,
            "code": "sidebar_open",
            "summary": f"sidebar open requested via py-backend for {target}",
            "controlPlane": "py-backend",
            "plugin": target,
        }

    def active_names(self) -> list[str]:
        self.sync_enabled()
        return sorted(self._active)

    def _dispatch(self, state: HostBridgeState, method: str, body: dict[str, Any]) -> Any:
        if method in {"", "health", "status"}:
            return {
                "plugin": state.name,
                "version": state.version,
                "workspaceRoot": str(state.workspace),
            }
        if method == "settings.get":
            return {
                "value": dict(state.prefs),
                "revision": 1,
                "externalDisable": False,
            }
        if method == "settings.update":
            patch = body.get("patch") if isinstance(body.get("patch"), dict) else body
            if not isinstance(patch, dict):
                raise ValueError("patch must be a plain object")
            merged = dict(state.prefs)
            for key, value in patch.items():
                if key == "pluginSettings" and isinstance(value, dict):
                    plugins = dict(merged.get("pluginSettings") or {})
                    plugins.update(value)
                    merged["pluginSettings"] = plugins
                else:
                    merged[key] = value
            state.prefs = merged
            return {"value": dict(state.prefs), "revision": 1, "externalDisable": False}
        if method == "session.cwd":
            cwd = str(state.workspace)
            return {
                "sessionId": str(body.get("sessionId") or "eap"),
                "cwd": cwd,
                "root": state.workspace.name or cwd,
                "parent": str(state.workspace.parent),
            }
        if method == "session.phase":
            # blank drives DockFallback (bottom workbench opener for empty DSH
            # sessions). EAP hosts the plugin in the RIGHT column; do not force
            # blank=true or the client parks guide cards in the bottom dock.
            return {"blank": False, "sessionId": str(body.get("sessionId") or "eap")}
        handler = workspace_handler(method, self._write_enabled)
        if handler is not None:
            return handler(state.workspace, method, body)
        if method == "changes.ops":
            # This Host does not run DSH Agent sessions, so there is no DSH operation stream.
            return {"events": [], "lastSeq": 0}
        if method.startswith("git."):
            raise PermissionError("Git method is unavailable on this host")
        # Honest stub for methods not yet wired through the in-process bridge.
        return {
            "implemented": False,
            "method": method,
            "echo": body,
            "note": "skeleton Host bridge; Node sidecar may expand this method",
        }


def write_prefs_snapshot(path: Path, prefs: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(prefs, ensure_ascii=False, indent=2), encoding="utf-8")
