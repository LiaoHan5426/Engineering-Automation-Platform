from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.domain.statuses import ACTIVE_EXECUTION_STATUSES


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class ExecutionState:
    execution_id: str
    conversation_id: str
    status: str = "CREATED"
    complete: bool = False
    cancel_requested: bool = False
    sequence: int = 0
    events: list[dict[str, Any]] = field(default_factory=list)


class ExecutionJournal:
    """In-memory hot path; schema tables reserved for CT-01 enrichment."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._by_execution: dict[str, ExecutionState] = {}
        self._active_by_conversation: dict[str, str] = {}

    def start(self, conversation_id: str) -> ExecutionState:
        with self._lock:
            if conversation_id in self._active_by_conversation:
                raise BusyError(conversation_id)
            execution_id = f"exec-{uuid.uuid4().hex[:12]}"
            state = ExecutionState(execution_id=execution_id, conversation_id=conversation_id)
            self._by_execution[execution_id] = state
            self._active_by_conversation[conversation_id] = execution_id
            return state

    def get(self, execution_id: str) -> ExecutionState | None:
        with self._lock:
            return self._by_execution.get(execution_id)

    def active_for(self, conversation_id: str) -> ExecutionState | None:
        with self._lock:
            execution_id = self._active_by_conversation.get(conversation_id)
            return self._by_execution.get(execution_id) if execution_id else None

    def request_cancel(self, conversation_id: str) -> dict[str, Any]:
        with self._lock:
            execution_id = self._active_by_conversation.get(conversation_id)
            if not execution_id:
                return {"cancelled": False, "executionId": ""}
            state = self._by_execution[execution_id]
            if state.complete:
                return {"cancelled": False, "executionId": execution_id}
            state.cancel_requested = True
            state.status = "CANCELLING"
            return {"cancelled": True, "executionId": execution_id}

    def is_cancel_requested(self, execution_id: str) -> bool:
        with self._lock:
            state = self._by_execution.get(execution_id)
            return bool(state and state.cancel_requested)

    def append_event(
        self,
        state: ExecutionState,
        *,
        event_type: str,
        status: str = "",
        text: str = "",
        code: str = "",
        payload: Any = None,
        message: str = "",
    ) -> dict[str, Any]:
        with self._lock:
            state.sequence += 1
            if status:
                state.status = status
            event = {
                "eventId": f"{state.execution_id}-{state.sequence}",
                "sequence": state.sequence,
                "executionId": state.execution_id,
                "conversationId": state.conversation_id,
                "type": event_type,
                "protocolVersion": "1",
                "occurredAt": _now(),
                "text": text,
                "code": code,
                "status": status or state.status,
                "payload": payload,
            }
            if message:
                event["message"] = message
            state.events.append(event)
            return event

    def complete(self, state: ExecutionState, status: str) -> None:
        with self._lock:
            state.status = status
            state.complete = True
            active = self._active_by_conversation.get(state.conversation_id)
            if active == state.execution_id:
                del self._active_by_conversation[state.conversation_id]

    def mark_unknown_on_shutdown(self) -> None:
        with self._lock:
            for conversation_id, execution_id in list(self._active_by_conversation.items()):
                state = self._by_execution[execution_id]
                if state.status in ACTIVE_EXECUTION_STATUSES:
                    state.status = "UNKNOWN"
                    state.complete = False
                del self._active_by_conversation[conversation_id]

    def snapshot(
        self, conversation_id: str, execution_id: str, after_sequence: int = 0
    ) -> dict[str, Any] | None:
        with self._lock:
            state = self._by_execution.get(execution_id)
            if not state or state.conversation_id != conversation_id:
                return None
            events = [e for e in state.events if e["sequence"] > after_sequence]
            return {
                "executionId": state.execution_id,
                "conversationId": state.conversation_id,
                "latestSequence": state.sequence,
                "complete": state.complete,
                "status": state.status,
                "events": events,
            }


class BusyError(Exception):
    def __init__(self, conversation_id: str) -> None:
        super().__init__(conversation_id)
        self.conversation_id = conversation_id
