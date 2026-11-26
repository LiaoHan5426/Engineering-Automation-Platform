"""Read the public npm registry's version metadata without installing packages."""

from __future__ import annotations

import json
import re
from urllib.parse import quote

import httpx

from app.domain.plugin_errors import InvalidInstallSpecError
from app.infrastructure.plugins.install_spec import parse_install_spec

REGISTRY_URL = "https://registry.npmjs.org"
_VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?")
_VERSION_LIMIT = 20


def semver_key(value: str) -> tuple | None:
    match = _VERSION.fullmatch(value)
    if match is None:
        return None
    suffix = match[4]
    prerelease = tuple((0, int(part)) if part.isascii() and part.isdigit() else (1, part)
                       for part in suffix.split(".")) if suffix else ()
    return int(match[1]), int(match[2]), int(match[3]), suffix is None, prerelease


def registry_managed(item: dict) -> bool:
    spec = item.get("installSpec")
    if item.get("broken") or not isinstance(spec, str) or not spec:
        return False
    try:
        parsed = parse_install_spec(spec)
    except InvalidInstallSpecError:
        return False
    return parsed.kind == "registry" and parsed.name == item["name"]


def refused(problem: str, reason: str, *, attempted: bool = False) -> dict:
    attempts = [{"registry": REGISTRY_URL, "problem": problem, "reason": reason}] if attempted else []
    return {"status": "refused", "problem": problem, "reason": reason, "attempts": attempts}


def versions_from_metadata(installed: str, metadata: dict) -> dict:
    current = semver_key(installed)
    versions = metadata.get("versions")
    if current is None or not isinstance(versions, dict):
        return refused("unknown", "The registry did not return valid version metadata.", attempted=True)
    tags = metadata.get("dist-tags") or {}
    times = metadata.get("time") or {}
    if not isinstance(tags, dict) or not isinstance(times, dict):
        return refused("unknown", "The registry did not return valid version metadata.", attempted=True)
    newer = []
    for version, manifest in versions.items():
        key = semver_key(version)
        if key is not None and key > current and isinstance(manifest, dict):
            newer.append((key, version, manifest))
    newer.sort(reverse=True, key=lambda row: row[0])
    rows = []
    for key, version, manifest in newer[:_VERSION_LIMIT]:
        dsh = manifest.get("dsh")
        bundle = dsh.get("bundle") if isinstance(dsh, dict) else None
        client = dsh.get("client") if isinstance(dsh, dict) else None
        rows.append({
            "version": version,
            "tags": [tag for tag, target in tags.items() if target == version],
            "prerelease": not key[3],
            "bundle": isinstance(bundle, dict) and bool(bundle.get("patch"))
                      and isinstance(client, dict) and client.get("platform") == "web",
            **({"publishedAt": times[version]} if isinstance(times.get(version), str) else {}),
            **({"deprecated": manifest["deprecated"]} if isinstance(manifest.get("deprecated"), str) else {}),
        })
    return {"status": "listed", "installed": installed, "registry": REGISTRY_URL,
            "attempts": [{"registry": REGISTRY_URL}], "versions": rows, "omitted": max(0, len(newer) - _VERSION_LIMIT)}


async def list_registry_versions(item: dict) -> dict:
    if not registry_managed(item):
        return refused("not-updatable", "This plugin has no recorded npm registry source.")
    url = f"{REGISTRY_URL}/{quote(item['name'], safe='')}"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            async with client.stream("GET", url) as response:
                if response.status_code == 404:
                    return refused("not-found", "The npm registry did not find this package.", attempted=True)
                response.raise_for_status()
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > 16 * 1024 * 1024:
                        return refused("unknown", "The npm metadata exceeds the size limit.", attempted=True)
        metadata = json.loads(data)
    except httpx.HTTPError:
        return refused("network", "The npm registry could not be reached.", attempted=True)
    except (ValueError, UnicodeError):
        return refused("unknown", "The npm registry returned invalid metadata.", attempted=True)
    if not isinstance(metadata, dict):
        return refused("unknown", "The npm registry returned invalid metadata.", attempted=True)
    return versions_from_metadata(item["version"], metadata)
