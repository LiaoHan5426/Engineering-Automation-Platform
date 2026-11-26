from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.api.problem import problem_from_code
from app.domain.errors import ConnectionErrorCode
from app.persistence.connections import ConnectionStore

router = APIRouter(prefix="/ai", tags=["connections"])


def _store(request: Request) -> ConnectionStore:
    return request.app.state.connections


@router.get("/connections")
def list_connections(request: Request) -> dict[str, Any]:
    return _store(request).list_public()


@router.post("/connections")
async def create_connection(request: Request):
    body = await request.json()
    try:
        return _store(request).create(body if isinstance(body, dict) else {})
    except ValueError as exc:
        return problem_from_code(str(exc) or ConnectionErrorCode.INVALID_CONNECTION)


@router.post("/connections/{connection_id}")
async def update_connection(connection_id: str, request: Request):
    body = await request.json()
    try:
        return _store(request).update(connection_id, body if isinstance(body, dict) else {})
    except LookupError as exc:
        return problem_from_code(str(exc) or ConnectionErrorCode.UNKNOWN_CONNECTION)
    except ValueError as exc:
        return problem_from_code(str(exc) or ConnectionErrorCode.INVALID_CONNECTION)
