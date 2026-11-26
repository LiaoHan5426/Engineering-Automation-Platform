from __future__ import annotations

import uuid


def test_board_tasks_empty_list(client):
    response = client.get("/api/board/tasks", params={"projectId": "local-eap"})
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_board_tasks_create_list_get(client):
    project_id = "group-" + uuid.uuid4().hex[:8]
    draft = {
        "projectId": project_id,
        "title": "Slice C task",
        "column": "planned",
        "sessionId": "sess-a",
        "goal": "ship board store",
        "acceptanceCriteria": "pytest green",
        "requestId": str(uuid.uuid4()),
    }
    created = client.post("/api/board/tasks", json=draft)
    assert created.status_code == 200, created.text
    task = created.json()
    assert task["projectId"] == project_id
    assert task["title"] == draft["title"]
    assert task["revision"] == 1
    assert task["events"] == ["created"]
    assert client.post("/api/board/tasks", json=draft).json()["id"] == task["id"]
    conflict = client.post("/api/board/tasks", json={**draft, "title": "different"})
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "BOARD_REQUEST_CONFLICT"

    listed = client.get("/api/board/tasks", params={"projectId": project_id})
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == task["id"]

    loaded = client.get(f"/api/board/tasks/{task['id']}", params={"projectId": project_id})
    assert loaded.status_code == 200
    assert loaded.json() == task


def test_board_tasks_wrong_project_returns_not_found(client):
    project_id = "owned-" + uuid.uuid4().hex[:8]
    draft = {
        "projectId": project_id,
        "title": "scoped",
        "column": "planned",
        "sessionId": "",
        "goal": "",
        "acceptanceCriteria": "",
        "requestId": str(uuid.uuid4()),
    }
    task = client.post("/api/board/tasks", json=draft).json()
    wrong = client.get(f"/api/board/tasks/{task['id']}", params={"projectId": "other-project"})
    assert wrong.status_code == 404
    assert wrong.json()["code"] == "BOARD_TASK_NOT_FOUND"


def test_board_task_deep_link_identity(client):
    project_id = "deep-" + uuid.uuid4().hex[:8]
    draft = {
        "projectId": project_id,
        "title": "deep link",
        "column": "planned",
        "sessionId": "deep-session",
        "goal": "g",
        "acceptanceCriteria": "a",
        "requestId": str(uuid.uuid4()),
    }
    created = client.post("/api/board/tasks", json=draft).json()
    fetched = client.get(f"/api/board/tasks/{created['id']}", params={"projectId": project_id}).json()
    assert fetched["id"] == created["id"]
    assert fetched["projectId"] == project_id

def test_board_preparation_and_revision_protect_task_transition(client):
    project_id = "transition-" + uuid.uuid4().hex
    draft = {
        "projectId": project_id,
        "title": "Prepare a task",
        "requestId": str(uuid.uuid4()),
    }
    task = client.post("/api/board/tasks", json=draft).json()
    url = "/api/board/tasks/" + task["id"]
    update = {"projectId": project_id, "revision": task["revision"], "column": "ready"}
    incomplete = client.post(url, json=update)
    assert incomplete.status_code == 409
    assert incomplete.json()["code"] == "BOARD_PREPARATION_REQUIRED"
    prepared = client.post(url, json={
        **update, "goal": "Verify transition", "acceptanceCriteria": "Revision advances",
    })
    assert prepared.status_code == 200
    assert prepared.json()["column"] == "ready"
    stale = client.post(url, json={**update, "column": "planned"})
    assert stale.status_code == 409
    assert stale.json()["code"] == "BOARD_REVISION_CONFLICT"
    unsupported = client.post(url, json={
        **update, "column": "done", "revision": prepared.json()["revision"],
    })
    assert unsupported.status_code == 409
    assert unsupported.json()["code"] == "BOARD_EXECUTION_EVIDENCE_REQUIRED"
    assert client.get(url, params={"projectId": project_id}).json() == prepared.json()

def test_invalid_create_values_are_rejected_without_creating_tasks(client):
    draft = {"projectId": "invalid-fields", "title": "Strict input", "requestId": str(uuid.uuid4())}
    for patch, code in (
        ({"column": []}, "INVALID_BOARD_INITIAL_COLUMN"),
        ({"column": False}, "INVALID_BOARD_INITIAL_COLUMN"),
        ({"goal": {"text": "invalid"}}, "BOARD_TEXT_TOO_LONG"),
    ):
        response = client.post("/api/board/tasks", json={**draft, **patch})
        assert response.status_code == 400
        assert response.json()["code"] == code
    assert client.get("/api/board/tasks", params={"projectId": draft["projectId"]}).json() == {"items": []}