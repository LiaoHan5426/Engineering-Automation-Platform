"""Native DSH settings and plugin manager RPC over EAP's plugin registry."""

import json
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.application import dsh_models
from app.infrastructure.llm_openai import list_model_catalog
from app.infrastructure.plugins.versions import REGISTRY_URL, list_registry_versions, registry_managed
from app.domain.plugin_errors import DshPackageError, InstallFetchError, InvalidInstallSpecError

router = APIRouter(tags=["dsh-management"])


class ManagementFrame(BaseModel):
    type: Literal["client-request"]
    rpcId: str
    method: str
    payload: dict[str, Any]


@router.post("/settings/describe")
@router.post("/settings/mutate")
@router.post("/credentials/describe")
@router.post("/credentials/set")
@router.post("/credentials/unset")
@router.post("/llm/listProviders")
@router.post("/llm/discoverModels")
@router.post("/llm/listConfigurableProviders")
@router.post("/pluginInventory/list")
@router.post("/pluginManager/listPlugins")
@router.post("/pluginManager/listBundles")
@router.post("/pluginManager/listVersions")
@router.post("/pluginManager/updateBundle")
@router.post("/pluginManager/readBundleDetail")
@router.post("/pluginManager/setBundleEnabled")
@router.post("/pluginManager/removeBundle")
@router.post("/pluginManager/registries")
@router.post("/pluginManager/inspect")
@router.post("/pluginManager/installBundle")
@router.post("/pluginManager/waitForInstall")
@router.post("/pluginManager/cancelInstall")
async def manage(frame: ManagementFrame, request: Request):
    response = {"type": "server-response", "rpcId": frame.rpcId}

    def success(value):
        return {**response, "result": {"ok": True, "value": value}}

    def reject(code, message):
        return {**response, "result": {"ok": False, "error": {
            "code": code, "message": message, "details": {},
        }}}

    method = request.url.path.removeprefix("/api/")
    args = frame.payload.get("args")
    if frame.method != method or not isinstance(args, dict):
        return reject("gateway/bad-request", "Invalid management request.")
    connections = request.app.state.connections
    if method == "settings/describe":
        return success({
            "writable": True, "hasDocument": False, "namespaces": [{
                "ns": "ui-settings", "autoGenerate": False,
                "schema": {"uid": 2, "refs": {
                    "1": {"type": "boolean", "meta": {"default": True}},
                    "2": {"type": "object", "meta": {"default": {}}, "dict": {"enabled": 1}},
                }},
                "value": {"enabled": True}, "applies": "live", "secrets": [], "revision": 0,
            }, dsh_models.namespace_view(connections)],
        })

    if method == "settings/mutate":
        ops = args.get("ops")
        revision = args.get("expectedRevision")
        if (args.get("ns") != dsh_models.NAMESPACE or not isinstance(ops, list)
                or len(ops) > 128 or not all(isinstance(op, dict) for op in ops)
                or (revision is not None and type(revision) is not int)):
            return reject("gateway/bad-request", "Invalid model settings request.")
        try:
            return success(dsh_models.mutate(connections, ops, revision))
        except RuntimeError:
            return reject("settings/conflict", "Model configuration changed. Reload and try again.")
        except (ValueError, TypeError) as exc:
            return reject("settings/rejected", str(exc))

    if method == "credentials/describe":
        refs = args.get("refs")
        if not isinstance(refs, list) or len(refs) > 64 or not all(isinstance(ref, str) for ref in refs):
            return reject("gateway/bad-request", "Invalid credential references.")
        return success(dsh_models.credentials(connections, refs))

    if method in ("credentials/set", "credentials/unset"):
        ref = args.get("ref")
        value = args.get("value") if method == "credentials/set" else ""
        if not isinstance(ref, str) or not isinstance(value, str) or len(value) > 16384 or (method == "credentials/set" and not value):
            return reject("gateway/bad-request", "Invalid model credential request.")
        try:
            dsh_models.set_credential(connections, ref, value)
        except LookupError:
            return reject("settings/rejected", "This credential is outside the model connection store.")
        return success(None)

    if method == "llm/discoverModels":
        draft = args.get("request")
        if args.get("settingsNs") != dsh_models.NAMESPACE or not isinstance(draft, dict):
            return reject("gateway/bad-request", "Invalid model discovery request.")
        try:
            return success(await dsh_models.discover(connections, draft, list_model_catalog))
        except ValueError as exc:
            return reject("llm/model-discovery-rejected", str(exc))

    if method == "llm/listProviders":
        providers = {
            item["id"]: item["name"]
            for item in connections.list_public()["items"]
            if item["enabled"] and item["secretPresent"] and item["kind"] == "openai-compatible"
        }
        current = connections.effective()
        if current is not None and current.secret_present and current.kind == "openai-compatible":
            providers.setdefault(current.id, current.name)
        return success([{"id": key, "name": name} for key, name in providers.items()])
    if method == "llm/listConfigurableProviders":
        return success(dsh_models.directory(connections))

    if method == "pluginInventory/list":
        settings = request.app.state.settings
        dist = settings.eap_dsh_web_dist
        if dist is None:
            dist = Path(__file__).resolve().parents[3] / "frontend/apps/dsh-boot-verify/dist"
        graph = dist / "eap-dsh/core-graph.json"
        entries = json.loads(graph.read_text(encoding="utf-8"))["entries"] if graph.is_file() else []
        return success({
            "entries": [{
                "entryId": row["id"], "moduleName": row["id"],
                "enabled": True, "fiberPhase": None,
            } for row in entries],
            "managementAvailable": True,
        })
    if method == "pluginManager/listPlugins":
        return success([])

    service = request.app.state.plugins
    if method == "pluginManager/listBundles":
        return success([{
            "name": item["name"], "version": item["version"],
            "description": item.get("description") or "",
            "official": False, "availability": "missing" if item.get("broken") else "profile",
            "enabled": item["enabled"], "installed": True, "optional": False, "removable": True,
            "rows": [], "overrides": [],
            **({"update": "registry", "source": item["installSpec"]} if registry_managed(item) else {}),
        } for item in service.list_plugins()["items"]])

    if method == "pluginManager/registries":
        return success({"registry": REGISTRY_URL, "fallbackRegistries": [], "resolved": REGISTRY_URL})
    if method in ("pluginManager/waitForInstall", "pluginManager/cancelInstall"):
        request_id = args.get("requestId")
        if not isinstance(request_id, str) or not request_id or len(request_id) > 128:
            return reject("gateway/bad-request", "Invalid install request ID.")
        if method.endswith("/waitForInstall"):
            return success(await service.wait_for_install(request_id))
        return success(service.cancel_install(request_id))

    name = args.get("name")
    try:
        if method in ("pluginManager/inspect", "pluginManager/installBundle"):
            spec = args.get("spec")
            options = args.get("options")
            if options is None:
                options = {}
            if not isinstance(spec, str) or len(spec) > 4096 or not isinstance(options, dict):
                return reject("gateway/bad-request", "Invalid plugin installation request.")
            if options.get("registry") not in (None, REGISTRY_URL):
                if method.endswith("/inspect"):
                    return success({"status": "refused", "problem": "invalid-spec",
                                    "reason": "This host uses the public npm registry."})
                return reject("gateway/bad-request", "Unsupported registry.")
            if method.endswith("/inspect"):
                return success(await run_in_threadpool(service.inspect, spec))
            enabled = options.get("enabled", True)
            request_id = options.get("requestId")
            expected = options.get("expected")
            if (type(enabled) is not bool or options.get("approvedBuilds")
                    or (request_id is not None and (not isinstance(request_id, str) or not request_id or len(request_id) > 128))
                    or (expected is not None and (not isinstance(expected, dict) or not all(
                        isinstance(expected.get(key), str) and expected[key] for key in ("name", "version")
                    )))):
                return reject("gateway/bad-request", "Unsupported plugin installation options.")
            return success(await service.install_native(spec, enabled, request_id, expected))
        if not isinstance(name, str) or not name:
            return reject("gateway/bad-request", "Plugin name is required.")
        if method in ("pluginManager/listVersions", "pluginManager/updateBundle"):
            options = args.get("options") or {}
            if not isinstance(options, dict) or options.get("registry") not in (None, REGISTRY_URL):
                return reject("gateway/bad-request", "Unsupported registry.")
            if method == "pluginManager/listVersions":
                item = next((row for row in service.list_plugins()["items"] if row["name"] == name), None)
                if item is None:
                    return reject("UNKNOWN_PLUGIN", "Plugin does not exist.")
                return success(await list_registry_versions(item))
            version = args.get("version")
            if not isinstance(version, str) or options.get("spec") is not None:
                return reject("gateway/bad-request", "An npm version is required.")
            return success(await run_in_threadpool(service.update_registry, name, version))
        if method == "pluginManager/readBundleDetail":
            for filename in ("README.md", "readme.md"):
                path = service.resolve_file(name, filename)
                if not path.is_file():
                    continue
                with path.open("rb") as document:
                    content = document.read(256 * 1024 + 1)
                if len(content) > 256 * 1024:
                    return reject("plugin-manager/too-large", "Plugin documentation exceeds the size limit.")
                return success({
                    "status": "found", "origin": "readme", "path": filename,
                    "markdown": content.decode("utf-8-sig", errors="replace"),
                })
            return success({"status": "none"})
        if method == "pluginManager/removeBundle":
            service.uninstall(name)
            return success({"changed": True, "application": "applied", "stage": "remove", "target": name})
        enabled = args.get("enabled")
        if type(enabled) is not bool:
            return reject("gateway/bad-request", "Plugin enablement must be boolean.")
        item = service.enable(name) if enabled else service.disable(name)
        return success({
            "changed": True, "application": "applied", "stage": "enable", "target": name,
            "enabled": item["enabled"],
        })
    except LookupError:
        return reject("UNKNOWN_PLUGIN", "Plugin does not exist.")
    except (InvalidInstallSpecError, InstallFetchError, DshPackageError):
        return reject("PLUGIN_INSTALL_FAILED", "Plugin operation failed.")
