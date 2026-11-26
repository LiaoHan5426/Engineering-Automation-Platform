from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from app.config import Settings
from app.persistence.models import PluginInstallRow
from app.infrastructure.plugins.dsh_package import DshPackageError, DshPackageInfo, read_dsh_package, safe_join


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PluginRegistry:
    """Server-authoritative DSH plugin install/enable store."""

    def __init__(self, settings: Settings, engine) -> None:
        self._settings = settings
        self._engine = engine
        self._settings.ensure_layout()

    def install_from_path(self, source: Path, *, spec: str) -> dict[str, Any]:
        info = read_dsh_package(source)
        dest = self._settings.plugins_root / info.name / info.version
        if dest.exists():
            shutil.rmtree(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, dest)
        installed = read_dsh_package(dest)
        enabled = False
        with Session(self._engine) as session:
            row = session.get(PluginInstallRow, installed.name)
            if row is None:
                row = PluginInstallRow(
                    name=installed.name,
                    version=installed.version,
                    enabled=False,
                    install_path=str(dest),
                    client_entry=installed.client_entry,
                    package_json=json.dumps(installed.package_json, ensure_ascii=False),
                    install_spec=spec,
                )
                session.add(row)
            else:
                enabled = row.enabled
                row.version = installed.version
                row.install_path = str(dest)
                row.client_entry = installed.client_entry
                row.package_json = json.dumps(installed.package_json, ensure_ascii=False)
                row.install_spec = spec
                row.updated_at = _now()
            session.commit()
        return self._public(installed, enabled=enabled, spec=spec)

    def list_plugins(self) -> dict[str, Any]:
        with Session(self._engine) as session:
            rows = list(session.exec(select(PluginInstallRow)).all())
        items = []
        for row in rows:
            try:
                info = read_dsh_package(Path(row.install_path))
            except DshPackageError:
                items.append(
                    {
                        "name": row.name,
                        "version": row.version,
                        "enabled": row.enabled,
                        "broken": True,
                        "description": "",
                        "clientEntry": row.client_entry,
                        "installSpec": row.install_spec,
                        "controlPlane": "py-backend",
                    }
                )
                continue
            items.append(self._public(info, enabled=row.enabled, spec=row.install_spec))
        return {"items": items}

    def get(self, name: str) -> PluginInstallRow | None:
        with Session(self._engine) as session:
            return session.get(PluginInstallRow, name)

    def enable(self, name: str) -> dict[str, Any]:
        return self._set_enabled(name, True)

    def disable(self, name: str) -> dict[str, Any]:
        return self._set_enabled(name, False)

    def _set_enabled(self, name: str, enabled: bool) -> dict[str, Any]:
        with Session(self._engine) as session:
            row = session.get(PluginInstallRow, name)
            if row is None:
                raise LookupError("UNKNOWN_PLUGIN")
            info = read_dsh_package(Path(row.install_path))
            row.enabled = enabled
            row.updated_at = _now()
            spec = row.install_spec
            session.add(row)
            session.commit()
            return self._public(info, enabled=enabled, spec=spec)

    def uninstall(self, name: str) -> None:
        with Session(self._engine) as session:
            row = session.get(PluginInstallRow, name)
            if row is None:
                raise LookupError("UNKNOWN_PLUGIN")
            install_path = row.install_path
            session.delete(row)
            session.commit()
        self._remove_install_tree(install_path, name)

    def install_spec_of(self, name: str) -> str:
        with Session(self._engine) as session:
            row = session.get(PluginInstallRow, name)
            if row is None:
                raise LookupError("UNKNOWN_PLUGIN")
            return row.install_spec

    def _remove_install_tree(self, install_path: str, name: str) -> None:
        root = self._settings.plugins_root.resolve()
        target = Path(install_path).resolve()
        if root not in target.parents:
            return
        name_dir = (root / name).resolve()
        if name_dir != root and root in name_dir.parents and (name_dir == target or name_dir in target.parents):
            if name_dir.is_dir():
                shutil.rmtree(name_dir)
                return
        if target.is_dir():
            shutil.rmtree(target)

    def contributions(self) -> dict[str, Any]:
        with Session(self._engine) as session:
            rows = [
                row
                for row in session.exec(select(PluginInstallRow)).all()
                if row.enabled
            ]
        ui_clients = []
        for row in rows:
            info = read_dsh_package(Path(row.install_path))
            artifact_revision = row.updated_at.strftime("%Y%m%d%H%M%S%f")
            ui_clients.append(
                {
                    "name": info.name,
                    "version": info.version,
                    "description": info.description,
                    "enabled": True,
                    "clientEntry": info.client_entry,
                    "clientUrl": f"/api/plugins/{info.name}/files/{info.client_entry}?rev={artifact_revision}",
                    "filesBaseUrl": f"/api/plugins/{info.name}/files",
                    "inject": list(info.inject),
                    "hostApiBase": f"/api/plugins/host/{info.name}",
                    # Control plane stays on server — island must call hostApiBase, never local Host.
                    "controlPlane": "py-backend",
                }
            )
        return {"uiClients": ui_clients}

    def resolve_file(self, name: str, relative: str) -> Path:
        with Session(self._engine) as session:
            row = session.get(PluginInstallRow, name)
            if row is None:
                raise LookupError("UNKNOWN_PLUGIN")
            root = Path(row.install_path)
            _ = row.name  # materialize before session close
        return safe_join(root, relative)

    def package_info(self, name: str) -> DshPackageInfo:
        with Session(self._engine) as session:
            row = session.get(PluginInstallRow, name)
            if row is None:
                raise LookupError("UNKNOWN_PLUGIN")
            install_path = Path(row.install_path)
        return read_dsh_package(install_path)

    @staticmethod
    def _public(info: DshPackageInfo, *, enabled: bool, spec: str) -> dict[str, Any]:
        return {
            "name": info.name,
            "version": info.version,
            "description": info.description,
            "enabled": enabled,
            "broken": False,
            "installSpec": spec,
            "clientEntry": info.client_entry,
            "inject": list(info.inject),
            "hasBundlePatch": info.has_bundle_patch,
            "clientUrl": f"/api/plugins/{info.name}/files/{info.client_entry}",
            "filesBaseUrl": f"/api/plugins/{info.name}/files",
            "hostApiBase": f"/api/plugins/host/{info.name}",
            "controlPlane": "py-backend",
        }
