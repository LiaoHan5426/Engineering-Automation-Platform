from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from app.domain.errors import ChatErrorCode
from app.services.tools.git_status import run_git_status

if TYPE_CHECKING:
    from app.infrastructure.plugins.host_bridge import PluginHostBridge

ToolFn = Callable[[Path], dict[str, Any]]


class CapabilityRegistry:
    """Thin capability map. Registration ≠ installation; no silent pip/npm."""

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace
        self._host_bridge: PluginHostBridge | None = None
        self._handlers: dict[str, ToolFn] = {
            "git_status": lambda root: run_git_status(root),
            "sidebar_open": self._sidebar_open,
        }

    def bind_host_bridge(self, bridge: PluginHostBridge) -> None:
        """Wire plugin Host bridge tools (server-side only)."""
        self._host_bridge = bridge

    def _sidebar_open(self, _root: Path) -> dict[str, Any]:
        if self._host_bridge is None:
            return {
                "ok": False,
                "code": ChatErrorCode.TOOL_MODE_UNSUPPORTED,
                "summary": "plugin host bridge not bound",
            }
        return self._host_bridge.open_sidebar_tool()

    def run(self, tool_mode: str) -> dict[str, Any]:
        if tool_mode == "none":
            return {"ok": True, "code": "none", "summary": "", "skipped": True}
        if tool_mode == "code_sources":
            return {
                "ok": False,
                "code": ChatErrorCode.TOOL_MODE_UNSUPPORTED,
                "summary": "code_sources deferred in thin MVP",
            }
        handler = self._handlers.get(tool_mode)
        if handler is None:
            return {
                "ok": False,
                "code": ChatErrorCode.TOOL_MODE_UNSUPPORTED,
                "summary": f"unknown toolMode: {tool_mode}",
            }
        return handler(self._workspace)
