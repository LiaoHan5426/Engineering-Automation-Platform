"""Install spec reader aligned with DSH plugin-manager parseInstallSpec.

A browser field accepts an npm package name, a git address, a tarball, or an
absolute local directory. Relative paths are refused.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from app.domain.plugin_errors import InvalidInstallSpecError

PACKAGE_NAME_PATTERN = r"(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*"
PACKAGE_NAME = re.compile(PACKAGE_NAME_PATTERN)
PACKAGE_NAME_MAX_LENGTH = 214
GIT_SHORTHAND = re.compile(r"^(?:github|gitlab|bitbucket|gist):", re.IGNORECASE)
GIT_URL = re.compile(r"^git(?:\+[a-z]+)?:\/\/|^git@[^:]+:", re.IGNORECASE)
HOSTED_REPOSITORY_URL = re.compile(
    r"^https?:\/\/[^/]+\/[^/]+\/[^/#]+(?:\.git)?(?:#.*)?$",
    re.IGNORECASE,
)
TARBALL_SPEC = re.compile(r"\.(?:tgz|tar\.gz)(?:#.*)?$", re.IGNORECASE)
GIT_SHORTHAND_HOSTS = {
    "github": "github.com",
    "gitlab": "gitlab.com",
    "bitbucket": "bitbucket.org",
    "gist": "gist.github.com",
}


@dataclass(frozen=True)
class ParsedInstallSpec:
    kind: str
    spec: str
    name: str = ""
    range: str | None = None
    path: str = ""
    host: str = ""


def _git_host(spec: str) -> str:
    shorthand = re.match(r"^([a-z]+):", spec, re.IGNORECASE)
    if shorthand and shorthand.group(1).lower() in GIT_SHORTHAND_HOSTS:
        return GIT_SHORTHAND_HOSTS[shorthand.group(1).lower()]
    scp = re.match(r"^git@([^:]+):", spec, re.IGNORECASE)
    if scp:
        return scp.group(1).lower()
    parsed = urlparse(re.sub(r"^git\+", "", spec, flags=re.IGNORECASE))
    return (parsed.netloc or "").lower()


def parse_install_spec(raw: str) -> ParsedInstallSpec:
    spec = raw.strip()
    if spec == "":
        raise InvalidInstallSpecError(spec, "the package spec must not be empty")
    stripped = re.sub(r"^(?:file|link):", "", spec)
    looks_local = stripped != spec or Path(stripped).is_absolute()
    if looks_local:
        if not Path(stripped).is_absolute():
            raise InvalidInstallSpecError(spec, "a local path must be absolute")
        if TARBALL_SPEC.search(stripped):
            return ParsedInstallSpec(kind="tarball", spec=spec, path=stripped)
        return ParsedInstallSpec(kind="path", spec=spec, path=stripped)
    if re.match(r"^\.{1,2}(?:[\\/]|$)", spec):
        raise InvalidInstallSpecError(spec, "a local path must be absolute")
    git = bool(GIT_SHORTHAND.match(spec) or GIT_URL.match(spec) or HOSTED_REPOSITORY_URL.match(spec))
    if git and not TARBALL_SPEC.search(spec):
        return ParsedInstallSpec(kind="git", spec=spec, host=_git_host(spec))
    if re.match(r"^https?:\/\/", spec, re.IGNORECASE):
        if TARBALL_SPEC.search(spec):
            return ParsedInstallSpec(kind="tarball", spec=spec, host=(urlparse(spec).hostname or "").lower())
        raise InvalidInstallSpecError(spec, "a URL must point at a git repository or a tarball")
    at = spec.find("@", 1)
    name = spec if at == -1 else spec[:at]
    version = None if at == -1 else spec[at + 1 :]
    if len(name) > PACKAGE_NAME_MAX_LENGTH or not PACKAGE_NAME.fullmatch(name):
        raise InvalidInstallSpecError(spec, "not a package name the registry accepts")
    if version is not None and (len(version) > 120 or not re.fullmatch(r"[0-9A-Za-z.*+~^<>= |_-]+", version)):
        raise InvalidInstallSpecError(spec, "Expected an npm version, range, or dist-tag after @.")
    return ParsedInstallSpec(kind="registry", spec=spec, name=name, range=version)
