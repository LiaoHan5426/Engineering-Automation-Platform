"""Trusted git status and diff executions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.api.problem import problem, problem_from_code
from app.application.git_executions import GitExecutionService

router = APIRouter(prefix="/cli-programs/git/operations", tags=["git"])


def _git(request: Request) -> GitExecutionService:
    return request.app.state.git_executions


def _guard(action):
    try:
        return action()
    except LookupError as exc:
        return problem(404, str(exc), "git operation not found")
    except ValueError as exc:
        return problem_from_code(str(exc))


@router.get("/{operation}/executions/readiness")
def readiness(operation: str, request: Request):
    return _guard(lambda: _git(request).readiness(operation))


@router.get("/{operation}/executions")
def list_executions(operation: str, request: Request):
    return _guard(lambda: _git(request).list_executions(operation))


@router.post("/{operation}/executions")
async def start_execution(operation: str, request: Request):
    body = await request.json()
    request_id = body.get("requestId") if isinstance(body, dict) else None

    def run() -> dict[str, Any]:
        return _git(request).start(operation, request_id)

    return _guard(run)


@router.get("/{operation}/executions/{execution_id}")
def get_execution(operation: str, execution_id: str, request: Request):
    def run():
        row = _git(request).get_execution(operation, execution_id)
        if row is None:
            return problem(404, "UNKNOWN_TOOL_EXECUTION", "git execution not found")
        return row

    return _guard(run)


@router.post("/{operation}/executions/{execution_id}/cancel")
def cancel_execution(operation: str, execution_id: str, request: Request):
    """Finished observations stay finished. There is no live process to cancel."""

    def run():
        row = _git(request).get_execution(operation, execution_id)
        if row is None:
            return problem(404, "UNKNOWN_TOOL_EXECUTION", "git execution not found")
        return row

    return _guard(run)


@router.get("/{operation}/executions/{execution_id}/process-review")
def process_review(operation: str, execution_id: str, request: Request):
    def run():
        review = _git(request).process_review(operation, execution_id)
        if review is None:
            return problem(404, "UNKNOWN_TOOL_EXECUTION", "git execution not found")
        return review

    return _guard(run)
