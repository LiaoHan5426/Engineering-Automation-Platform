from __future__ import annotations

from fastapi.testclient import TestClient


def test_model_history_counts_then_clears_without_deleting_the_graph(client: TestClient) -> None:
    opened = client.post("/api/ai/conversations")
    conversation_id = opened.json()["conversationId"]
    sent = client.post(
        f"/api/ai/conversations/{conversation_id}/messages",
        json={"message": "hello history", "toolMode": "none"},
        headers={"Accept": "text/event-stream"},
    )
    assert sent.status_code == 200

    usage = client.get(f"/api/ai/conversations/{conversation_id}/model-history")
    assert usage.status_code == 200
    assert usage.json()["messages"] == 2
    assert usage.json()["chars"] >= len("hello history")

    cleared = client.delete(f"/api/ai/conversations/{conversation_id}/model-history")
    assert cleared.status_code == 204
    assert client.get(f"/api/ai/conversations/{conversation_id}/model-history").json() == {
        "messages": 0,
        "chars": 0,
    }
    graph = client.get(f"/api/ai/conversations/{conversation_id}/graph")
    assert len(graph.json()["path"]) == 2

    summary = client.post(f"/api/ai/conversations/{conversation_id}/model-history/summary")
    assert summary.status_code == 503
    assert summary.json()["code"] == "MODEL_NOT_CONFIGURED"


def test_git_diff_execution_is_a_finished_argv_observation(client: TestClient) -> None:
    missing = client.get("/api/cli-programs/git/operations/git-push/executions")
    assert missing.status_code == 404
    assert missing.json()["code"] == "TOOL_OPERATION_NOT_FOUND"

    ready = client.get("/api/cli-programs/git/operations/git-diff/executions/readiness")
    assert ready.status_code == 200
    assert ready.json()["capabilityId"] == "git-diff"
    assert ready.json()["blockingExecutionId"] is None

    started = client.post(
        "/api/cli-programs/git/operations/git-diff/executions",
        json={"requestId": "req-git-diff-1"},
    )
    assert started.status_code == 200
    body = started.json()
    assert body["status"] in {"SUCCEEDED", "FAILED", "TIMED_OUT"}
    assert body["capabilityId"] == "git-diff"
    assert body["steps"][0]["command"][0] == "git"
    assert len(body["stdout"]) <= 20_000

    again = client.post(
        "/api/cli-programs/git/operations/git-diff/executions",
        json={"requestId": "req-git-diff-1"},
    )
    assert again.json()["id"] == body["id"]

    review = client.get(
        f"/api/cli-programs/git/operations/git-diff/executions/{body['id']}/process-review"
    )
    assert review.json()["completeProcessTreeEvidence"] is False
    assert review.json()["steps"][0]["process"]["status"] == "NOT_CAPTURED"
