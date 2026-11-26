"""SQLModel adapter for completed Git observations."""

import json
from dataclasses import asdict, fields

from sqlalchemy.engine import Engine
from sqlmodel import select

from app.domain.git_execution import GitExecution
from app.persistence.db import session_scope
from app.persistence.models import GitExecutionRow


def _to_execution(row: GitExecutionRow) -> GitExecution:
    values = {
        field.name: getattr(row, field.name)
        for field in fields(GitExecution)
        if field.name != "command"
    }
    return GitExecution(command=json.loads(row.command_json or "[]"), **values)


class SqlGitExecutionStore:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def list_recent(self, operation: str) -> list[GitExecution]:
        with session_scope(self._engine) as session:
            rows = session.exec(
                select(GitExecutionRow)
                .where(GitExecutionRow.operation == operation)
                .order_by(GitExecutionRow.created_at.desc())
                .limit(20)
            ).all()
            return [_to_execution(row) for row in rows]

    def get(self, execution_id: str) -> GitExecution | None:
        with session_scope(self._engine) as session:
            row = session.get(GitExecutionRow, execution_id)
            return _to_execution(row) if row is not None else None

    def find_request(self, operation: str, request_id: str) -> GitExecution | None:
        with session_scope(self._engine) as session:
            row = session.exec(
                select(GitExecutionRow).where(
                    GitExecutionRow.operation == operation,
                    GitExecutionRow.request_id == request_id,
                )
            ).first()
            return _to_execution(row) if row is not None else None

    def add(self, execution: GitExecution) -> None:
        values = asdict(execution)
        command = values.pop("command")
        with session_scope(self._engine) as session:
            session.add(GitExecutionRow(command_json=json.dumps(command), **values))
