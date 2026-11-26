from __future__ import annotations

import json

from fastapi.testclient import TestClient


def _sse_events(body: str) -> list[dict]:
    events: list[dict] = []
    for block in body.split("\n\n"):
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
        if not data_lines:
            continue
        events.append(json.loads("\n".join(data_lines)))
    return events


def test_open_send_graph_linear(client: TestClient) -> None:
    opened = client.post("/api/ai/conversations")
    assert opened.status_code == 200
    conversation_id = opened.json()["conversationId"]

    send = client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={"message": "hello", "toolMode": "none"},
        headers={"Accept": "text/event-stream"},
    )
    assert send.status_code == 200
    assert "text/event-stream" in send.headers["content-type"]
    events = _sse_events(send.text)
    assert events[0]["type"] == "status"
    assert events[0]["status"] == "RUNNING"
    assert events[0]["protocolVersion"] == "1"
    assert any(event["type"] == "answer.delta" for event in events)
    final = events[-1]
    assert final["type"] == "final"
    assert final["status"] == "SUCCEEDED"
    assert final["payload"]["answer"] == "offline-mvp-reply"
    assert final["payload"]["status"] == "SUCCEEDED"

    graph = client.get(f"/api/ai/conversations/{conversation_id}/graph")
    assert graph.status_code == 200
    body = graph.json()
    assert body["conversationId"] == conversation_id
    assert len(body["path"]) == 2
    assert body["path"][0]["role"] == "USER"
    assert body["path"][0]["text"] == "hello"
    assert body["path"][1]["role"] == "ASSISTANT"
    assert body["path"][1]["text"] == "offline-mvp-reply"
    assert body["path"] == body["all"]

    stats = client.get("/api/stats?windowDays=7")
    assert stats.status_code == 200
    assert stats.json()["chat"] == {"newConversations": 1, "sentMessages": 1}


def test_unknown_conversation(client: TestClient) -> None:
    response = client.get("/api/ai/conversations/missing/graph")
    assert response.status_code == 404
    assert response.json()["code"] == "UNKNOWN_CONVERSATION"
