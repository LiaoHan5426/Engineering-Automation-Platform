from __future__ import annotations

import json
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.tools.git_status import run_git_status


def test_run_git_status_argv(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    (repo / "a.txt").write_text("x\n", encoding="utf-8")
    result = run_git_status(repo)
    assert result["ok"] is True
    assert result["code"] == "git_status"
    assert any("a.txt" in path for path in result["paths"])


def test_send_with_git_status_emits_tool_event(tmp_path: Path) -> None:
    data_root = tmp_path / "data"
    data_root.mkdir()
    workspace = tmp_path / "ws"
    workspace.mkdir()
    subprocess.run(["git", "init"], cwd=workspace, check=True, capture_output=True)
    (workspace / "note.txt").write_text("n\n", encoding="utf-8")
    settings = Settings(eap_data_root=data_root, eap_workspace_root=workspace)
    app = create_app(settings, offline_reply="tool-ok")
    with TestClient(app) as client:
        conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
        response = client.post(
            f"/api/ai/conversations/{conversation_id}/messages",
            json={"message": "status?", "toolMode": "git_status"},
            headers={"Accept": "text/event-stream"},
        )
        assert response.status_code == 200
        events = []
        for block in response.text.split("\n\n"):
            data_lines = [
                line[5:].lstrip() for line in block.splitlines() if line.startswith("data:")
            ]
            if data_lines:
                events.append(json.loads("\n".join(data_lines)))
        tool_events = [event for event in events if event["type"] == "tool"]
        assert tool_events
        assert tool_events[0]["code"] == "git_status"
        assert events[-1]["type"] == "final"
        assert events[-1]["status"] == "SUCCEEDED"


def test_cancel_idle_conversation(client: TestClient) -> None:
    conversation_id = client.post("/api/ai/conversations").json()["conversationId"]
    response = client.post(f"/api/ai/conversations/{conversation_id}/cancel", json={})
    assert response.status_code == 200
    assert response.json() == {"cancelled": False, "executionId": ""}
