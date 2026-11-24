from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


def problem(
    status: int,
    code: str,
    detail: str,
    *,
    extras: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": code,
        "status": status,
        "detail": detail,
        "code": code,
    }
    if extras:
        body.update(extras)
    return JSONResponse(
        status_code=status,
        content=body,
        media_type="application/problem+json",
    )


def problem_from_code(code: str) -> JSONResponse:
    mapping: dict[str, tuple[int, str]] = {
        "UNKNOWN_CONVERSATION": (404, "conversation not found"),
        "CONVERSATION_BUSY": (409, "conversation has an active execution"),
        "INVALID_CHAT_REQUEST": (400, "invalid chat request"),
        "INVALID_TASK_CONTEXT": (400, "invalid task context"),
        "MODEL_NOT_CONFIGURED": (503, "model connection or API key not configured"),
        "MODEL_NOT_ALLOWED": (403, "model not allowed for connection"),
        "UNKNOWN_CONNECTION": (404, "connection not found"),
        "INVALID_CONNECTION": (400, "invalid connection payload"),
        "TOOL_MODE_UNSUPPORTED": (400, "tool mode unsupported in thin MVP"),
        "UNKNOWN_PLUGIN": (404, "plugin not installed"),
        "HOST_NOT_ACTIVE": (409, "plugin host bridge not active"),
    }
    status, detail = mapping.get(code, (400, code))
    return problem(status, code, detail)


async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return problem(500, "INTERNAL_ERROR", str(exc) or "internal error")
