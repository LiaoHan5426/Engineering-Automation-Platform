from __future__ import annotations

from enum import StrEnum


class ChatErrorCode(StrEnum):
    UNKNOWN_CONVERSATION = "UNKNOWN_CONVERSATION"
    CONVERSATION_BUSY = "CONVERSATION_BUSY"
    INVALID_CHAT_REQUEST = "INVALID_CHAT_REQUEST"
    INVALID_TASK_CONTEXT = "INVALID_TASK_CONTEXT"
    MODEL_NOT_CONFIGURED = "MODEL_NOT_CONFIGURED"
    MODEL_NOT_ALLOWED = "MODEL_NOT_ALLOWED"
    AI_EMPTY_RESPONSE = "AI_EMPTY_RESPONSE"
    AI_PROVIDER_ERROR = "AI_PROVIDER_ERROR"
    TOOL_FAILED = "TOOL_FAILED"
    TOOL_MODE_UNSUPPORTED = "TOOL_MODE_UNSUPPORTED"
    WORKING_MEMORY_CHANGED = "WORKING_MEMORY_CHANGED"


class ConnectionErrorCode(StrEnum):
    UNKNOWN_CONNECTION = "UNKNOWN_CONNECTION"
    INVALID_CONNECTION = "INVALID_CONNECTION"


class LlmError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
