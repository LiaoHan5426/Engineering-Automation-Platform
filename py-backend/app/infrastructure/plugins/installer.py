"""Fetch an install spec, then hand the package directory to the registry.

Registry names use `npm pack`. Git addresses use `git clone`. The browser does
not download the package.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from urllib.request import urlopen

from app.domain.plugin_errors import InstallFetchError

from app.infrastructure.plugins.dsh_package import read_dsh_package
from app.infrastructure.plugins.install_spec import ParsedInstallSpec, parse_install_spec
from app.infrastructure.plugins.versions import REGISTRY_URL
from app.infrastructure.plugins.registry import PluginRegistry

_COMMIT = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)


def install_from_spec(
    registry: PluginRegistry, raw: str, *, enabled: bool | None = None,
    require_bundle: bool = False, expected: dict | None = None,
) -> dict:
    parsed = parse_install_spec(raw)

    def register(root: Path) -> dict:
        if require_bundle:
            info = read_dsh_package(root)
            if not info.has_bundle_patch:
                raise InstallFetchError("NOT_DSH_BUNDLE", "The package does not declare a DSH bundle.")
            if expected is not None and (info.name != expected["name"] or info.version != expected["version"]):
                raise InstallFetchError("UNEXPECTED_PACKAGE", "The downloaded bundle does not match the selected package.")
        return registry.install_from_path(root, spec=parsed.spec, enabled=enabled, replace=not require_bundle)

    if parsed.kind == "path":
        return register(Path(parsed.path))
    with tempfile.TemporaryDirectory(prefix=".stage-", dir=registry.staging_root) as tmp:
        root = _materialize(parsed, Path(tmp), registry_url=REGISTRY_URL)
        return register(root)


def registry_manifest(parsed: ParsedInstallSpec, staging_root: Path) -> dict:
    """Resolve an npm spec without executing package scripts or installing it."""
    command = [_tool("npm"), "view", parsed.spec, "name", "version", "description", "dsh",
               "--json", "--registry", REGISTRY_URL, "--fetch-retries", "0", "--fetch-timeout", "10000"]
    try:
        with tempfile.TemporaryDirectory(prefix=".inspect-", dir=staging_root) as cache:
            result = subprocess.run([*command, "--cache", cache], capture_output=True,
                                    encoding="utf-8", errors="replace", timeout=15)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise InstallFetchError("INSPECT_NETWORK", "Could not reach the npm registry.") from exc
    try:
        metadata = json.loads(result.stdout)
    except ValueError:
        metadata = None
    if result.returncode != 0:
        error = metadata.get("error") if isinstance(metadata, dict) else None
        if isinstance(error, dict) and error.get("code") in ("E404", "ETARGET"):
            raise InstallFetchError("INSPECT_NOT_FOUND", "No npm package version matches this spec.")
        raise InstallFetchError("INSPECT_NETWORK", "Could not read package metadata from the npm registry.")
    if isinstance(metadata, list):
        metadata = metadata[-1] if metadata else None
    if not isinstance(metadata, dict) or metadata.get("name") != parsed.name or not isinstance(metadata.get("version"), str):
        raise InstallFetchError("INSPECT_NOT_FOUND", "No npm package version matches this spec.")
    return metadata


def install_registry_version(registry: PluginRegistry, name: str, version: str, source: str) -> dict:
    with tempfile.TemporaryDirectory(prefix=".stage-", dir=registry.staging_root) as tmp:
        root = _npm_pack(f"{name}@{version}", Path(tmp), registry_url=source)
        info = read_dsh_package(root)
        if info.name != name or info.version != version or not info.has_bundle_patch:
            raise InstallFetchError("INVALID_PLUGIN_UPDATE", "The downloaded bundle did not match the selected version.")
        return registry.install_from_path(root, spec=f"{name}@{version}")


def _materialize(parsed: ParsedInstallSpec, work: Path, *, registry_url: str) -> Path:
    if parsed.kind == "registry":
        return _npm_pack(parsed.spec, work, registry_url=registry_url)
    if parsed.kind == "git":
        return _git_clone(parsed.spec, work)
    if parsed.kind == "tarball":
        archive = Path(parsed.path) if parsed.path else _download(parsed.spec, work)
        return _extract_tarball(archive, work)
    raise InstallFetchError("INVALID_INSTALL_SPEC", f"unsupported spec kind {parsed.kind}")


def _tool(name: str) -> str:
    found = shutil.which(name)
    if not found:
        raise InstallFetchError(f"{name.upper()}_NOT_AVAILABLE", f"{name} is not available")
    return found


def _run(command: list[str]) -> None:
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired as exc:
        raise InstallFetchError("INSTALL_TIMEOUT", f"{command[0]} timed out") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        raise InstallFetchError("INSTALL_FETCH_FAILED", detail or f"{command[0]} failed")


def _npm_pack(spec: str, work: Path, *, registry_url: str | None = None) -> Path:
    npm = _tool("npm")
    command = [npm, "pack", spec, "--pack-destination", str(work), "--cache", str(work / ".npm-cache")]
    if registry_url is not None:
        command.extend(["--registry", registry_url, "--ignore-scripts"])
    _run(command)
    archives = list(work.glob("*.tgz"))
    if not archives:
        raise InstallFetchError("INSTALL_FETCH_FAILED", "npm pack produced no tarball")
    return _extract_tarball(archives[0], work / "unpacked")


def _git_target(spec: str) -> tuple[str, str | None, str]:
    hash_at = spec.find("#")
    location = spec if hash_at < 0 else spec[:hash_at]
    fragment = "" if hash_at < 0 else spec[hash_at + 1 :]
    parts = fragment.split("&") if fragment else []
    paths = [part[5:].strip("/") for part in parts if part.startswith("path:")]
    refs = [part for part in parts if not part.startswith("path:")]
    ref = refs[0] if refs else None
    shorthand = re.match(r"^(github|gitlab|bitbucket|gist):(.+)$", location, re.IGNORECASE)
    if shorthand:
        host = {
            "github": "github.com",
            "gitlab": "gitlab.com",
            "bitbucket": "bitbucket.org",
            "gist": "gist.github.com",
        }[shorthand.group(1).lower()]
        repo = shorthand.group(2).strip("/")
        if repo.endswith(".git"):
            repo = repo[: -4]
        url = f"https://{host}/{repo}.git"
    elif location.lower().startswith("git+"):
        url = location[4:]
    else:
        url = location
    return url, ref, paths[-1] if paths else ""


def _git_clone(spec: str, work: Path) -> Path:
    git = _tool("git")
    url, ref, subpath = _git_target(spec)
    dest = work / "repo"
    command = [git, "clone"]
    if ref and not _COMMIT.match(ref):
        command.extend(["--depth", "1", "--branch", ref])
    command.extend(["--", url, str(dest)])
    _run(command)
    if ref and _COMMIT.match(ref):
        _run([git, "-C", str(dest), "checkout", ref])
    root = (dest / subpath).resolve() if subpath else dest.resolve()
    if not root.is_relative_to(dest.resolve()) or not root.is_dir():
        raise InstallFetchError("INSTALL_FETCH_FAILED", f"git path not found: {subpath}")
    return root


def _download(url: str, work: Path) -> Path:
    target = work / "package.tgz"
    try:
        with urlopen(url, timeout=60) as response, target.open("wb") as handle:  # noqa: S310
            shutil.copyfileobj(response, handle)
    except OSError as exc:
        raise InstallFetchError("INSTALL_FETCH_FAILED", str(exc)) from exc
    return target


def _extract_tarball(archive: Path, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar.getmembers():
            name = member.name.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/"):
                raise InstallFetchError("INSTALL_FETCH_FAILED", "tarball path escapes the package")
        try:
            tar.extractall(dest, filter="data")
        except tarfile.TarError as exc:
            raise InstallFetchError("INSTALL_FETCH_FAILED", "Unsafe package archive.") from exc
    package_dir = dest / "package"
    if (package_dir / "package.json").is_file():
        return package_dir
    if (dest / "package.json").is_file():
        return dest
    raise InstallFetchError("INSTALL_FETCH_FAILED", "tarball has no package.json")
