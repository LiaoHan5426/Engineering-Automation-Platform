"""Project successful EAP workspace file operations onto the DSH file event stream."""

from __future__ import annotations

import json
import time
from collections import deque
from pathlib import Path
from threading import Condition
from typing import Any
from uuid import uuid4


class ChangesLog:
    def __init__(self) -> None:
        self._condition = Condition()
        self._sequence = 0
        self._events: deque[tuple[Path, str, dict[str, Any]]] = deque(maxlen=4000)

    def record_write(self, workspace: Path, session_id: str, path: str) -> None:
        self._record(workspace, session_id, path, "write")

    def record_read(self, workspace: Path, session_id: str, path: str) -> None:
        self._record(workspace, session_id, path, "read")

    def _record(self, workspace: Path, session_id: str, path: str, operation: str) -> None:
        call_id = str(uuid4())
        timestamp = time.time_ns() // 1_000_000
        with self._condition:
            for kind, data in (
                ("tool/call", {"name": operation, "callId": call_id, "arguments": json.dumps({"path": path})}),
                ("tool/result", {"message": {"source": {"callId": call_id}, "content": [], "isError": False}}),
            ):
                self._sequence += 1
                self._events.append((workspace, session_id, {
                    "type": kind, "seq": self._sequence, "time": timestamp, "data": data,
                }))
            self._condition.notify_all()

    def response(self, workspace: Path, session_id: str, after_seq: int, wait: bool) -> dict[str, Any]:
        with self._condition:
            if wait:
                self._condition.wait_for(
                    lambda: any(
                        root == workspace and session == session_id and event["seq"] > after_seq
                        for root, session, event in self._events
                    ),
                    timeout=1,
                )
            events = [
                event for root, session, event in self._events
                if root == workspace and session == session_id and event["seq"] > after_seq
            ]
        return {"events": events, "lastSeq": events[-1]["seq"] if events else after_seq}


CHANGES_LOG = ChangesLog()
