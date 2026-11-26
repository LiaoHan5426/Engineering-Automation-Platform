from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from app.domain.errors import ChatErrorCode
from app.services.tools.git_status import run_git_status
from app.services.workspace_files import inspect_source

if TYPE_CHECKING:
    from app.infrastructure.plugins.host_bridge import PluginHostBridge

ToolFn = Callable[[Path, str | None], dict[str, Any]]


class CapabilityRegistry:
    """Thin capability map. Registration ≠ installation; no silent pip/npm."""

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace
        self._host_bridge: PluginHostBridge | None = None
        self._handlers: dict[str, ToolFn] = {
            "git_status": lambda root, _: run_git_status(root),
            "sidebar_open": self._sidebar_open,
        }

    def bind_host_bridge(self, bridge: PluginHostBridge) -> None:
        """Wire plugin Host bridge tools (server-side only)."""
        self._host_bridge = bridge

    def _sidebar_open(self, _root: Path, session_id: str | None) -> dict[str, Any]:
        if self._host_bridge is None:
            return {
                "ok": False,
                "code": ChatErrorCode.TOOL_MODE_UNSUPPORTED,
                "summary": "plugin host bridge not bound",
            }
        return self._host_bridge.open_sidebar_tool(session_id=session_id)

    def run(self, tool_mode: str, *, session_id: str | None = None, target_path: str | None = None) -> dict[str, Any]:
        if tool_mode == "none":
            return {"ok": True, "code": "none", "summary": "", "skipped": True}
        if tool_mode == "code_sources":
            source = inspect_source(self._workspace, target_path)
            if not source["exists"] or source["denial"]:
                return {
                    "ok": False,
                    "code": source["denial"] or "SOURCE_UNAVAILABLE",
                    "summary": "Workspace source unavailable",
                }
            return {
                "ok": True,
                "code": "code_sources",
                "path": source["path"],
                "summary": source["excerpt"],
            }
        handler = self._handlers.get(tool_mode)
        if handler is None:
            return {
                "ok": False,
                "code": ChatErrorCode.TOOL_MODE_UNSUPPORTED,
                "summary": f"unknown toolMode: {tool_mode}",
            }
        return handler(self._workspace, session_id)
