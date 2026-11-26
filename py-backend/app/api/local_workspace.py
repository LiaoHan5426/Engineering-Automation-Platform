"""Web entry point for local-workspace plugins."""

from typing import Any

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from app.api.problem import problem
from app.infrastructure.local_workspace.files import UPLOAD_LIMIT, FsConflictError, FsDirectoryError
from app.infrastructure.local_workspace.registry import WRITE_METHODS, list_workspace_plugins, workspace_handler

router = APIRouter(prefix="/local-workspace", tags=["local-workspace"])


@router.get("/plugins")
def list_plugins(request: Request) -> dict[str, Any]:
    settings = request.app.state.settings
    return {"items": list_workspace_plugins(
        settings.eap_local_workspace_write_enabled, settings.eap_local_workspace_remote_git_enabled
    )}


async def read_workspace_upload(request: Request) -> bytearray:
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > UPLOAD_LIMIT:
            raise ValueError("File exceeds 16 MiB")
        data.extend(chunk)
    return data


@router.post("/fs.upload")
async def upload(request: Request, dir: str, relativePath: str, cwd: str | None = None):
    if request.headers.get("content-type", "").split(";")[0] != "application/octet-stream":
        return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/octet-stream")
    if not request.app.state.settings.eap_local_workspace_write_enabled:
        return problem(403, "permission-denied", "Local workspace writes are disabled")
    try:
        data = await read_workspace_upload(request)
    except ValueError as exc:
        return problem(413, "FILE_TOO_LARGE", str(exc))
    return await call("fs.upload", request, {"dir": dir, "relativePath": relativePath, "cwd": cwd, "data": data})


@router.post("/{method}")
async def call(method: str, request: Request, body: dict[str, Any]):
    expected_type = "application/octet-stream" if method == "fs.upload" else "application/json"
    if method in WRITE_METHODS and request.headers.get("content-type", "").split(";")[0] != expected_type:
        return problem(415, "UNSUPPORTED_MEDIA_TYPE", f"Expected {expected_type}")
    if method == "fs.remove" and body.get("confirmed") is not True:
        return problem(400, "bad-request", "Removal requires confirmation")
    settings = request.app.state.settings
    try:
        handler = workspace_handler(
            method, settings.eap_local_workspace_write_enabled, settings.eap_local_workspace_remote_git_enabled
        )
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
    except FileExistsError as exc:
        return problem(409, "fs-error", str(exc))
    except OSError as exc:
        return problem(400, "fs-error", str(exc))
