"""Composition of built-in global workspace capabilities."""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.infrastructure.local_workspace.changes import CHANGES_LOG
from app.infrastructure.local_workspace.files import WorkspaceFiles, resolve_workspace_path
from app.infrastructure.local_workspace.git import REMOTE_GIT_METHODS, call_workspace_git

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


_workspace_files = WorkspaceFiles()


def _workspace_files_handler(workspace: Path, method: str, body: dict[str, Any]) -> Any:
    session_id = body.get("sessionId")
    if method == "changes.ops":
        after_seq = body.get("afterSeq", -1)
        wait = body.get("wait", False)
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValueError("sessionId is required")
        if type(after_seq) is not int or not -1 <= after_seq <= 2**53 - 1:
            raise ValueError("afterSeq must be a safe integer of at least -1")
        if type(wait) is not bool:
            raise ValueError("wait must be a boolean")
        return CHANGES_LOG.response(workspace, session_id, after_seq, wait)
    value = _workspace_files.call(workspace, method, body)
    # DSH classifies file writes, reads and edits. Directory and rename/remove
    # actions have no equivalent event type in the sidebar's file list.
    if method in {"fs.write", "fs.createFile", "fs.upload"} and isinstance(session_id, str) and session_id.strip():
        path = value.get("path") or body.get("path")
        CHANGES_LOG.record_write(workspace, session_id, path)
    return value


PLUGINS = (
    WorkspacePlugin(
        "workspace-files",
        ("fs.tree", "fs.trees", "fs.read", "changes.ops"),
        _workspace_files_handler,
        ("fs.write", "fs.mkdir", "fs.createFile", "fs.rename", "fs.remove", "fs.upload"),
    ),
    WorkspacePlugin("workspace-git", (
        "git.worktrees", "git.branch", "git.status", "git.diff", "git.show", "git.commit-diff", "git.graph", "git.history",
    ), _git, ("git.stage", "git.unstage", "git.commit", "git.checkout", "git.pull", "git.push")),
)
_HANDLERS = {method: plugin.handler for plugin in PLUGINS for method in plugin.methods + plugin.write_methods}
WRITE_METHODS = frozenset(method for plugin in PLUGINS for method in plugin.write_methods)


def list_workspace_plugins(write_enabled: bool = False, remote_git_enabled: bool = False) -> list[dict[str, Any]]:
    return [{
        "id": plugin.id,
        "scope": "global",
        "access": "read-write" if write_enabled else "read",
        "methods": list(plugin.methods) + [
            method for method in plugin.write_methods
            if write_enabled and (remote_git_enabled or method not in REMOTE_GIT_METHODS)
        ],
    } for plugin in PLUGINS]


def workspace_handler(method: str, write_enabled: bool = False, remote_git_enabled: bool = False) -> Handler | None:
    if method in WRITE_METHODS and not write_enabled:
        raise PermissionError("Local workspace writes are disabled")
    if method in REMOTE_GIT_METHODS and not remote_git_enabled:
        raise PermissionError("Remote Git operations are disabled")
    return _HANDLERS.get(method)
