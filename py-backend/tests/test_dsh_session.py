import json

from app.infrastructure.local_workspace.changes import CHANGES_LOG
from fastapi.testclient import TestClient


def test_dsh_session_create_uses_eap_conversation_identity(client: TestClient):
    frame = {
        "type": "client-request",
        "rpcId": "session-create-1",
        "method": "session/create",
        "payload": {"args": {"request": {"cwd": str(client.app.state.settings.workspace_root)}}},
    }
    response = client.post("/api/session/create", json=frame)
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "server-response"
    assert body["rpcId"] == frame["rpcId"]
    assert body["result"]["ok"] is True
    session_id = body["result"]["value"]["sessionId"]
    assert client.app.state.chat_service.get_conversation(session_id)["conversationId"] == session_id

    frame["payload"]["args"]["request"]["sessionId"] = session_id
    reused = client.post("/api/session/create", json=frame).json()["result"]
    assert reused == {"ok": True, "value": {"sessionId": session_id}}

    listed = client.post("/api/session/list", json={
        "type": "client-request", "rpcId": "list", "method": "session/list",
        "payload": {"args": {"request": {}}},
    }).json()
    [summary] = listed["result"]["value"]["items"]
    assert summary["sessionId"] == session_id
    assert summary["blank"] is True
    assert summary["running"] is False
    assert summary["updatedAt"] > 0

    frame["payload"]["args"]["request"] = {"workspaceId": "unknown"}
    result = client.post("/api/session/create", json=frame).json()["result"]
    assert result["ok"] is False
    assert result["error"]["code"] == "workspace/not-found"


def test_workspace_stream_delivers_persisted_session_updates(client: TestClient):
    headers = {"origin": "http://testserver"}
    with client.websocket_connect("/api/remote.mux", headers=headers) as socket:
        socket.send_json({
            "type": "open", "streamId": "workspace", "endpoint": "workspace/follow",
            "payload": {"args": {}},
        })
        first = socket.receive_json()
        assert first["value"]["type"] == "baseline"
        workspace = first["value"]["value"]["items"][0]
        assert workspace["sessionIds"] == []
        response = client.post("/api/session/create", json={
            "type": "client-request", "rpcId": "create", "method": "session/create",
            "payload": {"args": {"request": {"workspaceId": workspace["workspaceId"]}}},
        }).json()
        session_id = response["result"]["value"]["sessionId"]
        following = socket.receive_json()
        assert following["value"]["type"] == "replace"
        assert following["value"]["value"]["items"][0]["sessionIds"] == [session_id]
        socket.send_json({"type": "cancel", "streamId": "workspace"})

def test_dsh_model_catalog_exposes_only_configured_routes(client: TestClient):
    body = client.post("/api/session/modelCatalog", json={
        "type": "client-request", "rpcId": "catalog", "method": "session/modelCatalog",
        "payload": {"args": {}},
    }).json()
    assert body["rpcId"] == "catalog"
    catalog = body["result"]["value"]
    assert catalog["groups"] == []
    assert catalog["routableProviders"] == []
    assert catalog["default"]["model"] == client.app.state.settings.eap_model_default

def test_session_history_projects_committed_eap_messages(client: TestClient):
    session_id = client.post("/api/ai/conversations").json()["conversationId"]
    command = {"address": {"kind": "session", "sessionId": session_id}}
    frame = {
        "type": "client-request", "rpcId": "history", "method": "session/events",
        "payload": {"args": {"request": command}},
    }
    assert client.post("/api/session/events", json=frame).json()["result"]["value"] == {
        "cursor": -1, "records": [], "hasMore": False,
    }
    assert client.post(f"/api/ai/conversations/{session_id}/messages", json={
        "message": "hello", "toolMode": "none",
    }).status_code == 200
    page = client.post("/api/session/events", json=frame).json()["result"]["value"]
    events = [entry["event"] for entry in page["records"]]
    assert [event["seq"] for event in events] == list(range(5))
    assert events[1]["data"]["content"][0]["text"] == "hello"
    assert events[3]["data"]["message"]["content"][0]["text"] == "offline-mvp-reply"
    command["maxMessages"] = 1
    tail = client.post("/api/session/events", json=frame).json()["result"]["value"]
    assert tail == {"cursor": 4, "records": page["records"][3:], "hasMore": True}
    summaries = client.post("/api/session/list", json={
        "type": "client-request", "rpcId": "title", "method": "session/list",
        "payload": {"args": {"request": {}}},
    }).json()["result"]["value"]["items"]
    assert summaries[0]["projections"]["values"]["title"] == "hello"

def test_session_follow_delivers_snapshot_and_committed_events(client: TestClient):
    session_id = client.post("/api/ai/conversations").json()["conversationId"]
    with client.websocket_connect("/api/remote.mux", headers={"origin": "http://testserver"}) as socket:
        socket.send_json({
            "type": "open", "streamId": "events", "endpoint": "$events", "payload": {"args": {}},
        })
        ready = socket.receive_json()
        assert ready["streamId"] == "events"
        assert ready["value"]["type"] == "ready"
        assert ready["value"]["clientId"]
        assert ready["value"]["host"]["home"]
        socket.send_json({
            "type": "open", "streamId": "history", "endpoint": "session/follow",
            "payload": {"args": {"request": {
                "address": {"kind": "session", "sessionId": session_id},
                "activate": True,
                "assistantStream": True,
            }}},
        })
        snapshot = socket.receive_json()["value"]
        assert snapshot["type"] == "snapshot"
        assert snapshot["header"]["id"] == session_id
        assert snapshot["cursor"] == -1
        assert snapshot["assistantStream"] == {"revision": 0}
        projection = client.post("/api/session/projections", json={
            "type": "client-request", "rpcId": "projection", "method": "session/projections",
            "payload": {"args": {"sessionId": session_id}},
        }).json()["result"]["value"]
        assert projection == {"kind": "sequenced", **snapshot["projections"]}
        prompt = {
            "type": "client-request", "rpcId": "prompt", "method": "session/prompt",
            "payload": {"args": {"request": {
                "sessionId": session_id, "requestId": "prompt-request", "mode": "queue",
                "content": [{"type": "text", "text": "hello"}],
            }}},
        }
        assert client.post("/api/session/prompt", json=prompt).json()["result"] == {
            "ok": True, "value": {"accepted": True},
        }
        assert client.post("/api/session/prompt", json=prompt).json()["result"]["ok"] is True
        prompt["payload"]["args"]["request"]["content"][0]["text"] = "different"
        assert client.post("/api/session/prompt", json=prompt).json()["result"]["ok"] is False
        events = [socket.receive_json()["value"]["event"] for _ in range(5)]
        assert [event["seq"] for event in events] == list(range(5))
        assert events[3]["data"]["message"]["content"][0]["text"] == "offline-mvp-reply"
        socket.send_json({"type": "cancel", "streamId": "history"})

def test_prompt_records_workspace_instruction_read_for_its_session(client: TestClient):
    workspace = client.app.state.settings.workspace_root
    (workspace / "AGENTS.md").write_text("Use the fixture instructions.", encoding="utf-8")
    session_id = client.post("/api/ai/conversations").json()["conversationId"]
    frame = {
        "type": "client-request", "rpcId": "prompt", "method": "session/prompt",
        "payload": {"args": {"request": {
            "sessionId": session_id, "requestId": "instruction-read", "mode": "queue",
            "content": [{"type": "text", "text": "hello"}],
        }}},
    }
    assert client.post("/api/session/prompt", json=frame).json()["result"]["ok"] is True
    events = CHANGES_LOG.response(workspace, session_id, -1, False)["events"]
    call, result = events
    assert call["data"]["name"] == "read"
    assert json.loads(call["data"]["arguments"]) == {"path": "AGENTS.md"}
    assert result["data"]["message"]["source"]["callId"] == call["data"]["callId"]
    assert CHANGES_LOG.response(workspace, "another-session", -1, False)["events"] == []

def test_conversation_passes_session_identity_to_tool_dispatch(client: TestClient, monkeypatch):
    service = client.app.state.chat_service
    session_id = client.post("/api/ai/conversations").json()["conversationId"]
    calls = []

    def record(tool_mode, *, session_id=None):
        calls.append((tool_mode, session_id))
        return {"ok": True, "code": "git_status", "summary": "Git status observed"}

    monkeypatch.setattr(service._tools, "run", record)
    response = client.post(f"/api/ai/conversations/{session_id}/messages", json={
        "message": "Inspect the workspace", "toolMode": "git_status",
    })
    assert response.status_code == 200
    assert calls == [("git_status", session_id)]

def test_code_sources_records_only_successful_scoped_reads(client: TestClient):
    workspace = client.app.state.settings.workspace_root
    (workspace / "source.ts").write_text("scoped fixture source", encoding="utf-8")
    session_id = client.post("/api/ai/conversations").json()["conversationId"]
    url = f"/api/ai/conversations/{session_id}/messages"
    for path in ("source.ts", "../outside.ts"):
        response = client.post(url, json={
            "message": "Inspect source", "toolMode": "code_sources", "context": {"targetPath": path},
        })
        assert response.status_code == 200
    events = CHANGES_LOG.response(workspace, session_id, -1, False)["events"]
    assert len(events) == 2
    assert events[0]["data"]["name"] == "read"
    assert json.loads(events[0]["data"]["arguments"]) == {"path": "source.ts"}

def test_model_tool_round_uses_model_selected_path(monkeypatch):
    import asyncio

    from app.infrastructure import llm_openai
    from app.persistence.connections import ConnectionRecord

    requests = []

    async def deltas(_client, _url, _headers, body):
        requests.append(dict(body))
        if len(requests) == 1:
            yield {"tool_calls": [{
                "index": 0, "id": "call-1", "function": {
                    "name": "read_workspace_source", "arguments": '{"path":"fixture.ts"}',
                },
            }]}
        else:
            assert body["messages"][-1] == {
                "role": "tool", "tool_call_id": "call-1", "content": "read:fixture.ts",
            }
            yield {"content": "done"}

    monkeypatch.setattr(llm_openai, "_stream_deltas", deltas)

    async def read():
        connection = ConnectionRecord(id="fixture", name="Fixture", secret="test", default_model="fixture")
        return [delta async for delta in llm_openai.stream_chat_completion(
            connection, [{"role": "user", "content": "Read source"}],
            read_source=lambda path: "read:" + path,
        )]

    assert asyncio.run(read()) == ["done"]
    assert requests[0]["tools"][0]["function"]["name"] == "read_workspace_source"
    assert "tools" not in requests[1]

def test_model_settings_can_create_and_edit_an_api_connection(client):
    created = client.post("/api/ai/connections", json={
        "name": "Local model",
        "baseUrl": "http://127.0.0.1:9000/v1",
        "defaultModel": "example-model",
        "secret": "fixture-key",
    })
    assert created.status_code == 200
    record = created.json()
    assert record["defaultModel"] == "example-model"
    assert record["secretPresent"]
    assert "fixture-key" not in created.text

    updated = client.post(f"/api/ai/connections/{record['id']}", json={
        "wireApi": "responses",
        "defaultModel": "updated-model",
        "secret": "",
    })
    assert updated.status_code == 200
    record = updated.json()
    assert record["wireApi"] == "responses"
    assert record["defaultModel"] == "updated-model"
    assert record["secretPresent"]
    assert "fixture-key" not in updated.text


def test_native_model_settings_mutate_the_connection_store(client):
    def rpc(method, args):
        response = client.post(f"/api/{method}", json={
            "type": "client-request", "rpcId": "model-settings", "method": method,
            "payload": {"args": args},
        })
        assert response.status_code == 200
        return response.json()["result"]

    ns = "llm-pi-ai"
    view = next(row for row in rpc("settings/describe", {})["value"]["namespaces"] if row["ns"] == ns)
    draft = {
        "ns": ns, "expectedRevision": view["revision"],
        "ops": [{"op": "set", "path": ["providers", "fixture"],
                 "value": {"baseURL": "https://example.test/v1", "api": "openai-completions",
                           "models": [{"id": "fixture-model"}]}}],
    }
    assert rpc("settings/mutate", draft)["ok"]
    assert rpc("settings/mutate", draft)["error"]["code"] == "settings/conflict"
    assert rpc("credentials/set", {"ref": "FIXTURE_API_KEY", "value": "fixture-key"})["ok"]
    assert not rpc("credentials/set", {"ref": "OTHER_API_KEY", "value": "fixture-key"})["ok"]
    rows = client.get("/api/ai/connections").json()["items"]
    assert next(row for row in rows if row["id"] == "fixture")["defaultModel"] == "fixture-model"
    flags = rpc("credentials/describe", {"refs": ["FIXTURE_API_KEY"]})["value"]
    assert flags["FIXTURE_API_KEY"]["configured"] is True
    assert flags["FIXTURE_API_KEY"]["source"] == "file"
    assert "fixture-key" not in str(flags)
