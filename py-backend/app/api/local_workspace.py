"""Web entry point for local-workspace plugins."""

from typing import Any

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from app.api.problem import problem
from app.infrastructure.local_workspace.files import FsConflictError, FsDirectoryError
from app.infrastructure.local_workspace.registry import WRITE_METHODS, list_workspace_plugins, workspace_handler

router = APIRouter(prefix="/local-workspace", tags=["local-workspace"])


@router.get("/plugins")
def list_plugins(request: Request) -> dict[str, Any]:
    return {"items": list_workspace_plugins(request.app.state.settings.eap_local_workspace_write_enabled)}


@router.post("/{method}")
async def call(method: str, request: Request, body: dict[str, Any]):
    if method in WRITE_METHODS and request.headers.get("content-type", "").split(";")[0] != "application/json":
        return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json")
    settings = request.app.state.settings
    try:
        handler = workspace_handler(method, settings.eap_local_workspace_write_enabled)
        if handler is None:
            return problem(404, "WORKSPACE_METHOD_NOT_REGISTERED", "Local workspace method not registered")
        return await run_in_threadpool(handler, settings.workspace_root, method, body)
    except FsConflictError as exc:
        return problem(409, "fs-conflict", str(exc))
    except FsDirectoryError as exc:
        return problem(400, "fs-directory", str(exc))
    except PermissionError as exc:
        return problem(403, "permission-denied", str(exc))
    except ValueError as exc:
        return problem(400, "bad-request", str(exc))
    except OSError as exc:
        return problem(400, "fs-error", str(exc))
