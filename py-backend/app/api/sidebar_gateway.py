"""Same-origin `/sidebar/*` gateway for Cordis Client island fetches.

better-sidebar client resolves Host routes as page-relative `/sidebar/api/...`.
Authority stays on py-backend Host bridge — this router only rewrites to the
enabled plugin's bridge. Vite proxies `/sidebar` here in dev.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.api.problem import problem
from app.plugins.host_bridge import PluginHostBridge

router = APIRouter(tags=["sidebar-host-gateway"])


def _bridge(request: Request) -> PluginHostBridge:
    return request.app.state.plugin_host_bridge


def _plugin_name(request: Request) -> str | None:
    return _bridge(request).primary_sidebar_plugin()


@router.post("/sidebar/api/{method}")
async def sidebar_api_method(method: str, request: Request):
    name = _plugin_name(request)
    if name is None:
        return problem(409, "HOST_NOT_ACTIVE", "no enabled sidebar plugin")
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    if not isinstance(body, dict):
        body = {}
    return _bridge(request).handle_sidebar_api(name, method, body)


@router.api_route("/sidebar/api", methods=["GET", "POST"])
async def sidebar_api_root(request: Request):
    name = _plugin_name(request)
    if name is None:
        return problem(409, "HOST_NOT_ACTIVE", "no enabled sidebar plugin")
    body: dict[str, Any] = {}
    if request.method == "POST":
        try:
            raw = await request.json()
            body = raw if isinstance(raw, dict) else {}
        except Exception:  # noqa: BLE001
            body = {}
    return _bridge(request).handle_sidebar_api(name, "health", body)


@router.get("/sidebar/bundle/{chunk}")
def sidebar_bundle(chunk: str, request: Request):
    name = _plugin_name(request)
    if name is None:
        return problem(409, "HOST_NOT_ACTIVE", "no enabled sidebar plugin")
    try:
        path = _bridge(request).resolve_bundle(name, chunk)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active")
    except ValueError as exc:
        return problem(400, "INVALID_BUNDLE", str(exc))
    except FileNotFoundError:
        return problem(404, "BUNDLE_NOT_FOUND", "chunk not found")
    return FileResponse(path, media_type="application/javascript")
