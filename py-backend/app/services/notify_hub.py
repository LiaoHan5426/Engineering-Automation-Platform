from __future__ import annotations

import asyncio
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any

from app.domain.notify import NotifyContractError, validate_notify_fields


def _utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class NotifyHub:
    """In-process ring buffer + fan-out for notify SSE and WebSocket subscribers."""

    def __init__(self, *, capacity: int = 500) -> None:
        self._capacity = capacity
        self._sequence = 0
        self._events: deque[dict[str, Any]] = deque(maxlen=capacity)
        self._sse_subscribers: set[asyncio.Queue[dict[str, Any] | None]] = set()
        self._ws_subscribers: set[asyncio.Queue[dict[str, Any] | None]] = set()
        self._lock = asyncio.Lock()

    @property
    def latest_sequence(self) -> int:
        return self._sequence

    def snapshot(self, after: int = 0) -> dict[str, Any]:
        if after < 0:
            raise NotifyContractError("NOTIFY_AFTER_INVALID")
        events = [event for event in self._events if event["sequence"] > after]
        return {"events": list(events), "latestSequence": self._sequence}

    async def publish(
        self,
        *,
        kind: str,
        severity: str,
        code: str,
        title: str,
        text: str,
        surfaces: list[str] | None = None,
        target: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        fields = validate_notify_fields(
            kind=kind,
            severity=severity,
            code=code,
            title=title,
            text=text,
            surfaces=surfaces,
            target=target,
        )
        async with self._lock:
            self._sequence += 1
            event = {
                "eventId": str(uuid.uuid4()),
                "sequence": self._sequence,
                "occurredAt": _utcnow(),
                "protocolVersion": "1",
                **fields,
            }
            self._events.append(event)
            dead: list[asyncio.Queue[dict[str, Any] | None]] = []
            for queue in self._sse_subscribers | self._ws_subscribers:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    dead.append(queue)
            for queue in dead:
                self._sse_subscribers.discard(queue)
                self._ws_subscribers.discard(queue)
            return event

    def subscribe_sse(self) -> asyncio.Queue[dict[str, Any] | None]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue(maxsize=64)
        self._sse_subscribers.add(queue)
        return queue

    def subscribe_ws(self) -> asyncio.Queue[dict[str, Any] | None]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue(maxsize=64)
        self._ws_subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any] | None]) -> None:
        self._sse_subscribers.discard(queue)
        self._ws_subscribers.discard(queue)
        try:
            queue.put_nowait(None)
        except asyncio.QueueFull:
            pass
