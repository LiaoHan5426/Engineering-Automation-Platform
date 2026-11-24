from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.api.problem import problem, problem_from_code
from app.plugins.dsh_package import DshPackageError
from app.plugins.host_bridge import PluginHostBridge
from app.plugins.registry import PluginRegistry

router = APIRouter(prefix="/plugins", tags=["plugins"])


def _registry(request: Request) -> PluginRegistry:
    return request.app.state.plugin_registry


def _bridge(request: Request) -> PluginHostBridge:
    return request.app.state.plugin_host_bridge


@router.get("")
def list_plugins(request: Request) -> dict[str, Any]:
    return _registry(request).list_plugins()


@router.post("/install")
async def install_plugin(request: Request):
    body = await request.json()
    source = Path(str(body.get("sourcePath") or "")).expanduser()
    if not source.is_dir():
        return problem(400, "INVALID_INSTALL_SOURCE", "sourcePath must be a package directory")
    try:
        item = _registry(request).install_from_path(source)
    except DshPackageError as exc:
        return problem(400, str(exc), "not a DSH web client package")
    _bridge(request).sync_enabled()
    return item


@router.post("/{name}/enable")
def enable_plugin(name: str, request: Request):
    try:
        item = _registry(request).enable(name)
    except LookupError:
        return problem_from_code("UNKNOWN_PLUGIN")
    except DshPackageError as exc:
        return problem(400, str(exc), "plugin package broken")
    _bridge(request).sync_enabled()
    return item


@router.post("/{name}/disable")
def disable_plugin(name: str, request: Request):
    try:
        item = _registry(request).disable(name)
    except LookupError:
        return problem_from_code("UNKNOWN_PLUGIN")
    _bridge(request).sync_enabled()
    return item


@router.get("/contributions")
def contributions(request: Request) -> dict[str, Any]:
    return _registry(request).contributions()


@router.get("/{name}/files/{file_path:path}")
def plugin_file(name: str, file_path: str, request: Request):
    try:
        target = _registry(request).resolve_file(name, file_path)
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
        return _bridge(request).status(name)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active; enable the plugin")


@router.post("/host/{name}/sidebar/api/{method}")
async def sidebar_api(name: str, method: str, request: Request):
    body: dict[str, Any] = {}
    try:
        raw = await request.json()
        body = raw if isinstance(raw, dict) else {}
    except Exception:  # noqa: BLE001
        body = {}
    try:
        return _bridge(request).handle_sidebar_api(name, method, body)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active; enable the plugin")


@router.get("/host/{name}/sidebar/api")
def sidebar_api_root(name: str, request: Request):
    try:
        return _bridge(request).handle_sidebar_api(name, "health", {})
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active; enable the plugin")
