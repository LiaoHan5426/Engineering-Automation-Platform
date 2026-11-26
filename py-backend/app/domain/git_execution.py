from dataclasses import dataclass
from datetime import datetime


GIT_OPERATIONS = frozenset({"git-status", "git-diff"})


@dataclass(frozen=True, slots=True)
class GitExecution:
    id: str
    request_id: str
    operation: str
    status: str
    workspace_path: str
    executable: str
    command: list[str]
    created_at: datetime
    finished_at: datetime | None
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    truncated: bool = False
