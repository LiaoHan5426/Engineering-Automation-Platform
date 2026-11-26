from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Request

from app.api.problem import problem
from app.infrastructure.board.store import (
    BOARD_COLUMNS,
    CREATE_COLUMNS,
    BoardTaskDraft,
    SqlBoardTaskStore,
)

router = APIRouter(prefix="/board", tags=["board"])

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _store(request: Request) -> SqlBoardTaskStore:
    return request.app.state.board_tasks


def _valid_text(value: Any, limit: int) -> bool:
    return isinstance(value, str) and len(value) <= limit


@router.get("/tasks")
def list_tasks(request: Request, projectId: str) -> dict[str, Any]:
    if not projectId or not projectId.strip() or len(projectId) > 120:
        return problem(400, "INVALID_BOARD_FIELD", "invalid board field")
    items = _store(request).list_by_project(projectId)
    return {"items": items}


@router.get("/tasks/{task_id}")
def get_task(task_id: str, request: Request, projectId: str):
    if not projectId or not projectId.strip() or len(projectId) > 120:
        return problem(400, "INVALID_BOARD_FIELD", "invalid board field")
    task = _store(request).get(task_id, projectId)
    if task is None:
        return problem(404, "BOARD_TASK_NOT_FOUND", "board task not found")
    return task


@router.post("/tasks")
async def create_task(request: Request):
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    if not isinstance(body, dict):
        return problem(400, "INVALID_BOARD_FIELD", "invalid board field")
    if (
        not _valid_text(body.get("projectId"), 120)
        or not str(body.get("projectId", "")).strip()
        or not _valid_text(body.get("title"), 200)
        or not str(body.get("title", "")).strip()
    ):
        return problem(400, "INVALID_BOARD_FIELD", "invalid board field")
    column = body.get("column")
    if column is None:
        column = "planned"
    if not isinstance(column, str) or column not in CREATE_COLUMNS:
        return problem(400, "INVALID_BOARD_INITIAL_COLUMN", "invalid initial column")
    goal = body.get("goal", "")
    acceptance = body.get("acceptanceCriteria", "")
    session_id = body.get("sessionId", "")
    if not _valid_text(goal, 4000) or not _valid_text(acceptance, 4000) or not _valid_text(session_id, 120):
        return problem(400, "BOARD_TEXT_TOO_LONG", "board text too long")
    request_id = body.get("requestId")
    if not isinstance(request_id, str) or not _UUID.fullmatch(request_id):
        return problem(400, "BOARD_REQUEST_ID_REQUIRED", "board request id required")
    if column == "ready" and (not goal.strip() or not acceptance.strip()):
        return problem(409, "BOARD_PREPARATION_REQUIRED", "board preparation required")
    draft = BoardTaskDraft(
        project_id=str(body["projectId"]).strip(),
        title=str(body["title"]).strip(),
        column=str(column),
        session_id=session_id,
        goal=goal,
        acceptance_criteria=acceptance,
        request_id=request_id,
    )
    try:
        return _store(request).create(draft)
    except ValueError as exc:
        return problem(409, str(exc), "board task creation rejected")

@router.post("/tasks/{task_id}")
async def update_task(task_id: str, request: Request):
    try:
        body = await request.json()
    except ValueError:
        body = None
    if not isinstance(body, dict):
        return problem(400, "INVALID_BOARD_FIELD", "invalid board field")
    project_id = body.get("projectId")
    if not _valid_text(project_id, 120) or not project_id.strip():
        return problem(400, "INVALID_BOARD_FIELD", "invalid board field")
    revision = body.get("revision")
    if type(revision) is not int or revision < 1:
        return problem(400, "INVALID_BOARD_REVISION", "invalid board revision")

    fields = {"notes": "notes", "goal": "goal", "acceptanceCriteria": "acceptance_criteria"}
    patch = {}
    for wire, column in fields.items():
        value = body.get(wire)
        if value is not None:
            if not _valid_text(value, 4000):
                return problem(400, "BOARD_TEXT_TOO_LONG", "invalid board text")
            patch[column] = value
    for field, allowed, code in (
        ("column", BOARD_COLUMNS, "INVALID_BOARD_COLUMN"),
        ("priority", {"none", "p0", "p1", "p2"}, "INVALID_BOARD_PRIORITY"),
    ):
        value = body.get(field)
        if value is not None:
            if not isinstance(value, str) or value not in allowed:
                return problem(400, code, "invalid board field")
            patch[field] = value
    try:
        return _store(request).update(task_id, project_id, revision, patch)
    except LookupError as exc:
        return problem(404, str(exc.args[0]), "board task not found")
    except ValueError as exc:
        return problem(409, str(exc), "board task update rejected")