"""Local Git process adapter for trusted, read-only panel operations."""

import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.domain.git_execution import GitExecution


_STDOUT_LIMIT = 20_000
_STDERR_LIMIT = 4_000
_COMMANDS = {
    "git-status": ["git", "status", "--porcelain=v1"],
    "git-diff": ["git", "diff", "--no-ext-diff"],
}


class LocalGitRunner:
    def __init__(self, workspace: Path) -> None:
        self._workspace = workspace

    def availability(self) -> tuple[bool, bool]:
        return self._workspace.is_dir(), bool(shutil.which("git"))

    def run(self, operation: str, request_id: str) -> GitExecution:
        command = list(_COMMANDS[operation])
        executable = shutil.which("git") or ""
        created = _now()
        if not self._workspace.is_dir() or not executable:
            return GitExecution(
                id=f"gex-{uuid.uuid4().hex[:12]}",
                request_id=request_id,
                operation=operation,
                status="FAILED",
                workspace_path=str(self._workspace),
                executable=executable,
                command=command,
                stderr="git executable or workspace is unavailable",
                created_at=created,
                finished_at=_now(),
            )
        try:
            completed = subprocess.run(
                command,
                cwd=str(self._workspace),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=15,
                shell=False,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return GitExecution(
                id=f"gex-{uuid.uuid4().hex[:12]}",
                request_id=request_id,
                operation=operation,
                status="TIMED_OUT",
                workspace_path=str(self._workspace),
                executable=executable,
                command=command,
                created_at=created,
                finished_at=_now(),
            )
        stdout, stdout_cut = _clip(completed.stdout or "", _STDOUT_LIMIT)
        stderr, stderr_cut = _clip(completed.stderr or "", _STDERR_LIMIT)
        return GitExecution(
            id=f"gex-{uuid.uuid4().hex[:12]}",
            request_id=request_id,
            operation=operation,
            status="SUCCEEDED" if completed.returncode == 0 else "FAILED",
            workspace_path=str(self._workspace),
            executable=executable,
            command=command,
            exit_code=completed.returncode,
            stdout=stdout,
            stderr=stderr,
            truncated=stdout_cut or stderr_cut,
            created_at=created,
            finished_at=_now(),
        )


def _clip(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit], True


def _now() -> datetime:
    return datetime.now(timezone.utc)
