"""Process-local delivery of sidebar intents to viewers of the same session."""

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from threading import Lock


class SidebarOpens:
    def __init__(self) -> None:
        self._lock = Lock()
        self._listeners: dict[asyncio.Queue[dict[str, str]], tuple[str, asyncio.AbstractEventLoop]] = {}

    @contextmanager
    def subscribe(self, session_id: str) -> Iterator[asyncio.Queue[dict[str, str]]]:
        queue: asyncio.Queue[dict[str, str]] = asyncio.Queue(maxsize=16)
        with self._lock:
            self._listeners[queue] = (session_id, asyncio.get_running_loop())
        try:
            yield queue
        finally:
            with self._lock:
                self._listeners.pop(queue, None)

    @staticmethod
    def _enqueue(queue: asyncio.Queue[dict[str, str]], event: dict[str, str]) -> None:
        if queue.full():
            queue.get_nowait()
        queue.put_nowait(event)

    def publish(self, session_id: str, event: dict[str, str]) -> None:
        with self._lock:
            for queue, (scope, loop) in self._listeners.items():
                if scope == session_id and not loop.is_closed():
                    loop.call_soon_threadsafe(self._enqueue, queue, event)
