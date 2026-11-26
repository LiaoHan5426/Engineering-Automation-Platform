"""Fetch an install spec, then hand the package directory to the registry.

Registry names use `npm pack`. Git addresses use `git clone`. The browser does
not download the package.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from urllib.request import urlopen

from app.domain.plugin_errors import InstallFetchError

from app.infrastructure.plugins.install_spec import ParsedInstallSpec, parse_install_spec
from app.infrastructure.plugins.registry import PluginRegistry

_COMMIT = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)


def install_from_spec(registry: PluginRegistry, raw: str) -> dict:
    parsed = parse_install_spec(raw)
    recorded = raw.strip()
    if parsed.kind == "path":
        return registry.install_from_path(Path(parsed.path), spec=recorded)
    with tempfile.TemporaryDirectory(prefix="eap-plugin-") as tmp:
        root = _materialize(parsed, Path(tmp))
        return registry.install_from_path(root, spec=recorded)


def _materialize(parsed: ParsedInstallSpec, work: Path) -> Path:
    if parsed.kind == "registry":
        return _npm_pack(parsed.spec, work)
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


def _npm_pack(spec: str, work: Path) -> Path:
    npm = _tool("npm")
    _run([npm, "pack", spec, "--pack-destination", str(work)])
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
    command.extend([url, str(dest)])
    _run(command)
    if ref and _COMMIT.match(ref):
        _run([git, "-C", str(dest), "checkout", ref])
    root = dest / subpath if subpath else dest
    if not root.is_dir():
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
        tar.extractall(dest)
    package_dir = dest / "package"
    if (package_dir / "package.json").is_file():
        return package_dir
    if (dest / "package.json").is_file():
        return dest
    raise InstallFetchError("INSTALL_FETCH_FAILED", "tarball has no package.json")
