"""Same-origin `/sidebar/*` gateway for Cordis Client island fetches.

better-sidebar client resolves Host routes as page-relative `/sidebar/api/...`.
Authority stays on py-backend Host bridge — this router only rewrites to the
enabled plugin's bridge. Vite proxies `/sidebar` here in dev.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app.api.problem import problem
from app.api.plugins import plugin_service

router = APIRouter(tags=["sidebar-host-gateway"])


@router.post("/sidebar/api/{method}")
async def sidebar_api_method(method: str, request: Request):
    if request.headers.get("content-type", "").split(";")[0] != "application/json":
        return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json")
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    if not isinstance(body, dict):
        body = {}
    try:
        return plugin_service(request).sidebar(None, method, body)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "no enabled sidebar plugin")


@router.post("/sidebar/write")
async def sidebar_write(request: Request, path: str, expectedMtimeMs: int):
    # A cross-origin HTML form can send text/plain without a CORS preflight.
    if (request.headers.get("origin") or request.headers.get("sec-fetch-site")) and (
        request.headers.get("sec-fetch-site") != "same-origin"
    ):
        return problem(403, "permission-denied", "File saves require a same-origin request")
    if request.headers.get("content-type", "").split(";")[0] != "text/plain":
        return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected text/plain")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > 1024 * 1024:
            return problem(413, "FILE_TOO_LARGE", "File exceeds 1 MiB")
        data.extend(chunk)
    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError:
        return problem(400, "bad-request", "Expected UTF-8 text")
    try:
        return await run_in_threadpool(plugin_service(request).sidebar, None, "fs.write", {
            "path": path, "expectedMtimeMs": expectedMtimeMs, "content": content,
        })
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "no enabled sidebar plugin")


@router.api_route("/sidebar/api", methods=["GET", "POST"])
async def sidebar_api_root(request: Request):
    body: dict[str, Any] = {}
    if request.method == "POST":
        try:
            raw = await request.json()
            body = raw if isinstance(raw, dict) else {}
        except Exception:  # noqa: BLE001
            body = {}
    try:
        return plugin_service(request).sidebar(None, "health", body)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "no enabled sidebar plugin")


@router.api_route("/sidebar/bundle/{chunk}", methods=["GET", "HEAD"])
def sidebar_bundle(chunk: str, request: Request):
    try:
        path = plugin_service(request).resolve_sidebar_bundle(chunk)
    except LookupError:
        return problem(409, "HOST_NOT_ACTIVE", "plugin host bridge not active")
    except ValueError as exc:
        return problem(400, "INVALID_BUNDLE", str(exc))
    except FileNotFoundError:
        return problem(404, "BUNDLE_NOT_FOUND", "chunk not found")
    return FileResponse(path, media_type="application/javascript")
