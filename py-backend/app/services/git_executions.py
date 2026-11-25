"""Bounded argv git observations for the trusted git panel."""

from __future__ import annotations

import json
import shutil
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlmodel import select

from app.persistence.db import session_scope
from app.persistence.models import GitExecutionRow

_STDOUT_LIMIT = 20_000
_STDERR_LIMIT = 4_000
_COMMANDS = {
    "git-status": ["git", "status", "--porcelain=v1"],
    "git-diff": ["git", "diff", "--no-ext-diff"],
}


class GitExecutionService:
    def __init__(self, workspace) -> None:
        self._workspace = workspace
        self._lock = threading.Lock()

    def readiness(self, operation: str) -> dict[str, Any]:
        self._require_operation(operation)
        root_ok = self._workspace.is_dir()
        git = shutil.which("git")
        reason = ""
        if not root_ok:
            reason = "AUTHORIZED_ROOT_MISSING"
        elif not git:
            reason = "GIT_STATUS_FAILED"
        return {
            "capabilityId": operation,
            "scopeAccessible": root_ok,
            "authorized": root_ok,
            "canStart": root_ok and bool(git),
            "reason": reason,
            "blockingExecutionId": None,
            "blockingStatus": None,
            "checkedAt": _now().isoformat(),
        }

    def list_executions(self, operation: str, engine) -> dict[str, Any]:
        self._require_operation(operation)
        with session_scope(engine) as session:
            rows = session.exec(
                select(GitExecutionRow)
                .where(GitExecutionRow.operation == operation)
                .order_by(GitExecutionRow.created_at.desc())
            ).all()
            return {"items": [self._public(row) for row in rows[:20]]}

    def get_execution(self, operation: str, execution_id: str, engine) -> dict[str, Any] | None:
        self._require_operation(operation)
        with session_scope(engine) as session:
            row = session.get(GitExecutionRow, execution_id)
            if row is None or row.operation != operation:
                return None
            return self._public(row)

    def start(self, operation: str, request_id: str, engine) -> dict[str, Any]:
        self._require_operation(operation)
        if not isinstance(request_id, str) or not request_id.strip() or len(request_id) > 80:
            raise ValueError("INVALID_TOOL_REQUEST")
        with self._lock:
            with session_scope(engine) as session:
                existing = session.exec(
                    select(GitExecutionRow).where(
                        GitExecutionRow.operation == operation,
                        GitExecutionRow.request_id == request_id,
                    )
                ).first()
                if existing is not None:
                    return self._public(existing)
            record = self._run(operation, request_id.strip())
            with session_scope(engine) as session:
                session.add(record)
                return self._public(record)

    def process_review(self, operation: str, execution_id: str, engine) -> dict[str, Any] | None:
        row = self.get_execution(operation, execution_id, engine)
        if row is None:
            return None
        return {
            "executionId": row["id"],
            "capabilityId": operation,
            "executionStatus": row["status"],
            "observedAt": _now().isoformat(),
            "completeProcessTreeEvidence": False,
            "truncated": False,
            "steps": [
                {
                    "stepId": "git",
                    "phase": "finished",
                    "process": {
                        "pid": None,
                        "status": "NOT_CAPTURED",
                        "capturedStartedAt": None,
                        "observedStartedAt": None,
                        "capturedExecutable": row["executable"],
                        "observedExecutable": "",
                    },
                    "descendantsCaptured": False,
                }
            ],
        }

    def _run(self, operation: str, request_id: str) -> GitExecutionRow:
        command = list(_COMMANDS[operation])
        executable = shutil.which("git") or ""
        created = _now()
        if not self._workspace.is_dir() or not executable:
            return GitExecutionRow(
                id=f"gex-{uuid.uuid4().hex[:12]}",
                request_id=request_id,
                operation=operation,
                status="FAILED",
                workspace_path=str(self._workspace),
                executable=executable,
                command_json=json.dumps(command),
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
            return GitExecutionRow(
                id=f"gex-{uuid.uuid4().hex[:12]}",
                request_id=request_id,
                operation=operation,
                status="TIMED_OUT",
                workspace_path=str(self._workspace),
                executable=executable,
                command_json=json.dumps(command),
                created_at=created,
                finished_at=_now(),
            )
        stdout, stdout_cut = _clip(completed.stdout or "", _STDOUT_LIMIT)
        stderr, stderr_cut = _clip(completed.stderr or "", _STDERR_LIMIT)
        return GitExecutionRow(
            id=f"gex-{uuid.uuid4().hex[:12]}",
            request_id=request_id,
            operation=operation,
            status="SUCCEEDED" if completed.returncode == 0 else "FAILED",
            workspace_path=str(self._workspace),
            executable=executable,
            command_json=json.dumps(command),
            exit_code=completed.returncode,
            stdout=stdout,
            stderr=stderr,
            truncated=stdout_cut or stderr_cut,
            created_at=created,
            finished_at=_now(),
        )

    def _public(self, row: GitExecutionRow) -> dict[str, Any]:
        command = json.loads(row.command_json or "[]")
        return {
            "id": row.id,
            "requestId": row.request_id,
            "programId": "git",
            "capabilityId": row.operation,
            "workspacePath": row.workspace_path,
            "executable": row.executable,
            "status": row.status,
            "cancelRequested": False,
            "createdAt": row.created_at.isoformat(),
            "finishedAt": row.finished_at.isoformat() if row.finished_at else None,
            "exitCode": row.exit_code,
            "stdout": row.stdout,
            "stderr": row.stderr,
            "truncated": row.truncated,
            "exitEvidence": None,
            "unconfirmedReason": None,
            "resolution": None,
            "steps": [
                {
                    "id": "git",
                    "phase": "finished",
                    "status": row.status,
                    "command": command,
                    "evidence": {},
                }
            ],
        }

    @staticmethod
    def _require_operation(operation: str) -> None:
        if operation not in _COMMANDS:
            raise LookupError("TOOL_OPERATION_NOT_FOUND")


def _clip(text: str, limit: int) -> tuple[str, bool]:
    if len(text) <= limit:
        return text, False
    return text[:limit], True


def _now() -> datetime:
    return datetime.now(timezone.utc)
