from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.api.problem import problem, problem_from_code
from app.application.plugins import PluginService
from app.domain.plugin_errors import (
    DshPackageError, InstallFetchError, InstallSpecMissingError, InvalidInstallSpecError,
)

router = APIRouter(prefix="/plugins", tags=["plugins"])


def plugin_service(request: Request) -> PluginService:
    return request.app.state.plugins


@router.get("")
def list_plugins(request: Request) -> dict[str, Any]:
    return plugin_service(request).list_plugins()


@router.post("/install")
async def install_plugin(request: Request):
    body = await request.json()
    raw = str(body.get("spec") or body.get("sourcePath") or "") if isinstance(body, dict) else ""
    try:
        return await plugin_service(request).install(raw)
    except InvalidInstallSpecError as exc:
        return problem(400, "INVALID_INSTALL_SPEC", exc.reason)
    except InstallFetchError as exc:
        return problem(400, exc.code, str(exc))
    except DshPackageError as exc:
        return problem(400, str(exc), "not a DSH web client package")


@router.post("/{name}/enable")
def enable_plugin(name: str, request: Request):
    try:
        item = plugin_service(request).enable(name)
    except LookupError:
        return problem_from_code("UNKNOWN_PLUGIN")
    except DshPackageError as exc:
        return problem(400, str(exc), "plugin package broken")
    return item


@router.post("/{name}/disable")
def disable_plugin(name: str, request: Request):
    try:
        item = plugin_service(request).disable(name)
    except LookupError:
        return problem_from_code("UNKNOWN_PLUGIN")
    return item


@router.post("/{name}/update")
def update_plugin(name: str, request: Request):
    try:
        return plugin_service(request).update(name)
    except LookupError:
        return problem_from_code("UNKNOWN_PLUGIN")
    except InstallSpecMissingError as exc:
        return problem(409, "INSTALL_SPEC_MISSING", str(exc))
    except InvalidInstallSpecError as exc:
        return problem(400, "INVALID_INSTALL_SPEC", exc.reason)
    except InstallFetchError as exc:
        return problem(400, exc.code, str(exc))
    except DshPackageError as exc:
        return problem(400, str(exc), "not a DSH web client package")


@router.post("/{name}/uninstall")
def uninstall_plugin(name: str, request: Request):
    try:
        return plugin_service(request).uninstall(name)
    except LookupError:
        return problem_from_code("UNKNOWN_PLUGIN")


@router.get("/contributions")
def contributions(request: Request) -> dict[str, Any]:
    return plugin_service(request).contributions()


@router.get("/{name}/files/{file_path:path}")
def plugin_file(name: str, file_path: str, request: Request):
    try:
        target = plugin_service(request).resolve_file(name, file_path)
    except LookupError:
        return problem_from_code("UNKNOWN_PLUGIN")
    except DshPackageError:
        return problem(400, "PATH_ESCAPE", "invalid plugin file path")
    if not target.is_file():
        return problem(404, "PLUGIN_FILE_NOT_FOUND", "file not found")
    media = "application/javascript" if target.suffix == ".js" else None
    return FileResponse(target, media_type=media)


@router.get("/host/{name}/status")
def host_status(name: str, request: Request):
    try:
        return plugin_service(request).status(name)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active; enable the plugin")


@router.post("/host/{name}/sidebar/api/{method}")
async def sidebar_api(name: str, method: str, request: Request):
    if request.headers.get("content-type", "").split(";")[0] != "application/json":
        return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json")
    body: dict[str, Any] = {}
    try:
        raw = await request.json()
        body = raw if isinstance(raw, dict) else {}
    except Exception:  # noqa: BLE001
        body = {}
    try:
        return plugin_service(request).sidebar(name, method, body)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active; enable the plugin")


@router.get("/host/{name}/sidebar/api")
def sidebar_api_root(name: str, request: Request):
    try:
        return plugin_service(request).sidebar(name, "health", {})
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active; enable the plugin")
