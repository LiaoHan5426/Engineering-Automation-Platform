"""SQLite-backed board task store."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text, update as sql_update
from sqlalchemy.engine import Engine
from sqlmodel import select

from app.persistence.db import session_scope
from app.persistence.models import BoardTaskRow

BOARD_COLUMNS = frozenset({"planned", "ready", "running", "acceptance", "done"})
CREATE_COLUMNS = frozenset({"planned", "ready"})


@dataclass(frozen=True)
class BoardTaskDraft:
    project_id: str
    title: str
    column: str
    session_id: str
    goal: str
    acceptance_criteria: str
    request_id: str


def _parse_json_list(raw: str) -> list[Any]:
    try:
        value = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def _present(row: BoardTaskRow) -> dict[str, Any]:
    goal = row.goal or ""
    acceptance = row.acceptance_criteria or ""
    preparation: list[str] = []
    if not goal.strip():
        preparation.append("goal")
    if not acceptance.strip():
        preparation.append("acceptanceCriteria")
    column = row.column
    if row.execution_active or column not in CREATE_COLUMNS:
        allowed: list[str] = []
    elif preparation:
        allowed = ["planned"]
    else:
        allowed = ["planned", "ready"]
    return {
        "id": row.id,
        "projectId": row.project_id,
        "title": row.title,
        "column": column,
        "notes": row.notes or "",
        "sessionId": row.session_id or "",
        "revision": row.revision,
        "events": _parse_json_list(row.events_json),
        "priority": row.priority or "none",
        "goal": goal,
        "acceptanceCriteria": acceptance,
        "executionActive": bool(row.execution_active),
        "prototypeVersionId": row.prototype_version_id,
        "preparationIssues": preparation,
        "allowedColumns": allowed,
    }


class SqlBoardTaskStore:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def list_by_project(self, project_id: str) -> list[dict[str, Any]]:
        with session_scope(self._engine) as session:
            rows = session.exec(
                select(BoardTaskRow)
                .where(BoardTaskRow.project_id == project_id)
                .order_by(BoardTaskRow.created_at.desc())
                .limit(200)
            ).all()
            return [_present(row) for row in rows]

    def get(self, task_id: str, project_id: str) -> dict[str, Any] | None:
        with session_scope(self._engine) as session:
            row = session.exec(
                select(BoardTaskRow).where(
                    BoardTaskRow.id == task_id,
                    BoardTaskRow.project_id == project_id,
                )
            ).first()
            return _present(row) if row is not None else None

    def create(self, draft: BoardTaskDraft) -> dict[str, Any]:
        payload = [draft.title.strip(), draft.column, draft.session_id, draft.goal, draft.acceptance_criteria]
        fingerprint = hashlib.sha256(json.dumps(payload).encode("utf-8")).hexdigest()
        row = BoardTaskRow(
            id=str(uuid.uuid4()),
            project_id=draft.project_id,
            title=draft.title.strip(),
            column=draft.column,
            session_id=draft.session_id,
            goal=draft.goal,
            acceptance_criteria=draft.acceptance_criteria,
            notes="",
            priority="none",
            revision=1,
            events_json=json.dumps(["created"]),
            execution_active=False,
            prototype_version_id=None,
            preparation_issues_json="[]",
            allowed_columns_json="[]",
            create_request_id=draft.request_id,
            create_fingerprint=fingerprint,
        )
        with session_scope(self._engine) as session:
            session.execute(text("BEGIN IMMEDIATE"))
            existing = session.exec(select(BoardTaskRow).where(
                BoardTaskRow.project_id == draft.project_id,
                BoardTaskRow.create_request_id == draft.request_id,
            )).first()
            if existing is not None:
                if existing.create_fingerprint != fingerprint:
                    raise ValueError("BOARD_REQUEST_CONFLICT")
                return _present(existing)
            session.add(row)
            session.flush()
            session.refresh(row)
            return _present(row)

    def update(self, task_id: str, project_id: str, revision: int, patch: dict[str, str]) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            scope = (BoardTaskRow.id == task_id, BoardTaskRow.project_id == project_id)
            row = session.exec(select(BoardTaskRow).where(*scope)).first()
            if row is None:
                raise LookupError("BOARD_TASK_NOT_FOUND")
            if row.revision != revision:
                raise ValueError("BOARD_REVISION_CONFLICT")
            if row.execution_active:
                raise ValueError("BOARD_EXECUTION_ACTIVE")

            target = patch.get("column", row.column)
            if row.column not in CREATE_COLUMNS or target not in CREATE_COLUMNS:
                raise ValueError("BOARD_EXECUTION_EVIDENCE_REQUIRED")
            goal = patch.get("goal", row.goal)
            acceptance = patch.get("acceptance_criteria", row.acceptance_criteria)
            if target == "ready" and (not goal.strip() or not acceptance.strip()):
                raise ValueError("BOARD_PREPARATION_REQUIRED")

            changes = {key: value for key, value in patch.items() if getattr(row, key) != value}
            if not changes:
                return _present(row)
            events = _parse_json_list(row.events_json)
            if "column" in changes:
                events.append(target)
            if "notes" in changes:
                events.append("notes_updated")
            if "priority" in changes:
                events.append("priority_updated")
            if {"goal", "acceptance_criteria"} & changes.keys():
                events.append("preparation_updated")

            saved = session.execute(
                sql_update(BoardTaskRow)
                .where(*scope, BoardTaskRow.revision == revision, BoardTaskRow.execution_active.is_(False))
                .values(**changes, revision=revision + 1, events_json=json.dumps(events))
                .execution_options(synchronize_session=False)
            )
            if saved.rowcount != 1:
                raise ValueError("BOARD_REVISION_CONFLICT")
            session.refresh(row)
            return _present(row)