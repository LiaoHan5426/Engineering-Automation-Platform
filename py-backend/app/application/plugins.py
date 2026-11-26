"""Plugin lifecycle and Host operations exposed to transport adapters."""

import asyncio
from collections.abc import Callable
from pathlib import Path
from typing import Any, TYPE_CHECKING

from app.infrastructure.plugins.dsh_package import read_dsh_package
from app.infrastructure.plugins.install_spec import parse_install_spec
from app.infrastructure.plugins.installer import install_from_spec, install_registry_version, registry_manifest
from app.infrastructure.plugins.versions import REGISTRY_URL, registry_managed, semver_key
from app.domain.plugin_errors import (
    DshPackageError, InstallFetchError, InstallSpecMissingError, InvalidInstallSpecError,
)

if TYPE_CHECKING:
    from app.infrastructure.plugins.host_bridge import PluginHostBridge
    from app.infrastructure.plugins.registry import PluginRegistry
    from app.services.notify_hub import NotifyHub


class PluginService:
    def __init__(
        self,
        registry: "PluginRegistry",
        bridge: "PluginHostBridge",
        install: Callable[[str], dict[str, Any]],
        notifications: "NotifyHub",
    ) -> None:
        self._registry = registry
        self._bridge = bridge
        self._install = install
        self._notifications = notifications
        self._native_installs: dict[str, tuple[tuple, asyncio.Task]] = {}
        self._native_install_lock = asyncio.Lock()

    def list_plugins(self) -> dict[str, Any]:
        return self._registry.list_plugins()

    async def install(self, spec: str) -> dict[str, Any]:
        try:
            item = self._install(spec)
        except (InvalidInstallSpecError, InstallFetchError, DshPackageError) as exc:
            await self._notifications.publish(
                kind="system",
                severity="error",
                code="PLUGIN_INSTALL_FAILED",
                title="插件安装失败",
                text=exc.reason if isinstance(exc, InvalidInstallSpecError) else str(exc),
            )
            raise
        self._bridge.sync_enabled()
        return item

    def inspect(self, spec: str) -> dict[str, Any]:
        def refused(problem: str, reason: str) -> dict[str, Any]:
            return {"status": "refused", "problem": problem, "reason": reason}

        try:
            parsed = parse_install_spec(spec)
        except InvalidInstallSpecError as exc:
            return refused("invalid-spec", exc.reason)
        inspected = {"status": "accepted", "kind": parsed.kind, "bundle": None, "registry": REGISTRY_URL}
        if parsed.kind in ("git", "tarball"):
            if parsed.path and not Path(parsed.path).is_file():
                return refused("not-a-package", "The package archive does not exist.")
            return {**inspected, **({"host": parsed.host} if parsed.host else {})}
        if parsed.kind == "registry" and self._registry.get(parsed.name) is not None:
            return refused("already-installed", "This plugin is already installed.")
        try:
            if parsed.kind == "path":
                package = read_dsh_package(Path(parsed.path))
                name, version, description = package.name, package.version, package.description
                bundle = package.has_bundle_patch
            else:
                manifest = registry_manifest(parsed, self._registry.staging_root)
                name, version = manifest["name"], manifest["version"]
                description = manifest.get("description") or ""
                dsh = manifest.get("dsh")
                bundle = isinstance(dsh, dict) and isinstance(dsh.get("bundle"), dict) and bool(dsh["bundle"].get("patch"))
                if bundle and (not isinstance(dsh.get("client"), dict) or dsh["client"].get("platform") != "web"):
                    return refused("not-a-package", "The bundle does not supply a DSH Web client.")
        except (DshPackageError, OSError):
            return refused("not-a-package", "The directory does not contain a readable DSH Web plugin.")
        except InstallFetchError as exc:
            return {**refused("not-found" if exc.code == "INSPECT_NOT_FOUND" else "network", str(exc)),
                    "registries": [REGISTRY_URL]}
        if not bundle:
            return refused("not-a-bundle", "The package does not declare a DSH bundle.")
        if self._registry.get(name) is not None:
            return refused("already-installed", "This plugin is already installed.")
        return {**inspected, "name": name, "version": version, "description": description, "bundle": True}

    async def install_native(
        self, spec: str, enabled: bool, request_id: str | None, expected: dict | None,
    ) -> dict[str, Any]:
        fingerprint = (spec, enabled, expected)
        if request_id is None:
            return await self._run_native_install(spec, enabled, expected)
        existing = self._native_installs.get(request_id)
        if existing is not None:
            if existing[0] != fingerprint:
                raise InvalidInstallSpecError(spec, "The install request ID was already used for another operation.")
            return await asyncio.shield(existing[1])
        if len(self._native_installs) >= 64:
            completed = next((key for key, (_, job) in self._native_installs.items() if job.done()), None)
            if completed is None:
                raise InvalidInstallSpecError(spec, "There are too many pending install requests.")
            self._native_installs.pop(completed)
        job = asyncio.create_task(self._run_native_install(spec, enabled, expected))
        self._native_installs[request_id] = (fingerprint, job)
        return await asyncio.shield(job)

    async def _run_native_install(self, spec: str, enabled: bool, expected: dict | None) -> dict[str, Any]:
        async with self._native_install_lock:
            try:
                item = await asyncio.to_thread(
                    install_from_spec, self._registry, spec, enabled=enabled, require_bundle=True, expected=expected,
                )
            except (InvalidInstallSpecError, InstallFetchError, DshPackageError, OSError) as exc:
                code = exc.code if isinstance(exc, InstallFetchError) else "PLUGIN_INSTALL_FAILED"
                return {"changed": False, "application": "failed", "stage": "install", "target": spec,
                        "error": {"code": code, "message": "Could not install the DSH plugin.", "details": {}}}
            self._bridge.sync_enabled()
            return {"changed": True, "application": "applied", "stage": "install", "target": spec,
                    "bundle": item["name"], "version": item["version"], "enabled": item["enabled"]}

    async def wait_for_install(self, request_id: str) -> dict[str, Any] | None:
        existing = self._native_installs.get(request_id)
        return await asyncio.shield(existing[1]) if existing is not None else None

    def cancel_install(self, request_id: str) -> dict[str, str]:
        return {"status": "too-late" if request_id in self._native_installs else "not-running"}

    def update(self, name: str) -> dict[str, Any]:
        spec = self._registry.install_spec_of(name)
        if not spec.strip():
            raise InstallSpecMissingError("plugin has no recorded install spec")
        item = self._install(spec)
        self._bridge.sync_enabled()
        return item

    def update_registry(self, name: str, version: str) -> dict[str, Any]:
        item = next((item for item in self.list_plugins()["items"] if item["name"] == name), None)
        if item is None:
            raise LookupError(name)
        target = semver_key(version)
        current = semver_key(item["version"])
        if not registry_managed(item) or target is None or current is None or target <= current:
            raise InstallFetchError("INVALID_PLUGIN_UPDATE", "Select a newer version from the recorded npm source.")
        updated = install_registry_version(self._registry, name, version, REGISTRY_URL)
        self._bridge.sync_enabled()
        return {"from": item["version"], "to": updated["version"], "step": "install", "result": {
            "changed": True, "application": "applied", "stage": "install", "target": name,
            "bundle": name, "version": updated["version"], "enabled": updated["enabled"],
        }}

    def enable(self, name: str) -> dict[str, Any]:
        item = self._registry.enable(name)
        self._bridge.sync_enabled()
        return item

    def disable(self, name: str) -> dict[str, Any]:
        item = self._registry.disable(name)
        self._bridge.sync_enabled()
        return item

    def uninstall(self, name: str) -> dict[str, Any]:
        self._registry.uninstall(name)
        self._bridge.sync_enabled()
        return {"name": name, "removed": True}

    def contributions(self) -> dict[str, Any]:
        return self._registry.contributions()

    def resolve_file(self, name: str, path: str) -> Path:
        return self._registry.resolve_file(name, path)

    def status(self, name: str) -> dict[str, Any]:
        return self._bridge.status(name)

    def sidebar(self, name: str | None, method: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._bridge.handle_sidebar_api(self._sidebar_name(name), method, body)

    def sidebar_opens(self, session_id: str):
        return self._bridge.sidebar_opens.subscribe(session_id)

    def sidebar_available(self) -> bool:
        return self._bridge.primary_sidebar_plugin() is not None

    def resolve_sidebar_bundle(self, chunk: str) -> Path:
        return self._bridge.resolve_bundle(self._sidebar_name(None), chunk)

    def _sidebar_name(self, name: str | None) -> str:
        if name is not None:
            return name
        primary = self._bridge.primary_sidebar_plugin()
        if primary is None:
            raise LookupError("no enabled sidebar plugin")
        return primary
