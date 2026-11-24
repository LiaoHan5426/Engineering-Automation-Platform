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

from app.plugins.registry import PluginRegistry

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


class FsDirectoryError(ValueError):
    """fs.read targeted a directory — wire code `fs-directory` for the client."""


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
    def __init__(self, registry: PluginRegistry, workspace: Path) -> None:
        self._registry = registry
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
        if method == "fs.tree":
            # Always ok:true with per-level error — matches fs.trees / FileTree.
            return self._list_dir(state, body.get("path"))
        if method == "fs.trees":
            paths = body.get("paths")
            if not isinstance(paths, list) or not paths:
                raise ValueError("paths must be a non-empty array")
            levels = []
            for raw in paths[:64]:
                if not isinstance(raw, str) or not raw:
                    continue
                levels.append(self._list_dir(state, raw))
            return {"levels": levels}
        if method == "fs.read":
            return self._read_file(state, body.get("path"))
        # Honest stub for methods not yet wired through the in-process bridge.
        return {
            "implemented": False,
            "method": method,
            "echo": body,
            "note": "skeleton Host bridge; Node sidecar may expand this method",
        }

    def _fs_error_payload(self, path: str | Path, exc: OSError) -> dict[str, Any]:
        """Structured FS failure for tree/read — never raise raw Errno text alone."""
        winerror = getattr(exc, "winerror", None)
        denied = isinstance(exc, PermissionError) or getattr(exc, "errno", None) in {13, 5} or winerror in {
            5,
            32,
        }
        code = "PERMISSION_DENIED" if denied else "FS_ERROR"
        return {
            "path": str(path),
            "entries": [],
            "truncated": False,
            "error": self._fs_error_message(exc, denied=denied),
            "errorCode": code,
        }

    def _fs_error_message(self, exc: OSError, *, denied: bool) -> str:
        if denied:
            return "没有权限访问此路径"
        return exc.strerror or str(exc)

    def _list_dir(self, state: HostBridgeState, raw_path: Any) -> dict[str, Any]:
        try:
            target = self._safe_workspace_path(state, raw_path)
        except (OSError, ValueError) as exc:
            if isinstance(exc, ValueError):
                raise
            return self._fs_error_payload(raw_path if raw_path not in (None, "") else state.workspace, exc)

        try:
            if not target.is_dir():
                raise ValueError(f"not a directory: {target}")
            children = list(target.iterdir())
        except OSError as exc:
            return self._fs_error_payload(target, exc)

        entries: list[dict[str, Any]] = []
        for child in sorted(children, key=lambda p: (not self._is_dir_safe(p), p.name.lower()))[:500]:
            try:
                entries.append(
                    {
                        "name": child.name,
                        "path": str(child),
                        "directory": child.is_dir(),
                        "symlink": child.is_symlink(),
                    }
                )
            except OSError:
                # Skip children we cannot stat (locked / junction / ACL).
                continue
        return {
            "path": str(target),
            "entries": entries,
            "truncated": len(entries) >= 500,
        }

    def _is_dir_safe(self, path: Path) -> bool:
        try:
            return path.is_dir()
        except OSError:
            return False

    def _read_file(self, state: HostBridgeState, raw_path: Any) -> dict[str, Any]:
        target = self._safe_workspace_path(state, raw_path)
        try:
            if target.is_dir():
                # Match DSH Host readText: dedicated code, not a generic bad-request.
                raise FsDirectoryError(f'"{target}" is a directory')
            text = target.read_text(encoding="utf-8", errors="replace")
            return {"path": str(target), "content": text, "encoding": "utf-8"}
        except FsDirectoryError:
            raise
        except PermissionError as exc:
            raise PermissionError(self._fs_error_message(exc, denied=True)) from None
        except OSError as exc:
            denied = getattr(exc, "errno", None) in {13, 5} or getattr(exc, "winerror", None) in {
                5,
                32,
            }
            if denied:
                raise PermissionError(self._fs_error_message(exc, denied=True)) from None
            raise OSError(self._fs_error_message(exc, denied=False)) from None

    def _safe_workspace_path(self, state: HostBridgeState, raw_path: Any) -> Path:
        if raw_path is None or raw_path == "" or raw_path == ".":
            return state.workspace
        text = str(raw_path)
        candidate = Path(text)
        if not candidate.is_absolute():
            candidate = state.workspace / text
        try:
            resolved = candidate.resolve(strict=False)
        except OSError as exc:
            raise PermissionError(self._fs_error_message(exc, denied=True)) from None
        root = state.workspace.resolve(strict=False)
        if resolved != root and root not in resolved.parents:
            raise ValueError("path escapes workspace")
        return resolved


def write_prefs_snapshot(path: Path, prefs: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(prefs, ensure_ascii=False, indent=2), encoding="utf-8")
