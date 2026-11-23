from __future__ import annotations

import json
from typing import Any


def format_sse(event: dict[str, Any]) -> str:
    """Encode one ChatExecutionEvent as an SSE frame."""
    event_id = event["eventId"]
    event_type = event["type"]
    # Drop None payload to keep JSON lean; keep empty strings required by the client.
    body = {key: value for key, value in event.items() if value is not None or key == "payload"}
    if body.get("payload") is None:
        body.pop("payload", None)
    data = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    return f"id: {event_id}\nevent: {event_type}\ndata: {data}\n\n"
