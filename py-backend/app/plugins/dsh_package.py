from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class DshPackageError(ValueError):
    pass


@dataclass(frozen=True)
class DshPackageInfo:
    name: str
    version: str
    description: str
    client_entry: str
    inject: tuple[str, ...]
    platform: str
    has_bundle_patch: bool
    package_json: dict[str, Any]
    root: Path

    @property
    def client_file(self) -> Path:
        return (self.root / self.client_entry).resolve()


def read_dsh_package(root: Path) -> DshPackageInfo:
    """Recognize a DSH plugin package directory (no EAP-only manifest required)."""
    root = root.resolve()
    package_path = root / "package.json"
    if not package_path.is_file():
        raise DshPackageError("MISSING_PACKAGE_JSON")
    try:
        data = json.loads(package_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DshPackageError("INVALID_PACKAGE_JSON") from exc
    name = str(data.get("name") or "").strip()
    version = str(data.get("version") or "").strip()
    if not name or not version:
        raise DshPackageError("INVALID_PACKAGE_IDENTITY")
    dsh = data.get("dsh")
    if not isinstance(dsh, dict):
        raise DshPackageError("NOT_DSH_PACKAGE")
    client = dsh.get("client")
    if not isinstance(client, dict) or client.get("platform") != "web":
        raise DshPackageError("DSH_CLIENT_REQUIRED")
    exports = data.get("exports")
    client_export = None
    if isinstance(exports, dict):
        entry = exports.get("./client")
        if isinstance(entry, dict):
            client_export = entry.get("default") or entry.get("import")
        elif isinstance(entry, str):
            client_export = entry
    if not client_export:
        # Common layout fallback used by dsh-better-sidebar.
        candidate = root / "lib" / "client.js"
        if candidate.is_file():
            client_export = "lib/client.js"
    if not client_export:
        raise DshPackageError("MISSING_CLIENT_EXPORT")
    client_rel = str(client_export).lstrip("./").replace("\\", "/")
    client_file = (root / client_rel).resolve()
    if not str(client_file).startswith(str(root)) or not client_file.is_file():
        raise DshPackageError("CLIENT_ENTRY_NOT_FOUND")
    inject_raw = client.get("inject") if isinstance(client.get("inject"), list) else []
    inject = tuple(str(item) for item in inject_raw)
    has_patch = (root / "cordis.patch.yml").is_file() or bool(
        isinstance(dsh.get("bundle"), dict) and dsh["bundle"].get("patch")
    )
    return DshPackageInfo(
        name=name,
        version=version,
        description=str(data.get("description") or ""),
        client_entry=client_rel,
        inject=inject,
        platform="web",
        has_bundle_patch=has_patch,
        package_json=data,
        root=root,
    )


def safe_join(root: Path, relative: str) -> Path:
    rel = relative.replace("\\", "/").lstrip("/")
    if ".." in rel.split("/"):
        raise DshPackageError("PATH_ESCAPE")
    target = (root / rel).resolve()
    if not str(target).startswith(str(root.resolve())):
        raise DshPackageError("PATH_ESCAPE")
    return target
