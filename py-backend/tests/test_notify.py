from __future__ import annotations

import json

from fastapi.testclient import TestClient


def test_snapshot_empty(client: TestClient) -> None:
    response = client.get("/api/notify/snapshot")
    assert response.status_code == 200
    body = response.json()
    assert body == {"events": [], "latestSequence": 0}


def test_publish_via_chat_session_and_snapshot(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    response = client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={"message": "ping", "toolMode": "none"},
        headers={"Accept": "text/event-stream"},
    )
    assert response.status_code == 200
    snap = client.get("/api/notify/snapshot").json()
    assert snap["latestSequence"] >= 1
    assert any(event["kind"] == "session" for event in snap["events"])
    assert any(
        event.get("target", {}).get("conversationId") == conversation_id for event in snap["events"]
    )


def test_rejects_illegal_after(client: TestClient) -> None:
    response = client.get("/api/notify/snapshot", params={"after": -1})
    assert response.status_code == 400
    assert response.json()["code"] == "NOTIFY_AFTER_INVALID"


def test_sse_stream_delivers_backlog(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={"message": "ping", "toolMode": "none"},
        headers={"Accept": "text/event-stream"},
    )
    with client.stream("GET", "/api/notify/stream") as response:
        assert response.status_code == 200
        chunk = next(response.iter_text())
        assert "event: notify" in chunk
        data_line = [line for line in chunk.splitlines() if line.startswith("data:")][0]
        event = json.loads(data_line[5:].lstrip())
        assert event["protocolVersion"] == "1"
        assert event["kind"] in {"probe", "session", "system"}


def test_websocket_delivers_backlog(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={"message": "ping", "toolMode": "none"},
        headers={"Accept": "text/event-stream"},
    )
    with client.websocket_connect("/api/notify/ws") as ws:
        event = ws.receive_json()
        assert event["protocolVersion"] == "1"
        assert event["kind"] == "session"


def test_plugin_install_failure_publishes_system(client: TestClient) -> None:
    response = client.post("/api/plugins/install", json={"spec": ""})
    assert response.status_code == 400
    snap = client.get("/api/notify/snapshot").json()
    assert any(
        event["kind"] == "system" and event["code"] == "PLUGIN_INSTALL_FAILED"
        for event in snap["events"]
    )
