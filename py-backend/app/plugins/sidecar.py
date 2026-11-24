"""Supervised Node Host sidecar placeholder.

L2 ships an in-process Host bridge (`PluginHostBridge`) so Cordis Client islands
never execute Host/Agent logic in the browser. A future Node process can replace
the bridge body while keeping the same FastAPI gateway paths:

- `/api/plugins/host/{name}/sidebar/api/{method}`
- `/sidebar/api/{method}` (same-origin for better-sidebar fetch)

Lifecycle (start/stop/crash → UI failure) stays owned by py-backend.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SidecarSpec:
    plugin_name: str
    package_root: str
    # Pin Host half to the same version as the Client island contribution.
    version: str


class NodeHostSidecarSupervisor:
    """Reserved supervisor API — not started in the in-process L2 skeleton."""

    def __init__(self) -> None:
        self._running: dict[str, SidecarSpec] = {}

    def desired(self) -> list[SidecarSpec]:
        return list(self._running.values())

    def note_enabled(self, spec: SidecarSpec) -> None:
        self._running[spec.plugin_name] = spec

    def note_disabled(self, name: str) -> None:
        self._running.pop(name, None)
