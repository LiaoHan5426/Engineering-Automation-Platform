"""Git operations for the DSH workspace sidebar."""

import os
import re
import subprocess
from pathlib import Path
from typing import Any


def _run(cwd: Path, *args: str, timeout: int = 10) -> subprocess.CompletedProcess[bytes]:
    try:
        env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        env.update(GIT_OPTIONAL_LOCKS="0", GIT_LITERAL_PATHSPECS="1", GIT_TERMINAL_PROMPT="0")
        return subprocess.run(
            ["git", "-c", "core.fsmonitor=false", *args],
            cwd=cwd, env=env, capture_output=True, timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise OSError("Git command timed out") from exc


def _read(cwd: Path, *args: str, timeout: int = 10) -> str:
    result = _run(cwd, *args, timeout=timeout)
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


_INDEX_METHODS = {"git.stage", "git.unstage"}
REMOTE_GIT_METHODS = frozenset({"git.push", "git.pull"})
_MUTATION_METHODS = _INDEX_METHODS | {"git.commit", "git.checkout"} | REMOTE_GIT_METHODS


def _worktrees(root: Path, workspace: Path) -> dict[Path, str]:
    entries = {}
    for record in _read(root, "worktree", "list", "--porcelain", "-z").split("\0\0"):
        fields = dict(field.partition(" ")[::2] for field in record.split("\0") if field)
        if not fields.get("worktree") or "bare" in fields or "prunable" in fields:
            continue
        path = Path(fields["worktree"]).resolve()
        if path.is_relative_to(workspace) and path.is_dir():
            entries[path] = fields.get("branch", "").removeprefix("refs/heads/")
    return entries


def _local_branches(root: Path) -> dict[str, Any]:
    symbolic = _run(root, "symbolic-ref", "--quiet", "--short", "HEAD")
    current = symbolic.stdout.decode("utf-8").rstrip("\r\n") if symbolic.returncode == 0 else ""
    names = [name.removeprefix("refs/heads/") for name in
             _read(root, "for-each-ref", "--format=%(refname)", "refs/heads").splitlines()]
    if current and current not in names:
        names.insert(0, current)
    return {"current": current, "names": names}


def _sync_upstream(root: Path, method: str) -> dict[str, bool]:
    branch = _read(root, "symbolic-ref", "--quiet", "HEAD").strip()
    upstream = _read(
        root, "for-each-ref", "--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)", branch
    )
    for row in upstream.splitlines():
        ref, remote, remote_ref = row.split("\0")
        if ref == branch:
            break
    else:
        raise ValueError("The current branch has no upstream")
    if not remote or remote == "." or not remote_ref.startswith("refs/heads/"):
        raise ValueError("The current branch has no remote branch upstream")
    if method == "git.push":
        _read(root, "push", "--no-force", "--no-mirror", "--no-follow-tags",
              "--", remote, f"HEAD:{remote_ref}", timeout=60)
    else:
        _read(root, "pull", "--ff-only", "--no-rebase", "--", remote, remote_ref, timeout=60)
    return {"ok": True}


def call_workspace_git(workspace: Path, cwd: Path, method: str, body: dict[str, Any]) -> Any:
    workspace = workspace.resolve()
    found = _run(cwd, "rev-parse", "--show-toplevel")
    if found.returncode:
        if method in _MUTATION_METHODS:
            raise ValueError("No Git repository in the selected workspace")
        if method == "git.branch":
            return {"current": "", "names": []}
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
    if not root.is_relative_to(workspace):
        raise PermissionError("Git root is outside the workspace")
    worktree = body.get("worktree")
    if worktree is not None and worktree != "":
        if not isinstance(worktree, str) or not Path(worktree).is_absolute():
            raise ValueError("Expected an absolute worktree path")
        selected = Path(worktree).resolve()
        if selected != root and selected not in _worktrees(root, workspace):
            raise PermissionError("Git worktree is outside the authorized repository")
        root = selected
    if method in _MUTATION_METHODS:
        for option in ("--git-dir", "--git-common-dir"):
            directory = Path(_read(root, "rev-parse", "--path-format=absolute", option).rstrip("\r\n")).resolve()
            if not directory.is_relative_to(workspace):
                raise PermissionError("Git metadata is outside the workspace")
    if method in _INDEX_METHODS:
        path = body.get("path")
        if path is not None:
            if not isinstance(path, str) or not path or Path(path).anchor or ":" in path:
                raise ValueError("A repository-relative path is required")
            if ".." in Path(path).parts or not (root / path).resolve().is_relative_to(root):
                raise PermissionError("Git path is outside the repository")
        pathspec = ("--", path) if path is not None else ("--", ".")
        if method == "git.stage":
            _read(root, "add", "-A", *pathspec)
        elif _run(root, "rev-parse", "--verify", "HEAD").returncode == 0:
            _read(root, "restore", "--staged", *pathspec)
        else:
            _read(root, "rm", "-r", "--cached", "-f", "--ignore-unmatch", *pathspec)
        return {"ok": True}
    if method == "git.commit":
        message = body.get("message")
        if not isinstance(message, str) or not message.strip() or "\0" in message or len(message) > 8192:
            raise ValueError("Expected a non-empty commit message up to 8192 characters")
        _read(root, "commit", "-m", message)
        return {"ok": True}
    if method == "git.checkout":
        branch = body.get("branch")
        if not isinstance(branch, str) or branch.startswith("-") or branch not in _local_branches(root)["names"]:
            raise ValueError("Expected an existing local branch")
        _read(root, "switch", "--no-guess", "--", branch)
        return {"ok": True}
    if method in REMOTE_GIT_METHODS:
        return _sync_upstream(root, method)
    if method == "git.branch":
        return _local_branches(root)
    if method == "git.status":
        return _status(root)
    if method == "git.worktrees":
        listed = sorted(_worktrees(root, workspace).items(), key=lambda entry: entry[0] != root)
        return [{"path": str(path), "current": path == root, "branch": branch,
                 "changes": len(_status(path)["entries"])} for path, branch in listed]
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
