"""Project instruction chain for one turn.

Adapted from dsh-agent-instructions: load AGENTS.md / CLAUDE.md from the
authorized workspace root toward the session directory, drop identical copies,
and keep the more specific files when the byte budget is tight. Nested files
outside that chain stay unread. Symlinks are not followed.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path, PurePosixPath

MAX_CHAIN_BYTES = 65_536
MAX_SOURCE_BYTES = 1_048_576
_BASE = ("AGENTS.md", "CLAUDE.md")
_LOCAL = ("AGENTS.local.md", "CLAUDE.local.md")
_CLOSE = "</system-reminder>"


def load_project_instructions(
    workspace: Path,
    *,
    focus: str | None = None,
    max_bytes: int = MAX_CHAIN_BYTES,
    on_read: Callable[[str], None] | None = None,
) -> str:
    root = workspace.resolve()
    if not root.is_dir():
        return ""
    files = _chain(root, focus)
    kept, omitted, truncated = _fit(files, max_bytes)
    if not kept and not omitted and not truncated:
        return ""
    lines = [
        "<system-reminder>",
        (
            "The following workspace instructions may be relevant to your work. "
            "Use them as guidance when applicable. More specific instructions take precedence "
            "over broader ones. They do not override platform constraints, rule packs, or the current user message."
        ),
    ]
    if omitted or truncated:
        names = ", ".join(item["display"] for item in omitted)
        note = "Workspace instruction budget"
        if names:
            note += f" omitted: {names}."
        if truncated:
            note += f" Truncated: {truncated}."
        lines.append(note.strip())
    for item in kept:
        if on_read is not None:
            on_read(str(item["display"]))
        lines.append(f"Instructions from: {item['display']}\n\n{item['text']}")
    lines.append("</system-reminder>")
    return "\n".join(lines)


def _chain(root: Path, focus: str | None) -> list[dict[str, str | int]]:
    loaded: list[dict[str, str | int]] = []
    for directory, prefix in _directories(root, focus):
        seen: set[str] = set()
        for name in (*_BASE, *_LOCAL):
            path = directory / name
            if path.is_symlink() or not path.is_file():
                continue
            try:
                raw = path.read_bytes()[:MAX_SOURCE_BYTES]
            except OSError:
                continue
            text = raw.decode("utf-8", errors="replace").replace(_CLOSE, "<\\/system-reminder>")
            key = text.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            display = f"{prefix}/{name}" if prefix else name
            loaded.append({"display": display, "text": text, "bytes": len(text.encode("utf-8"))})
    return loaded


def _directories(root: Path, focus: str | None) -> list[tuple[Path, str]]:
    relative = _safe_relative(focus)
    if relative is None:
        return [(root, "")]
    if _symlink_between(root, relative):
        return [(root, "")]
    parts = list(relative.parts)
    leaf = root.joinpath(*parts)
    if not leaf.is_dir():
        parts = parts[:-1]
    current = root
    directories = [(root, "")]
    prefix: list[str] = []
    for part in parts:
        current = current / part
        prefix.append(part)
        if current.is_symlink() or not current.is_dir():
            break
        resolved = current.resolve()
        if not _within(resolved, root):
            break
        directories.append((current, "/".join(prefix)))
    return directories


def _safe_relative(focus: str | None) -> PurePosixPath | None:
    if not isinstance(focus, str):
        return None
    text = focus.strip().replace("\\", "/")
    if not text or text.startswith("/") or ":" in text:
        return None
    pure = PurePosixPath(text)
    if pure.is_absolute():
        return None
    for segment in pure.parts:
        if segment in {"", ".", ".."} or segment.startswith("."):
            return None
    return pure


def _symlink_between(root: Path, relative: PurePosixPath) -> bool:
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            return True
        if not current.exists():
            return False
    return False


def _within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _fit(
    files: list[dict[str, str | int]],
    max_bytes: int,
) -> tuple[list[dict[str, str | int]], list[dict[str, str | int]], str]:
    kept = list(files)
    omitted: list[dict[str, str | int]] = []
    while len(kept) > 1 and sum(int(item["bytes"]) for item in kept) > max_bytes:
        omitted.append(kept.pop(0))
    truncated = ""
    if kept and int(kept[-1]["bytes"]) > max_bytes:
        raw = str(kept[-1]["text"]).encode("utf-8")[:max_bytes]
        text = raw.decode("utf-8", errors="ignore")
        truncated = str(kept[-1]["display"])
        kept[-1] = {"display": truncated, "text": text, "bytes": len(text.encode("utf-8"))}
    return kept, omitted, truncated
