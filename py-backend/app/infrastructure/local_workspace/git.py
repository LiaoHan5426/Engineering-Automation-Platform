"""Git operations for the DSH workspace sidebar."""

import os
import re
import subprocess
from pathlib import Path
from typing import Any


def _run(cwd: Path, *args: str) -> subprocess.CompletedProcess[bytes]:
    try:
        env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        env.update(GIT_OPTIONAL_LOCKS="0", GIT_LITERAL_PATHSPECS="1")
        return subprocess.run(
            ["git", "-c", "core.fsmonitor=false", *args],
            cwd=cwd, env=env, capture_output=True, timeout=10, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise OSError("Git command timed out") from exc


def _read(cwd: Path, *args: str) -> str:
    result = _run(cwd, *args)
    if result.returncode:
        raise OSError(result.stderr.decode("utf-8", errors="replace").strip() or "Git command failed")
    return result.stdout.decode("utf-8", errors="replace")


def _status(root: Path) -> dict[str, Any]:
    records = iter(_read(root, "status", "--porcelain=v1", "-z", "--branch").split("\0"))
    header = next(records).removeprefix("## ")
    branch = header.partition("...")[0].removeprefix("No commits yet on ").removeprefix("Initial commit on ")
    detached = header.startswith("HEAD (")
    entries = []
    for record in records:
        if not record:
            continue
        xy = record[:2]
        entry = {"xy": xy, "path": record[3:]}
        if "R" in xy or "C" in xy:
            entry["oldPath"] = next(records, "")
        entries.append(entry)
        if len(entries) >= 500:
            break
    return {"isRepo": True, "root": str(root), "branch": "" if detached else branch,
            "detached": detached, "entries": entries}


def call_workspace_git(workspace: Path, cwd: Path, method: str, body: dict[str, Any]) -> Any:
    found = _run(cwd, "rev-parse", "--show-toplevel")
    if found.returncode:
        if method in {"git.stage", "git.unstage"}:
            raise ValueError("No Git repository in the selected workspace")
        if method == "git.show":
            return {"content": None}
        if method == "git.worktrees":
            return []
        if method in {"git.graph", "git.history"}:
            return {"isRepo": False, "entries": [], "branches": [], "hasMore": False}
        if method in {"git.diff", "git.commit-diff"}:
            return {"diff": ""}
        return {"isRepo": False, "entries": []}

    root = Path(found.stdout.decode("utf-8").strip()).resolve()
    if not root.is_relative_to(workspace.resolve()):
        raise PermissionError("Git root is outside the workspace")
    worktree = body.get("worktree")
    if worktree and (not isinstance(worktree, str) or Path(worktree).resolve() != root):
        raise PermissionError("Git worktree is outside the selected repository")
    if method in {"git.stage", "git.unstage"}:
        path = body.get("path")
        if not isinstance(path, str) or not path or Path(path).anchor or ":" in path:
            raise ValueError("A repository-relative path is required")
        if ".." in Path(path).parts or not (root / path).resolve().is_relative_to(root):
            raise PermissionError("Git path is outside the repository")
        if method == "git.stage":
            _read(root, "add", "--", path)
        elif _run(root, "rev-parse", "--verify", "HEAD").returncode == 0:
            _read(root, "restore", "--staged", "--", path)
        else:
            _read(root, "rm", "-r", "--cached", "-f", "--ignore-unmatch", "--", path)
        return {}
    if method == "git.status":
        return _status(root)
    if method == "git.worktrees":
        status = _status(root)
        return [{"path": str(root), "current": True, "branch": status["branch"],
                 "changes": len(status["entries"])}]
    if method == "git.show":
        revision = body.get("rev")
        path = body.get("path")
        if not isinstance(revision, str) or (
            revision not in {"HEAD", ":0"}
            and not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\^?", revision)
        ):
            raise ValueError("Invalid Git revision")
        if not isinstance(path, str) or not path or Path(path).is_absolute() or ":" in path:
            raise ValueError("Invalid repository-relative Git path")
        relative = (root / path).resolve().relative_to(root).as_posix()
        object_name = f"{revision}:{relative}"
        size = _run(root, "cat-file", "-s", object_name)
        if size.returncode or int(size.stdout) > 1024 * 1024:
            return {"content": None}
        blob = _run(root, "cat-file", "blob", object_name)
        if blob.returncode or b"\0" in blob.stdout:
            return {"content": None}
        try:
            return {"content": blob.stdout.decode("utf-8")}
        except UnicodeDecodeError:
            return {"content": None}
    if method == "git.commit-diff":
        revision = body.get("hash")
        if not isinstance(revision, str) or not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", revision):
            raise ValueError("Invalid Git commit hash")
        return {"diff": _read(root, "show", "--format=", "--no-ext-diff", "--no-textconv",
                              revision, "--")[:100_000]}
    if method == "git.diff":
        path = body.get("path")
        if path is not None and (not isinstance(path, str) or not (root / path).resolve().is_relative_to(root)):
            raise PermissionError("Git path is outside the repository")
        staged = ["--cached"] if body.get("staged") is True else []
        return {"diff": _read(root, "diff", "--no-ext-diff", "--no-textconv", *staged,
                              "--", *([path] if path else []))[:100_000]}

    branches = [
        {"ref": ref, "name": ref.removeprefix("refs/heads/").removeprefix("refs/remotes/")}
        for ref in _read(root, "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes").splitlines()
    ]
    requested = body.get("branch")
    if requested and not any(requested == branch["ref"] for branch in branches):
        raise ValueError("Unknown Git branch")
    count = body.get("count", 50)
    count = min(max(count, 1), 100) if type(count) is int else 50
    cursor = body.get("cursor")
    if cursor is None:
        offset = 0
    elif isinstance(cursor, str) and cursor.isascii() and cursor.isdecimal() and len(cursor) <= 6:
        offset = int(cursor)
    else:
        raise ValueError("Invalid Git graph cursor")
    head = _run(root, "rev-parse", "--verify", "HEAD")
    entries = []
    if head.returncode == 0:
        revisions = [requested] if requested else ["--all", "HEAD"]
        log = _read(root, "log", "--topo-order", f"--skip={offset}", f"-n{count + 1}",
                    "--format=%H%x00%h%x00%P%x00%an%x00%aI%x00%s", *revisions, "--")
        for line in log.split("\n"):
            if not line:
                continue
            full, abbrev, parents, author, date, subject = line.split("\0", 5)
            entries.append({"hashFull": full, "hash": abbrev, "parents": parents.split(),
                            "author": author, "date": date, "subject": subject, "refs": []})
    has_more = len(entries) > count
    return {"isRepo": True, "root": str(root), "entries": entries[:count], "branches": branches,
            "hasMore": has_more, "nextCursor": str(offset + count) if has_more else None}
