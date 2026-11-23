from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from app.domain.errors import ChatErrorCode
from app.services.tools.git_status import run_git_status

ToolFn = Callable[[Path], dict[str, Any]]


class CapabilityRegistry:
    """Thin capability map. Registration ≠ installation; no silent pip/npm."""

    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace
        self._handlers: dict[str, ToolFn] = {
            "git_status": lambda root: run_git_status(root),
        }

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
