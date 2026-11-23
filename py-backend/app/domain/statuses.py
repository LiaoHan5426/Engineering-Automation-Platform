from __future__ import annotations

from typing import Final

CHAT_EXECUTION_STATUSES: Final[frozenset[str]] = frozenset(
    {
        "CREATED",
        "RUNNING",
        "CANCELLING",
        "SUCCEEDED",
        "FAILED",
        "REJECTED",
        "REFUSED",
        "TIMED_OUT",
        "CANCELLED",
        "UNKNOWN",
    }
)

ACTIVE_EXECUTION_STATUSES: Final[frozenset[str]] = frozenset(
    {"CREATED", "RUNNING", "CANCELLING"}
)

AI_TOOL_MODES: Final[frozenset[str]] = frozenset({"none", "git_status", "code_sources"})

TASK_MODES: Final[frozenset[str]] = frozenset({"chat", "code", "plan"})

MESSAGE_ROLES: Final[frozenset[str]] = frozenset({"USER", "ASSISTANT"})


def is_chat_execution_status(value: object) -> bool:
    return isinstance(value, str) and value in CHAT_EXECUTION_STATUSES


def is_ai_tool_mode(value: object) -> bool:
    return isinstance(value, str) and value in AI_TOOL_MODES


def is_task_mode(value: object) -> bool:
    return isinstance(value, str) and value in TASK_MODES
