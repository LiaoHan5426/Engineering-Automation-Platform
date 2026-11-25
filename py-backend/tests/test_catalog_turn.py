from __future__ import annotations

import hashlib
import json

from fastapi.testclient import TestClient


def test_shell_boot_catalogs(client: TestClient) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["service"] == "py-backend"
    assert health.json()["status"] == "ok"

    capabilities = client.get("/api/capabilities").json()
    assert "git_status" in capabilities["capabilities"]
    assert capabilities["items"][0]["registered"] is True

    assert client.get("/api/databases").json()["items"] == []
    assert client.get("/api/experts").json()["items"] == []
    assert client.get("/api/tasks").json()["items"] == []
    stats = client.get("/api/stats").json()
    assert stats["tasksTotal"] == 0
    assert stats["model"]["share"] is None
    assert stats["deterministicShare"] is None
    assert client.get("/api/knowledge").json()["items"] == []
    assert client.get("/api/rule-packs").json()["items"] == []
    assert client.get("/api/skills").json()["items"] == []
    assert client.get("/api/scenarios").json()["items"] == []
    assert client.get("/api/mcp-servers").json()["items"] == []


def test_database_rejects_secrets(client: TestClient) -> None:
    response = client.post(
        "/api/databases",
        json={
            "label": "本地",
            "engine": "postgres",
            "environment": "dev",
            "metadata": {"password": "secret"},
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == "CREDENTIAL_NOT_ACCEPTED"


def test_turn_binds_rules_skills_knowledge_and_trusted_mcp_only(client: TestClient) -> None:
    created = client.post(
        "/api/rule-packs",
        json={"name": "评审", "manifest": json.dumps({"id": "review-pack", "rules": [{"id": "no-secret"}]})},
    )
    assert created.status_code == 200
    assert created.json()["id"] == "review-pack"

    raw = "---\nname: Review\ndescription: Read the diff\n---\nRead the diff before answering.\n"
    digest = hashlib.sha256(raw.encode()).hexdigest()
    saved = client.post(
        "/api/skills",
        json={
            "confirmed": True,
            "expectedDigest": digest,
            "input": {
                "rawSkillMd": raw,
                "version": "1",
                "sourceLabel": "operator",
                "resources": [],
                "requiredCapabilities": ["git_status", "missing-tool"],
            },
        },
    )
    assert saved.status_code == 200
    skill = saved.json()
    assert skill["id"] == "review"
    assert skill["enabled"] is False
    deps = {item["id"]: item["status"] for item in skill["dependencies"]}
    assert deps["git_status"] == "available"
    assert deps["missing-tool"] == "disabled"

    activated = client.post(
        "/api/skills/review/versions/1/activation",
        json={"enabled": True, "stateRevision": skill["stateRevision"]},
    )
    assert activated.status_code == 200
    assert activated.json()["enabled"] is True

    base = client.post("/api/knowledge", json={"name": "笔记", "description": ""})
    base_id = base.json()["id"]
    client.post(
        "/api/knowledge/" + base_id + "/documents",
        json={"title": "索引说明", "content": "catalog-token lives in the index"},
    )

    trusted = client.post(
        "/api/mcp-servers",
        json={
            "id": "local-mcp",
            "name": "Local",
            "transport": "http",
            "endpoint": "http://127.0.0.1:9",
            "tools": ["lookup"],
            "trusted": True,
            "enabled": True,
        },
    )
    assert trusted.json()["usable"] is True
    untrusted = client.post(
        "/api/mcp-servers",
        json={
            "id": "closed-mcp",
            "name": "Closed",
            "transport": "http",
            "endpoint": "http://127.0.0.1:9",
            "tools": ["hidden-tool"],
            "trusted": False,
            "enabled": True,
        },
    )
    assert untrusted.json()["usable"] is False
    probe = client.post("/api/mcp-servers/local-mcp/probe")
    assert probe.json()["verified"] is False

    prompt = client.app.state.catalog.render_turn("where is catalog-token", [])
    assert prompt.index("no-secret") < prompt.index("Read the diff")
    assert "catalog-token lives in the index" in prompt
    assert "local-mcp/lookup" in prompt
    assert "hidden-tool" not in prompt
    assert "not yet called" in prompt


def test_scenario_rejects_illegal_status(client: TestClient) -> None:
    response = client.put(
        "/api/scenarios/demo",
        json={"revision": 0, "definition": {"name": "x", "status": "UNKNOWN"}},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_SCENARIO"


def test_ai_status_does_not_invent_a_live_model(client: TestClient) -> None:
    status = client.get("/api/ai/status")
    assert status.status_code == 200
    body = status.json()
    assert body["state"] == "not_configured"
    assert body["lastObservedAt"] is None
    assert body["tools"]["git_status"] is True
    assert body["storesUserDirectoryGrants"] is False
    assert body["authorizedRootPath"]
    dirty = client.get("/api/ai/workspace/dirty")
    assert dirty.status_code == 200
    observed = dirty.json()
    if observed["requested"]:
        assert observed["denial"] == ""
        assert observed["count"] >= len(observed["paths"])
        assert len(observed["paths"]) <= 50
    else:
        assert observed["denial"] == "GIT_STATUS_FAILED"
        assert observed["paths"] == []


def test_runtime_catalog_does_not_probe_git(client: TestClient) -> None:
    tools = client.get("/api/runtime/trusted-tools")
    assert tools.status_code == 200
    body = tools.json()
    assert body["source"] == "py-backend"
    assert body["probeCache"] == {"cached": 0, "known": 0, "failed": 0}
    assert body["items"][0]["id"] == "git_status"
    assert body["items"][0]["versionStatus"] == "unknown"
    assert body["items"][0]["bindingStatus"] in {"ready", "missing_binary"}
    layout = client.get("/api/runtime/data-layout")
    assert layout.status_code == 200
    inventory = layout.json()["inventory"]
    assert inventory["total"] == inventory["present"] + inventory["missing"]
    assert layout.json()["physicalMigration"] is False


def test_workspace_listing_and_source_stay_inside_the_root(client: TestClient) -> None:
    root = client.app.state.settings.workspace_root
    (root / "src").mkdir()
    (root / "src" / "App.vue").write_text("<template>sample</template>\n", encoding="utf-8")
    (root / "node_modules").mkdir()
    (root / ".env").write_text("secret\n", encoding="utf-8")

    listing = client.get("/api/ai/workspace/files")
    assert listing.status_code == 200
    names = [item["name"] for item in listing.json()["entries"]]
    assert names == ["src"]
    assert client.get("/api/ai/workspace/files", params={"path": "../outside"}).json()["denial"] == "INVALID_DIRECTORY_PATH"
    nested = client.get("/api/ai/workspace/files", params={"path": "src"}).json()
    assert nested["entries"][0]["path"] == "src/App.vue"

    source = client.get("/api/ai/workspace/source", params={"path": "src/App.vue"}).json()
    assert source["exists"] is True
    assert source["excerpt"].startswith("<template>")
    assert source["baseHash"]
    baseline = client.get("/api/ai/workspace/baseline", params={"path": "src/App.vue"}).json()
    assert "excerpt" not in baseline
    assert baseline["baseHash"] == source["baseHash"]
    assert client.get("/api/ai/workspace/source", params={"path": "package.json"}).json()["denial"] == "SOURCE_FILES_ONLY"
    probe = client.post("/api/ai/workspace/verification/probe").json()
    assert probe["requested"] is False
    assert probe["denial"] == "VERIFICATION_UNAVAILABLE"


def test_prototype_dependency_contract_and_attached_file_evidence(client: TestClient) -> None:
    deps = client.get("/api/scenarios/workflows/prototype-to-code/dependencies")
    assert deps.status_code == 200
    body = deps.json()
    assert body["contractVersion"] == 1
    assert body["resources"][0]["count"] == 0
    assert client.get("/api/prototype-versions", params={"sourceRef": "builder-alpha"}).json()["items"] == []
    rejected = client.get("/api/prototype-versions", params={"sourceRef": "other"})
    assert rejected.status_code == 400
    assert rejected.json()["code"] == "INVALID_PROTOTYPE_SOURCE"

    prompt = client.app.state.catalog.render_turn(
        "review",
        [],
        [
            {"name": "App.vue", "content": "visible excerpt"},
            {"name": "key.pem", "content": "-----BEGIN OPENSSH PRIVATE KEY-----\nabc"},
        ],
    )
    assert "visible excerpt" in prompt
    assert "PRIVATE KEY" not in prompt
