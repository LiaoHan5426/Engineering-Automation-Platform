"""Use cases for trusted Git execution observations."""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Protocol

from app.domain.git_execution import GIT_OPERATIONS, GitExecution


class GitExecutionStore(Protocol):
    def list_recent(self, operation: str) -> list[GitExecution]: ...
    def get(self, execution_id: str) -> GitExecution | None: ...
    def find_request(self, operation: str, request_id: str) -> GitExecution | None: ...
    def add(self, execution: GitExecution) -> None: ...


class GitRunner(Protocol):
    def availability(self) -> tuple[bool, bool]: ...
    def run(self, operation: str, request_id: str) -> GitExecution: ...


class GitExecutionService:
    def __init__(self, store: GitExecutionStore, runner: GitRunner) -> None:
        self._store = store
        self._runner = runner
        self._lock = threading.Lock()

    def readiness(self, operation: str) -> dict[str, Any]:
        self._require_operation(operation)
        root_ok, git = self._runner.availability()
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

    def list_executions(self, operation: str) -> dict[str, Any]:
        self._require_operation(operation)
        return {"items": [self._public(row) for row in self._store.list_recent(operation)]}

    def get_execution(self, operation: str, execution_id: str) -> dict[str, Any] | None:
        self._require_operation(operation)
        row = self._store.get(execution_id)
        if row is None or row.operation != operation:
            return None
        return self._public(row)

    def start(self, operation: str, request_id: object) -> dict[str, Any]:
        self._require_operation(operation)
        if not isinstance(request_id, str) or not request_id.strip() or len(request_id) > 80:
            raise ValueError("INVALID_TOOL_REQUEST")
        request_id = request_id.strip()
        with self._lock:
            existing = self._store.find_request(operation, request_id)
            if existing is not None:
                return self._public(existing)
            record = self._runner.run(operation, request_id)
            self._store.add(record)
            return self._public(record)

    def process_review(self, operation: str, execution_id: str) -> dict[str, Any] | None:
        row = self.get_execution(operation, execution_id)
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

    def _public(self, row: GitExecution) -> dict[str, Any]:
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
                    "command": row.command,
                    "evidence": {},
                }
            ],
        }

    @staticmethod
    def _require_operation(operation: str) -> None:
        if operation not in GIT_OPERATIONS:
            raise LookupError("TOOL_OPERATION_NOT_FOUND")


def _now() -> datetime:
    return datetime.now(timezone.utc)
