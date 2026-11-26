"""Plugin lifecycle and Host operations exposed to transport adapters."""

from collections.abc import Callable
from pathlib import Path
from typing import Any, TYPE_CHECKING

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

    def update(self, name: str) -> dict[str, Any]:
        spec = self._registry.install_spec_of(name)
        if not spec.strip():
            raise InstallSpecMissingError("plugin has no recorded install spec")
        item = self._install(spec)
        self._bridge.sync_enabled()
        return item

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

    def resolve_sidebar_bundle(self, chunk: str) -> Path:
        return self._bridge.resolve_bundle(self._sidebar_name(None), chunk)

    def _sidebar_name(self, name: str | None) -> str:
        if name is not None:
            return name
        primary = self._bridge.primary_sidebar_plugin()
        if primary is None:
            raise LookupError("no enabled sidebar plugin")
        return primary
