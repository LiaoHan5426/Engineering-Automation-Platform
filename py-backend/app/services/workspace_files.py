"""Read-only workspace observations. Paths stay under the process workspace root."""

from __future__ import annotations

import hashlib
from pathlib import Path, PurePosixPath

_EXCLUDED = frozenset({".git", "node_modules", "target", "dist", ".env", ".eap"})
_SOURCE_EXTENSIONS = frozenset(
    {"vue", "ts", "tsx", "js", "jsx", "css", "html", "json", "md", "sql", "java"}
)
_LIST_LIMIT = 200
_EXCERPT_LIMIT = 4_000
_MAX_SOURCE_CHARS = 160_000


def list_directory(root: Path, requested: str | None) -> dict:
    relative = "" if requested is None else requested.replace("\\", "/")
    if not root.is_dir():
        return _listing(relative, denial="AUTHORIZED_ROOT_MISSING")
    denial = _directory_denial(relative)
    if denial:
        return _listing(relative, denial=denial)
    try:
        workspace = root.resolve()
        directory = (workspace / PurePosixPath(relative)).resolve()
        if not _within(directory, workspace):
            return _listing(relative, denial="OUTSIDE_AUTHORIZED_ROOT")
        if _symlink_segment(workspace, relative):
            return _listing(relative, denial="SYMLINK_NOT_ALLOWED")
        if not directory.is_dir():
            return _listing(relative, denial="DIRECTORY_NOT_FOUND")
        entries = []
        for child in directory.iterdir():
            name = child.name
            if name.startswith(".") or name in _EXCLUDED or child.is_symlink():
                continue
            entries.append(
                {
                    "name": name,
                    "path": child.resolve().relative_to(workspace).as_posix(),
                    "directory": child.is_dir() and not child.is_symlink(),
                }
            )
        entries.sort(key=lambda item: (not item["directory"], item["name"].lower()))
        truncated = len(entries) > _LIST_LIMIT
        return {
            "path": relative,
            "entries": entries[:_LIST_LIMIT],
            "truncated": truncated,
            "denial": "",
        }
    except OSError:
        return _listing(relative, denial="DIRECTORY_UNAVAILABLE")


def inspect_baseline(root: Path, requested: str | None) -> dict:
    path = "" if requested is None else requested
    if not root.is_dir():
        return {"path": path, "exists": False, "baseHash": "", "denial": "AUTHORIZED_ROOT_MISSING"}
    return _read_source(root, path, include_excerpt=False)


def inspect_source(root: Path, requested: str | None) -> dict:
    path = "" if requested is None else requested
    return _read_source(root, path, include_excerpt=True)


def verification_probe(root: Path) -> dict:
    if not root.is_dir():
        return {
            "requested": False,
            "denial": "AUTHORIZED_ROOT_MISSING",
            "name": "",
            "exitCode": None,
            "summary": "",
        }
    return {
        "requested": False,
        "denial": "VERIFICATION_UNAVAILABLE",
        "name": "",
        "exitCode": None,
        "summary": "",
    }


def _read_source(root: Path, path: str, *, include_excerpt: bool) -> dict:
    denial = _source_denial(path)
    if denial:
        return _source(path, denial=denial, excerpt="" if include_excerpt else None)
    try:
        workspace = root.resolve()
        file = (workspace / PurePosixPath(path)).resolve()
        if not _within(file, workspace) or _symlink_segment(workspace, path):
            return _source(path, denial="OUTSIDE_AUTHORIZED_ROOT", excerpt="" if include_excerpt else None)
        if file.is_symlink():
            return _source(path, denial="SYMLINK_NOT_ALLOWED", excerpt="" if include_excerpt else None)
        if not file.exists():
            body = _source(path, exists=False, base_hash="absent")
            if include_excerpt:
                body["excerpt"] = ""
                body["bytes"] = 0
            return body
        if not file.is_file():
            return _source(path, denial="INVALID_CODE_PATH", excerpt="" if include_excerpt else None)
        text = file.read_text(encoding="utf-8", errors="replace")
        if len(text) > _MAX_SOURCE_CHARS:
            body = _source(path, exists=True, denial="EXISTING_FILE_TOO_LARGE")
            if include_excerpt:
                body["bytes"] = len(text)
                body["excerpt"] = ""
            return body
        if _unsafe(text):
            return _source(path, exists=True, denial="SOURCE_UNAVAILABLE", excerpt="" if include_excerpt else None)
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        body = _source(path, exists=True, base_hash=digest)
        if include_excerpt:
            body["bytes"] = len(text)
            body["excerpt"] = text[:_EXCERPT_LIMIT]
        return body
    except OSError:
        code = "BASELINE_UNAVAILABLE" if not include_excerpt else "SOURCE_UNAVAILABLE"
        return _source(path, denial=code, excerpt="" if include_excerpt else None)


def _directory_denial(relative: str) -> str:
    if ":" in relative:
        return "INVALID_DIRECTORY_PATH"
    pure = PurePosixPath(relative)
    if pure.is_absolute():
        return "INVALID_DIRECTORY_PATH"
    for segment in pure.parts:
        if segment in {".."} or segment.startswith(".") or segment in _EXCLUDED:
            return "INVALID_DIRECTORY_PATH"
    return ""


def _source_denial(path: str) -> str:
    if not path or len(path) > 240 or "\\" in path or ":" in path:
        return "INVALID_CODE_PATH"
    pure = PurePosixPath(path)
    if pure.is_absolute():
        return "INVALID_CODE_PATH"
    for segment in pure.parts:
        key = segment.lower()
        if (
            not segment
            or segment.startswith(".")
            or segment.endswith(".")
            or segment.endswith(" ")
            or key in {"node_modules", "target", "dist"}
        ):
            return "INVALID_CODE_PATH"
        if any(
            token in key
            for token in (
                "credential",
                "secret",
                "password",
                "private-key",
                "private_key",
                "api-key",
                "api_key",
            )
        ):
            return "SOURCE_FILES_ONLY"
    lowered = path.lower()
    extension = lowered.rsplit(".", 1)[-1] if "." in lowered else ""
    if (
        extension not in _SOURCE_EXTENSIONS
        or lowered.endswith("package.json")
        or lowered.endswith("pom.xml")
    ):
        return "SOURCE_FILES_ONLY"
    return ""


def _symlink_segment(workspace: Path, relative: str) -> bool:
    cursor = workspace
    for segment in PurePosixPath(relative).parts:
        cursor = cursor / segment
        if cursor.is_symlink():
            return True
    return False


def _within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _unsafe(text: str) -> bool:
    lowered = text.lower()
    return "private key-----" in lowered or "begin openssh private key" in lowered


def _listing(path: str, *, denial: str) -> dict:
    return {"path": path, "entries": [], "truncated": False, "denial": denial}


def _source(
    path: str,
    *,
    exists: bool = False,
    base_hash: str = "",
    denial: str = "",
    excerpt: str | None = None,
) -> dict:
    body = {"path": path, "exists": exists, "baseHash": base_hash, "denial": denial}
    if excerpt is not None:
        body["bytes"] = 0
        body["excerpt"] = excerpt
    return body
