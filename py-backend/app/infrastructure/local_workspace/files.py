"""Local filesystem capability, scoped to the configured workspace."""

import base64
import ctypes
import re
import shutil
import sys
import os
import stat
from tempfile import NamedTemporaryFile
from threading import Lock
from pathlib import Path
from typing import Any

_FILE_PREVIEW_LIMIT = 1024 * 1024
_FILE_SNIFF_LIMIT = 4096
UPLOAD_LIMIT = 16 * 1024 * 1024


class FsConflictError(ValueError):
    """The file changed after the editor loaded its draft."""


_WRITE_LOCK = Lock()


class FsDirectoryError(ValueError):
    """fs.read targeted a directory — wire code `fs-directory` for the client."""


def resolve_workspace_path(workspace: Path, raw_path: Any) -> Path:
    if raw_path is None or raw_path == "" or raw_path == ".":
        return workspace
    if not isinstance(raw_path, str):
        raise ValueError("path must be a string")
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = workspace / candidate
    try:
        resolved = candidate.resolve(strict=False)
    except OSError as exc:
        raise PermissionError("没有权限访问此路径") from exc
    root = workspace.resolve(strict=False)
    if resolved != root and root not in resolved.parents:
        raise ValueError("path escapes workspace")
    return resolved


def _check_metadata(path: Path, workspace: Path) -> None:
    if any(part.casefold() == ".git" for part in path.relative_to(workspace).parts):
        raise PermissionError("Git metadata cannot be edited through the file plugin")


def _entry_name(value: Any) -> str:
    if (
        not isinstance(value, str) or not value or value.endswith((".", " "))
        or re.search(r'[<>:"/\\|?*\x00-\x1f]', value)
        or re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]", value.split(".")[0].rstrip(), re.I)
    ):
        raise ValueError("Expected a valid file or directory name")
    return value


def _rename_without_replace(source: Path, destination: Path) -> None:
    if os.name == "nt":
        source.rename(destination)
        return
    # POSIX rename normally replaces the destination. Select an atomic no-replace mode.
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform.startswith("linux") and hasattr(libc, "renameat2"):
        at_fdcwd, rename_noreplace = -100, 1
        result = libc.renameat2(at_fdcwd, os.fsencode(source), at_fdcwd, os.fsencode(destination), rename_noreplace)
    elif sys.platform == "darwin":
        rename_excl = 4
        result = libc.renamex_np(os.fsencode(source), os.fsencode(destination), rename_excl)
    else:
        raise OSError("Non-overwriting rename is unavailable on this platform")
    if result != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), str(destination))


class WorkspaceFiles:
    def _fs_error_payload(self, path: str | Path, exc: OSError) -> dict[str, Any]:
        """Structured FS failure for tree/read — never raise raw Errno text alone."""
        winerror = getattr(exc, "winerror", None)
        denied = isinstance(exc, PermissionError) or getattr(exc, "errno", None) in {13, 5} or winerror in {
            5,
            32,
        }
        code = "PERMISSION_DENIED" if denied else "FS_ERROR"
        return {
            "path": str(path),
            "entries": [],
            "truncated": False,
            "error": self._fs_error_message(exc, denied=denied),
            "errorCode": code,
        }

    def _fs_error_message(self, exc: OSError, *, denied: bool) -> str:
        if denied:
            return "没有权限访问此路径"
        return exc.strerror or str(exc)

    def _list_dir(self, workspace: Path, raw_path: Any) -> dict[str, Any]:
        try:
            target = resolve_workspace_path(workspace, raw_path)
        except (OSError, ValueError) as exc:
            if isinstance(exc, ValueError):
                raise
            return self._fs_error_payload(raw_path if raw_path not in (None, "") else workspace, exc)

        try:
            if not target.is_dir():
                raise ValueError(f"not a directory: {target}")
            children = list(target.iterdir())
        except OSError as exc:
            return self._fs_error_payload(target, exc)

        entries: list[dict[str, Any]] = []
        for child in sorted(children, key=lambda p: (not self._is_dir_safe(p), p.name.lower()))[:500]:
            try:
                entries.append(
                    {
                        "name": child.name,
                        "path": str(child),
                        "isDir": child.is_dir(),
                        "isSymlink": child.is_symlink(),
                    }
                )
            except OSError:
                # Skip children we cannot stat (locked / junction / ACL).
                continue
        return {
            "path": str(target),
            "entries": entries,
            "truncated": len(entries) >= 500,
        }

    def _is_dir_safe(self, path: Path) -> bool:
        try:
            return path.is_dir()
        except OSError:
            return False

    def _read_file(self, workspace: Path, raw_path: Any) -> dict[str, Any]:
        target = resolve_workspace_path(workspace, raw_path)
        try:
            if target.is_dir():
                # Match DSH Host readText: dedicated code, not a generic bad-request.
                raise FsDirectoryError(f'"{target}" is a directory')
            with target.open("rb") as handle:
                stat = os.fstat(handle.fileno())
                data = handle.read(
                    _FILE_SNIFF_LIMIT if stat.st_size > _FILE_PREVIEW_LIMIT else _FILE_PREVIEW_LIMIT + 1
                )
            result = {
                "path": str(target),
                "size": max(stat.st_size, len(data)),
                "mtimeMs": stat.st_mtime_ns // 1_000_000,
            }
            if result["size"] > _FILE_PREVIEW_LIMIT:
                kind = "too-large"
            else:
                try:
                    if b"\0" not in data:
                        return {**result, "kind": "text", "content": data.decode("utf-8")}
                except UnicodeDecodeError:
                    pass
                kind = "binary"
            head = base64.b64encode(data[:_FILE_SNIFF_LIMIT]).decode("ascii")
            return {**result, "kind": kind, "head": head}
        except FsDirectoryError:
            raise
        except PermissionError as exc:
            raise PermissionError(self._fs_error_message(exc, denied=True)) from None
        except OSError as exc:
            denied = getattr(exc, "errno", None) in {13, 5} or getattr(exc, "winerror", None) in {
                5,
                32,
            }
            if denied:
                raise PermissionError(self._fs_error_message(exc, denied=True)) from None
            raise OSError(self._fs_error_message(exc, denied=False)) from None

    def _write_file(self, workspace: Path, body: dict[str, Any]) -> dict[str, Any]:
        baseline = body.get("expectedMtimeMs")
        content = body.get("content")
        if type(baseline) is not int or not isinstance(content, str):
            raise ValueError("Saving requires text content and an integer expectedMtimeMs")
        data = content.encode("utf-8")
        if b"\0" in data or len(data) > _FILE_PREVIEW_LIMIT:
            raise ValueError("Only UTF-8 text up to 1 MiB can be saved")
        with _WRITE_LOCK:
            target = resolve_workspace_path(workspace, body.get("path"))
            _check_metadata(target, workspace)
            try:
                current_stat = target.stat()
            except FileNotFoundError as exc:
                raise FsConflictError("File no longer exists") from exc
            if not stat.S_ISREG(current_stat.st_mode):
                raise ValueError("Only regular files can be saved")
            current = self._read_file(workspace, str(target))
            if current["mtimeMs"] != baseline:
                raise FsConflictError("File changed on disk")
            if current["kind"] != "text":
                raise ValueError("Only existing UTF-8 text files can be saved")
            if content == current["content"]:
                return {"mtimeMs": baseline}
            temporary = None
            try:
                with NamedTemporaryFile(dir=target.parent, delete=False) as handle:
                    temporary = Path(handle.name)
                    handle.write(data)
                temporary.chmod(stat.S_IMODE(current_stat.st_mode))
                if temporary.stat().st_mtime_ns // 1_000_000 <= baseline:
                    next_mtime = (baseline + 1) * 1_000_000
                    os.utime(temporary, ns=(next_mtime, next_mtime))
                latest = target.stat()
                if (latest.st_ino, latest.st_mtime_ns, latest.st_size) != (
                    current_stat.st_ino, current_stat.st_mtime_ns, current_stat.st_size
                ):
                    raise FsConflictError("File changed on disk")
                temporary.replace(target)
            except FileNotFoundError as exc:
                raise FsConflictError("File no longer exists") from exc
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
            return {"mtimeMs": target.stat().st_mtime_ns // 1_000_000}

    def _tree_entry(self, workspace: Path, cwd: Path, path: Path) -> Path:
        if path == cwd or path.name in {"", ".", ".."}:
            raise ValueError("Cannot modify the workspace root")
        parent = resolve_workspace_path(cwd, str(path.parent))
        entry = parent / _entry_name(path.name)
        _check_metadata(entry, workspace)
        return entry

    def _edit_tree(self, workspace: Path, method: str, body: dict[str, Any]) -> dict[str, str]:
        cwd = resolve_workspace_path(workspace, body.get("cwd"))
        raw_path = body.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            raise ValueError("path must be a non-empty string")
        path = cwd / raw_path
        with _WRITE_LOCK:
            if method == "fs.remove":
                entry = self._tree_entry(workspace, cwd, path)
                mode = entry.lstat().st_mode
                if stat.S_ISDIR(mode):
                    shutil.rmtree(entry)
                else:
                    entry.unlink()
                return {"path": str(entry)}

            name = _entry_name(body.get("name"))
            if method == "fs.rename":
                source = self._tree_entry(workspace, cwd, path)
                parent = source.parent
            else:
                parent = resolve_workspace_path(cwd, str(path))

            destination = parent / name
            _check_metadata(destination, workspace)
            if method == "fs.rename":
                if source.name != name:
                    _rename_without_replace(source, destination)
                else:
                    source.lstat()
            elif method == "fs.mkdir":
                destination.mkdir()
            else:
                with destination.open("xb"):
                    pass
            return {"path": str(destination)}

    def _upload(self, workspace: Path, body: dict[str, Any]) -> dict[str, Any]:
        cwd = resolve_workspace_path(workspace, body.get("cwd"))
        directory, relative_path, data = body.get("dir"), body.get("relativePath"), body.get("data")
        if not isinstance(directory, str) or not directory or not isinstance(relative_path, str):
            raise ValueError("Upload requires dir and relativePath")
        if not isinstance(data, (bytes, bytearray)) or len(data) > UPLOAD_LIMIT:
            raise ValueError("Upload requires a binary body up to 16 MiB")
        segments = [_entry_name(segment) for segment in re.split(r"[/\\]", relative_path)]
        with _WRITE_LOCK:
            base = resolve_workspace_path(cwd, directory)
            if not base.is_dir():
                raise ValueError("Upload directory must exist")
            destination = base.joinpath(*segments)
            _check_metadata(destination, workspace)
            parent = resolve_workspace_path(base, str(destination.parent))
            _check_metadata(parent, workspace)
            parent.mkdir(parents=True, exist_ok=True)
            target = parent / segments[-1]
            temporary = None
            try:
                with NamedTemporaryFile(dir=parent, delete=False) as handle:
                    temporary = Path(handle.name)
                    handle.write(data)
                _rename_without_replace(temporary, target)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
        return {"path": str(target), "size": len(data)}

    def call(self, workspace: Path, method: str, body: dict[str, Any]) -> Any:
        if method == "fs.upload":
            return self._upload(workspace, body)
        if method in {"fs.mkdir", "fs.createFile", "fs.rename", "fs.remove"}:
            return self._edit_tree(workspace, method, body)
        if method == "fs.write":
            return self._write_file(workspace, body)
        if method == "fs.read":
            return self._read_file(workspace, body.get("path"))
        if method == "fs.tree":
            return self._list_dir(workspace, body.get("path"))
        paths = body.get("paths")
        if not isinstance(paths, list) or not paths:
            raise ValueError("paths must be a non-empty array")
        return {"levels": [self._list_dir(workspace, path) for path in paths[:64]
                           if isinstance(path, str) and path]}
