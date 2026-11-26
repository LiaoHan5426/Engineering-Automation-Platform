"""Composition of built-in global workspace capabilities."""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.infrastructure.local_workspace.files import WorkspaceFiles, resolve_workspace_path
from app.infrastructure.local_workspace.git import call_workspace_git

Handler = Callable[[Path, str, dict[str, Any]], Any]


@dataclass(frozen=True)
class WorkspacePlugin:
    id: str
    methods: tuple[str, ...]
    handler: Handler
    write_methods: tuple[str, ...]


def _git(workspace: Path, method: str, body: dict[str, Any]) -> Any:
    cwd = resolve_workspace_path(workspace, body.get("cwd"))
    return call_workspace_git(workspace, cwd, method, body)


PLUGINS = (
    WorkspacePlugin("workspace-files", ("fs.tree", "fs.trees", "fs.read"), WorkspaceFiles().call, ("fs.write",)),
    WorkspacePlugin("workspace-git", (
        "git.worktrees", "git.status", "git.diff", "git.show", "git.commit-diff", "git.graph", "git.history",
    ), _git, ("git.stage", "git.unstage")),
)
_HANDLERS = {method: plugin.handler for plugin in PLUGINS for method in plugin.methods + plugin.write_methods}
WRITE_METHODS = frozenset(method for plugin in PLUGINS for method in plugin.write_methods)


def list_workspace_plugins(write_enabled: bool = False) -> list[dict[str, Any]]:
    return [{
        "id": plugin.id,
        "scope": "global",
        "access": "read-write" if write_enabled else "read",
        "methods": list(plugin.methods + (plugin.write_methods if write_enabled else ())),
    } for plugin in PLUGINS]


def workspace_handler(method: str, write_enabled: bool = False) -> Handler | None:
    if method in WRITE_METHODS and not write_enabled:
        raise PermissionError("Local workspace writes are disabled")
    return _HANDLERS.get(method)
