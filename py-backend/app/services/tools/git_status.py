from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


def run_git_status(workspace: Path, *, timeout_sec: float = 15.0) -> dict[str, Any]:
    """Run `git status --porcelain=v1` via argv array (no shell)."""
    root = workspace.resolve()
    if not root.is_dir():
        return {
            "ok": False,
            "code": "TOOL_FAILED",
            "summary": f"workspace not found: {root}",
            "exitCode": None,
            "stdout": "",
            "stderr": "",
        }
    try:
        completed = subprocess.run(
            ["git", "status", "--porcelain=v1"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            shell=False,
            check=False,
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "code": "TOOL_FAILED",
            "summary": "git executable not found",
            "exitCode": None,
            "stdout": "",
            "stderr": "",
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "code": "TOOL_FAILED",
            "summary": "git status timed out",
            "exitCode": None,
            "stdout": "",
            "stderr": "",
        }
    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    ok = completed.returncode == 0
    lines = [line for line in stdout.splitlines() if line.strip()]
    return {
        "ok": ok,
        "code": "git_status" if ok else "TOOL_FAILED",
        "summary": f"{len(lines)} changed path(s)" if ok else (stderr.strip() or "git status failed"),
        "exitCode": completed.returncode,
        "stdout": stdout[:20_000],
        "stderr": stderr[:4_000],
        "paths": lines[:500],
    }
