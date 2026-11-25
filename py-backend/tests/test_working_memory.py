from __future__ import annotations

from fastapi.testclient import TestClient


def test_working_memory_is_cas_and_keeps_only_references(client: TestClient) -> None:
    opened = client.post("/api/ai/conversations")
    conversation_id = opened.json()["conversationId"]
    baseline = opened.json()["workingMemory"]
    assert baseline["goal"] == ""
    assert baseline["updatedAt"] == "1970-01-01T00:00:00Z"
    assert baseline["layers"] == [
        "display_history",
        "model_window",
        "task_working",
        "binding",
    ]

    saved = client.put(
        f"/api/ai/conversations/{conversation_id}/working-memory",
        json={
            "expectedUpdatedAt": baseline["updatedAt"],
            "goal": "交付登录页",
            "constraints": ["复用现有组件"],
            "facts": [{"kind": "doc", "id": "login-spec", "revisionOrDigest": "abc"}],
            "evidenceRefs": ["execution:1"],
            "dependencyKeys": ["skill:login:1:abc"],
        },
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["goal"] == "交付登录页"
    assert body["invalidation"] == ""
    assert body["facts"] == [{"kind": "doc", "id": "login-spec", "revisionOrDigest": "abc"}]
    assert "content" not in body

    stale = client.put(
        f"/api/ai/conversations/{conversation_id}/working-memory",
        json={"expectedUpdatedAt": baseline["updatedAt"], "goal": "过期目标"},
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "WORKING_MEMORY_CHANGED"

    loaded = client.get(f"/api/ai/conversations/{conversation_id}")
    assert loaded.json()["workingMemory"]["goal"] == "交付登录页"

    extra = client.put(
        f"/api/ai/conversations/{conversation_id}/working-memory",
        json={"expectedUpdatedAt": body["updatedAt"], "goal": "x", "invalidation": "DEPENDENCY_CHANGED"},
    )
    assert extra.status_code == 400
    assert extra.json()["code"] == "INVALID_CHAT_REQUEST"

    missing = client.put(
        "/api/ai/conversations/conv-missing/working-memory",
        json={"expectedUpdatedAt": "1970-01-01T00:00:00Z", "goal": "x"},
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "UNKNOWN_CONVERSATION"
