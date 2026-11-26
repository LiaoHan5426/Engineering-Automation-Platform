from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

# Local npm fixture paths only — not an EAP Cordis profile identity.
FIXTURE_CANDIDATES = [
    Path(r"C:\Users\LH\.dsh\profiles\desktop\node_modules\dsh-better-sidebar"),
    Path(__file__).resolve().parents[2]
    / "dsh-personal"
    / "node_modules"
    / "dsh-better-sidebar",
]


def _fixture_pkg() -> Path:
    for candidate in FIXTURE_CANDIDATES:
        if (candidate / "package.json").is_file() and (candidate / "lib" / "client.js").is_file():
            return candidate
    pytest.skip("dsh-better-sidebar@0.31.1 fixture not found on disk")


def test_install_enable_contributions_and_host_bridge(client, tmp_path: Path, monkeypatch):
    source = _fixture_pkg()
    # Copy into temp so install does not mutate the on-disk fixture package.
    staged = tmp_path / "dsh-better-sidebar"
    shutil.copytree(
        source,
        staged,
        ignore=shutil.ignore_patterns("node_modules", ".git", "src"),
    )
    # Ensure package.json identity is pinned for the assertion.
    meta = json.loads((staged / "package.json").read_text(encoding="utf-8"))
    assert meta["name"] == "dsh-better-sidebar"
    assert meta["version"] == "0.31.1"

    installed = client.post("/api/plugins/install", json={"sourcePath": str(staged)})
    assert installed.status_code == 200, installed.text
    body = installed.json()
    assert body["name"] == "dsh-better-sidebar"
    assert body["enabled"] is False
    assert body["controlPlane"] == "py-backend"
    assert body["clientEntry"].endswith("client.js")

    listed = client.get("/api/plugins").json()
    assert any(item["name"] == "dsh-better-sidebar" for item in listed["items"])

    contrib_before = client.get("/api/plugins/contributions").json()
    assert contrib_before["uiClients"] == []

    enabled = client.post("/api/plugins/dsh-better-sidebar/enable")
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["enabled"] is True

    contrib = client.get("/api/plugins/contributions").json()
    assert len(contrib["uiClients"]) == 1
    entry = contrib["uiClients"][0]
    assert entry["name"] == "dsh-better-sidebar"
    assert entry["controlPlane"] == "py-backend"
    assert entry["clientUrl"].startswith("/api/plugins/dsh-better-sidebar/files/")
    assert entry["hostApiBase"] == "/api/plugins/host/dsh-better-sidebar"

    file_resp = client.get(entry["clientUrl"])
    assert file_resp.status_code == 200
    assert b"exports.apply" in file_resp.content or b"apply" in file_resp.content

    status = client.get("/api/plugins/host/dsh-better-sidebar/status")
    assert status.status_code == 200
    assert status.json()["controlPlane"] == "py-backend"
    assert status.json()["sidecar"] == "in-process-bridge"

    # Typed Host API client path (runtime-client).
    host_api = client.post(
        "/api/plugins/host/dsh-better-sidebar/sidebar/api/settings.get",
        json={},
    )
    assert host_api.status_code == 200
    envelope = host_api.json()
    assert envelope["ok"] is True
    assert envelope["controlPlane"] == "py-backend"
    assert envelope["value"]["externalDisable"] is False

    bundle_url = "/sidebar/bundle/editor.js"
    bundle = client.get(bundle_url)
    assert bundle.status_code == 200
    probe = client.head(bundle_url)
    assert probe.status_code == 200
    assert probe.headers["etag"] == bundle.headers["etag"]
    assert probe.content == b""

    # Same-origin gateway used by Cordis island fetch('/sidebar/api/...').
    gateway = client.post("/sidebar/api/fs.tree", json={"path": "."})
    assert gateway.status_code == 200
    gw = gateway.json()
    assert gw["ok"] is True
    assert gw["controlPlane"] == "py-backend"
    assert "entries" in gw["value"]

    workspace = client.app.state.settings.workspace_root
    note = workspace / "sidebar-note.txt"
    note.write_text("before", encoding="utf-8")
    file_info = client.post("/sidebar/api/fs.read", json={"path": note.name}).json()["value"]
    params = {"path": note.name, "sessionId": "test", "expectedMtimeMs": file_info["mtimeMs"]}
    headers = {"content-type": "text/plain; charset=utf-8", "sec-fetch-site": "same-origin"}
    denied = client.post("/sidebar/write", params=params, content="after", headers=headers)
    assert denied.json()["error"]["code"] == "permission-denied"
    monkeypatch.setattr(client.app.state.plugins._bridge, "_write_enabled", True)
    saved = client.post("/sidebar/write", params=params, content="after", headers=headers)
    assert saved.json()["value"]["mtimeMs"] > file_info["mtimeMs"]
    assert note.read_text(encoding="utf-8") == "after"
    stale = client.post("/sidebar/write", params=params, content="stale", headers=headers)
    assert stale.json()["error"]["code"] == "fs-conflict"
    assert note.read_text(encoding="utf-8") == "after"

    # Disable removes contributions and Host activity.
    disabled = client.post("/api/plugins/dsh-better-sidebar/disable")
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False
    assert client.get("/api/plugins/contributions").json()["uiClients"] == []
    assert client.get("/api/plugins/host/dsh-better-sidebar/status").status_code == 409
    assert client.post("/sidebar/api/settings.get", json={}).status_code == 409


def test_path_escape_rejected(client, tmp_path: Path):
    source = _fixture_pkg()
    staged = tmp_path / "pkg"
    shutil.copytree(
        source,
        staged,
        ignore=shutil.ignore_patterns("node_modules", ".git", "src"),
    )
    assert client.post("/api/plugins/install", json={"sourcePath": str(staged)}).status_code == 200
    assert client.post("/api/plugins/dsh-better-sidebar/enable").status_code == 200
    escaped = client.get("/api/plugins/dsh-better-sidebar/files/../../etc/passwd")
    assert escaped.status_code in {400, 404}


def test_sidebar_open_tool_stays_on_server(client, tmp_path: Path):
    source = _fixture_pkg()
    staged = tmp_path / "pkg"
    shutil.copytree(
        source,
        staged,
        ignore=shutil.ignore_patterns("node_modules", ".git", "src"),
    )
    client.post("/api/plugins/install", json={"sourcePath": str(staged)})
    client.post("/api/plugins/dsh-better-sidebar/enable")
    # Tool registry is exercised via host bridge helper (Chat path uses same registry).
    bridge = client.app.state.plugins._bridge
    result = bridge.open_sidebar_tool()
    assert result["ok"] is True
    assert result["controlPlane"] == "py-backend"
    assert result["code"] == "sidebar_open"
