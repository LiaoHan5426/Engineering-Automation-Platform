from __future__ import annotations

import asyncio
import json

from fastapi.testclient import TestClient

REQUIRED = ("eventId", "executionId", "conversationId", "type", "protocolVersion")
STRING_FIELDS = ("occurredAt", "text", "code", "status")


def test_rejects_illegal_tool_mode(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    response = client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={"message": "hi", "toolMode": "shell"},
        headers={"Accept": "text/event-stream"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_CHAT_REQUEST"


def test_rejects_illegal_task_mode(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    response = client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={
            "message": "hi",
            "toolMode": "none",
            "context": {"mode": "not-a-mode"},
        },
        headers={"Accept": "text/event-stream"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_TASK_CONTEXT"


def test_sse_envelope_fields(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    response = client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={"message": "ping", "toolMode": "none"},
        headers={"Accept": "text/event-stream"},
    )
    assert response.status_code == 200
    for block in response.text.split("\n\n"):
        data_lines = [
            line[5:].lstrip() for line in block.splitlines() if line.startswith("data:")
        ]
        if not data_lines:
            continue
        event = json.loads("\n".join(data_lines))
        for key in REQUIRED:
            assert isinstance(event[key], str) and event[key]
        for key in STRING_FIELDS:
            assert isinstance(event[key], str)
        assert isinstance(event["sequence"], int) and event["sequence"] >= 0
        if event["status"]:
            assert event["status"] in {
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

def test_active_turn_is_cancelled_without_persisting_partial_messages(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    service = client.app.state.chat_service
    endpoint = f"/api/ai/conversations/{conversation_id}"
    body = {"message": "cancel this turn", "toolMode": "none"}

    async def cancel_during_turn() -> str:
        events = service.stream_send(conversation_id, body)
        running = await anext(events)
        execution_id = running["executionId"]
        assert running["status"] == "RUNNING"
        duplicate = client.post(f"{endpoint}/messages", json=body)
        assert duplicate.status_code == 409
        assert duplicate.json()["code"] == "CONVERSATION_BUSY"
        cancelled = client.post(f"{endpoint}/cancel")
        assert cancelled.json() == {"cancelled": True, "executionId": execution_id}
        remaining = [event async for event in events]
        assert [(event["type"], event["status"]) for event in remaining] == [
            ("final", "CANCELLED")
        ]
        return execution_id

    execution_id = asyncio.run(cancel_during_turn())
    snapshot = client.get(f"{endpoint}/executions/{execution_id}/snapshot").json()
    assert snapshot["status"] == "CANCELLED"
    assert snapshot["complete"] is True
    assert client.get(f"{endpoint}/graph").json()["path"] == []
