from __future__ import annotations

import base64
import subprocess
from pathlib import Path

from app.config import Settings
from app.infrastructure.plugins.host_bridge import HostBridgeState, PluginHostBridge


def _bridge(workspace: Path) -> PluginHostBridge:
    bridge = object.__new__(PluginHostBridge)
    bridge._registry = None  # type: ignore[attr-defined]
    bridge._write_enabled = False
    bridge._remote_git_enabled = False
    bridge._workspace = workspace
    bridge._active = {
        "demo": HostBridgeState(
            name="demo",
            version="0",
            root=workspace,
            workspace=workspace,
        )
    }
    bridge.sync_enabled = lambda: None  # type: ignore[method-assign]
    return bridge


def test_list_dir_permission_denied_returns_soft_error(tmp_path: Path, monkeypatch):
    blocked = tmp_path / "blocked"
    blocked.mkdir()
    bridge = _bridge(tmp_path)

    original = Path.iterdir

    def iterdir(self: Path):
        if self.resolve() == blocked.resolve():
            raise PermissionError(13, "Permission denied", str(self))
        return original(self)

    monkeypatch.setattr(Path, "iterdir", iterdir)
    level = bridge.handle_sidebar_api("demo", "fs.tree", {"path": str(blocked)})["value"]
    assert level["entries"] == []
    assert level["errorCode"] == "PERMISSION_DENIED"
    assert "权限" in level["error"]
    assert level["path"] == str(blocked.resolve()) or level["path"] == str(blocked)


def test_fs_tree_permission_denied_stays_ok_envelope(tmp_path: Path, monkeypatch):
    blocked = tmp_path / ".archify"
    blocked.mkdir()
    bridge = _bridge(tmp_path)

    original = Path.iterdir

    def iterdir(self: Path):
        if self.resolve() == blocked.resolve():
            raise PermissionError(13, "Permission denied", str(self))
        return original(self)

    monkeypatch.setattr(Path, "iterdir", iterdir)
    envelope = bridge.handle_sidebar_api("demo", "fs.tree", {"path": str(blocked)})
    assert envelope["ok"] is True
    assert envelope["controlPlane"] == "py-backend"
    assert envelope["value"]["errorCode"] == "PERMISSION_DENIED"
    assert "[Errno 13]" not in envelope["value"]["error"]


def test_fs_read_directory_uses_fs_directory_wire_code(tmp_path: Path):
    folder = tmp_path / ".archify"
    folder.mkdir()
    bridge = _bridge(tmp_path)
    envelope = bridge.handle_sidebar_api("demo", "fs.read", {"path": str(folder)})
    assert envelope["ok"] is False
    assert envelope["error"]["code"] == "fs-directory"
    assert "is a directory" in envelope["error"]["message"]


def test_list_dir_skips_unstatable_children(tmp_path: Path, monkeypatch):
    visible = tmp_path / "ok.txt"
    visible.write_text("x", encoding="utf-8")
    locked = tmp_path / "locked-dir"
    locked.mkdir()
    bridge = _bridge(tmp_path)

    original_is_dir = Path.is_dir
    original_is_symlink = Path.is_symlink

    def is_dir(self: Path) -> bool:
        if self.name == "locked-dir":
            raise PermissionError(13, "Permission denied", str(self))
        return original_is_dir(self)

    def is_symlink(self: Path) -> bool:
        if self.name == "locked-dir":
            raise PermissionError(13, "Permission denied", str(self))
        return original_is_symlink(self)

    monkeypatch.setattr(Path, "is_dir", is_dir)
    monkeypatch.setattr(Path, "is_symlink", is_symlink)
    level = bridge.handle_sidebar_api("demo", "fs.tree", {"path": str(tmp_path)})["value"]
    names = {entry["name"] for entry in level["entries"]}
    assert "ok.txt" in names
    assert "locked-dir" not in names
    assert "error" not in level


def test_fs_read_returns_dsh_text_content(tmp_path: Path):
    content = "项目文件"
    data = content.encode("utf-8")
    (tmp_path / "sample.txt").write_bytes(data)
    envelope = _bridge(tmp_path).handle_sidebar_api("demo", "fs.read", {"path": "sample.txt"})
    assert envelope["ok"] is True
    assert envelope["value"]["kind"] == "text"
    assert envelope["value"]["size"] == len(data)
    assert envelope["value"]["content"] == content


def test_fs_read_returns_dsh_binary_head(tmp_path: Path):
    data = bytes([0, 255]) * 3072
    (tmp_path / "sample.bin").write_bytes(data)
    envelope = _bridge(tmp_path).handle_sidebar_api("demo", "fs.read", {"path": "sample.bin"})
    assert envelope["ok"] is True
    assert envelope["value"]["kind"] == "binary"
    assert envelope["value"]["size"] == len(data)
    assert base64.b64decode(envelope["value"]["head"], validate=True) == data[:4096]


def test_fs_trees_uses_dsh_entry_flags_for_directory_and_file(tmp_path: Path):
    folder = tmp_path / "folder"
    folder.mkdir()
    note = folder / "note.txt"
    note.write_text("note", encoding="utf-8")
    envelope = _bridge(tmp_path).handle_sidebar_api(
        "demo", "fs.trees", {"paths": [".", str(folder)]}
    )
    assert envelope["ok"] is True
    root, child = envelope["value"]["levels"]
    assert root["entries"] == [
        {"name": "folder", "path": str(folder), "isDir": True, "isSymlink": False}
    ]
    assert child["entries"] == [
        {"name": "note.txt", "path": str(note), "isDir": False, "isSymlink": False}
    ]


def test_blank_workspace_settings_preserve_default_roots(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("EAP_DATA_ROOT", "")
    monkeypatch.setenv("EAP_WORKSPACE_ROOT", "")
    monkeypatch.chdir(tmp_path)
    settings = Settings(_env_file=None)
    assert settings.eap_data_root == Path(__file__).resolve().parents[1]
    assert settings.workspace_root == settings.eap_data_root.parent


def test_sidebar_git_reads_status_diff_and_history(tmp_path: Path):
    def git(*args: str) -> None:
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init")
    note = tmp_path / "note.txt"
    note.write_text("before", encoding="utf-8")
    git("add", "note.txt")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "initial")
    note.write_text("after", encoding="utf-8")
    bridge = _bridge(tmp_path)
    def read(method, body=None):
        envelope = bridge.handle_sidebar_api("demo", method, body)
        assert envelope["ok"] is True, envelope
        return envelope["value"]
    assert read("git.worktrees")[0]["current"] is True
    assert read("git.status")["entries"] == [{"path": "note.txt", "xy": " M"}]
    assert "+after" in read("git.diff", {"path": "note.txt"})["diff"]
    commit = read("git.graph")["entries"][0]
    assert commit["subject"] == "initial"
    assert "+before" in read("git.commit-diff", {"hash": commit["hashFull"]})["diff"]
    assert read("git.show", {"rev": "HEAD", "path": "note.txt"}) == {"content": "before"}
    assert read("git.show", {"rev": ":0", "path": "note.txt"}) == {"content": "before"}
    assert read("git.show", {"rev": "HEAD", "path": "missing.txt"}) == {"content": None}
    for method in ("fs.search", "git.rebase"):
        unsupported = bridge.handle_sidebar_api("demo", method, {"path": "note.txt"})
        assert unsupported["ok"] is False
        assert unsupported["error"]["code"] == "not-found"
    assert bridge.handle_sidebar_api("demo", "git.stage", {"path": "note.txt"})["error"]["code"] == "permission-denied"


def test_changes_ops_records_wire_events_and_scopes_by_session(client, monkeypatch):
    import json

    settings = client.app.state.settings
    monkeypatch.setattr(settings, "eap_local_workspace_write_enabled", True)
    bridge = _bridge(settings.workspace_root)
    bridge._write_enabled = True

    def changes(**body):
        return bridge.handle_sidebar_api("demo", "changes.ops", {"sessionId": "session-a", **body})

    assert changes()["value"] == {"events": [], "lastSeq": -1}
    response = client.post("/api/local-workspace/fs.createFile", json={
        "path": ".", "name": "round.txt", "sessionId": "session-a",
    })
    assert response.status_code == 200
    delta = changes()["value"]
    call, result = delta["events"]
    assert call["type"] == "tool/call" and call["data"]["name"] == "write"
    assert json.loads(call["data"]["arguments"])["path"] == response.json()["path"]
    assert result["type"] == "tool/result"
    assert result["data"]["message"]["source"]["callId"] == call["data"]["callId"]
    assert delta["lastSeq"] == result["seq"] == call["seq"] + 1
    assert changes(afterSeq=call["seq"])["value"]["events"] == [result]
    assert changes(afterSeq=result["seq"])["value"] == {"events": [], "lastSeq": result["seq"]}
    assert changes(sessionId="session-b")["value"] == {"events": [], "lastSeq": -1}
    assert changes(afterSeq=True)["error"]["code"] == "bad-request"


def test_global_workspace_capabilities_work_without_installing_sidebar(client):
    catalog = client.get("/api/local-workspace/plugins")
    assert catalog.status_code == 200
    assert {item["id"]: item["scope"] for item in catalog.json()["items"]} == {
        "workspace-files": "global", "workspace-git": "global",
    }
    tree = client.post("/api/local-workspace/fs.tree", json={"path": "."})
    assert tree.status_code == 200
    assert tree.json()["entries"] == []
    root = client.app.state.settings.workspace_root
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
    status = client.post("/api/local-workspace/git.status", json={})
    assert status.status_code == 200
    assert status.json()["isRepo"] is True
    assert client.post("/api/local-workspace/fs.read", json={"path": "../outside"}).status_code == 400
    assert client.post("/api/local-workspace/git.stage", json={}).status_code == 403


def test_global_workspace_writes_share_git_index_and_file_baseline(client, monkeypatch):
    settings = client.app.state.settings
    monkeypatch.setattr(settings, "eap_local_workspace_write_enabled", True)
    root = settings.workspace_root
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
    note = root / "note.txt"
    note.write_text("before", encoding="utf-8")
    bridge = _bridge(root)
    bridge._write_enabled = True

    assert all(item["access"] == "read-write"
               for item in client.get("/api/local-workspace/plugins").json()["items"])
    base = client.post("/api/local-workspace/fs.read", json={"path": "note.txt"}).json()["mtimeMs"]
    draft = {"path": "note.txt", "expectedMtimeMs": base, "content": "新的内容"}
    saved = client.post("/api/local-workspace/fs.write", json=draft)
    assert saved.status_code == 200
    assert saved.json()["mtimeMs"] > base
    assert note.read_text(encoding="utf-8") == "新的内容"
    draft["content"] = "stale"
    assert bridge.handle_sidebar_api("demo", "fs.write", draft)["error"]["code"] == "fs-conflict"
    assert client.post("/api/local-workspace/fs.write", json=draft).status_code == 409
    assert note.read_text(encoding="utf-8") == "新的内容"

    crossed = client.post("/sidebar/write", params={"path": "note.txt", "expectedMtimeMs": base},
                          content="overwrite", headers={"content-type": "text/plain",
                                                        "origin": "https://example.invalid"})
    assert crossed.status_code == 403
    assert bridge.handle_sidebar_api("demo", "git.stage", {"path": "note.txt"})["ok"] is True
    status = client.post("/api/local-workspace/git.status", json={}).json
    assert status()["entries"] == [{"path": "note.txt", "xy": "A "}]
    assert client.post("/api/local-workspace/git.unstage", json={"path": "note.txt"}).status_code == 200
    assert client.post("/api/local-workspace/git.status", json={}).json()["entries"] == [
        {"path": "note.txt", "xy": "??"},
    ]



def test_file_tree_mutations_share_web_and_sidebar_state(client, monkeypatch):
    settings = client.app.state.settings
    root = settings.workspace_root
    bridge = _bridge(root)

    def web(method, **body):
        return client.post(f"/api/local-workspace/{method}", json=body)

    def sidebar(method, **body):
        return bridge.handle_sidebar_api("demo", method, body)

    assert web("fs.mkdir", path=".", name="folder").status_code == 403
    assert sidebar("fs.createFile", path=".", name="note.txt")["error"]["code"] == "permission-denied"
    monkeypatch.setattr(settings, "eap_local_workspace_write_enabled", True)
    bridge._write_enabled = True

    created = sidebar("fs.mkdir", path=".", name="folder")
    assert created["value"] == {"path": str(root / "folder")}
    assert web("fs.createFile", path=".", cwd="folder", name="note.txt").status_code == 200
    old = root / "folder" / "note.txt"
    assert old.read_bytes() == b""
    old.write_text("keep", encoding="utf-8")
    assert web("fs.createFile", path="folder", name="note.txt").status_code == 409
    renamed = sidebar("fs.rename", path="note.txt", cwd="folder", name="renamed.txt")
    assert renamed["value"] == {"path": str(old.with_name("renamed.txt"))}
    assert not old.exists()
    assert old.with_name("renamed.txt").read_text(encoding="utf-8") == "keep"
    old.write_text("keep both", encoding="utf-8")
    assert web("fs.rename", path="folder/note.txt", name="renamed.txt").status_code == 409
    assert old.read_text(encoding="utf-8") == "keep both"
    assert old.with_name("renamed.txt").read_text(encoding="utf-8") == "keep"
    assert web("fs.mkdir", path=".", name=".git").status_code == 403
    assert web("fs.rename", path=".", name="new-workspace").status_code == 400
    assert web("fs.createFile", path="..", name="outside.txt").status_code == 400
    assert web("fs.createFile", path=".", name="NUL.txt").status_code == 400



def test_sidebar_git_commit_and_linked_worktree_scope(client, monkeypatch, tmp_path):
    settings = client.app.state.settings
    workspace = settings.workspace_root
    repo = workspace / "main-checkout"
    repo.mkdir()

    def git(*args: str, cwd=repo) -> str:
        return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout

    git("init", "-b", "main")
    git("config", "user.name", "Workspace Test")
    git("config", "user.email", "workspace@example.invalid")
    git("config", "commit.gpgsign", "false")
    git("commit", "--allow-empty", "-m", "initial")
    linked = workspace / "linked-checkout"
    git("worktree", "add", "-b", "feature", str(linked))
    outside = tmp_path / "outside"
    git("worktree", "add", "-b", "outside", str(outside))
    bridge = _bridge(workspace)

    def sidebar(method, **body):
        return bridge.handle_sidebar_api("demo", method, {"cwd": str(repo), **body})

    def web(method, **body):
        return client.post(f"/api/local-workspace/{method}", json={"cwd": str(repo), **body})

    assert sidebar("git.commit", message="denied")["error"]["code"] == "permission-denied"
    assert web("git.checkout", branch="feature").status_code == 403
    assert [item["path"] for item in sidebar("git.worktrees")["value"]] == [str(repo), str(linked)]
    assert sidebar("git.status", worktree=str(outside))["error"]["code"] == "permission-denied"
    assert sidebar("git.branch", worktree=str(linked))["value"]["current"] == "feature"

    monkeypatch.setattr(settings, "eap_local_workspace_write_enabled", True)
    bridge._write_enabled = True
    (linked / "file.txt").write_text("change", encoding="utf-8")
    assert sidebar("git.stage", worktree=str(linked))["value"] == {"ok": True}
    assert web("git.commit", worktree=str(linked), message="feature change").json() == {"ok": True}
    assert git("log", "-1", "--format=%s", cwd=linked).strip() == "feature change"
    assert git("log", "-1", "--format=%s").strip() == "initial"
    assert web("git.checkout", branch="-f").status_code == 400
    git("branch", "another")
    assert sidebar("git.checkout", branch="another")["value"] == {"ok": True}
    assert web("git.branch").json()["current"] == "another"



def test_git_sync_requires_remote_grant_and_pulls_fast_forward_only(client, monkeypatch, tmp_path):
    settings = client.app.state.settings
    repo = settings.workspace_root
    upstream = tmp_path / "origin.git"
    peer = tmp_path / "peer"

    def git(*args, cwd=repo):
        return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()

    def commit(message, cwd=repo):
        return git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                   "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", message, cwd=cwd)

    def web(method):
        return client.post(f"/api/local-workspace/{method}", json={})

    git("init", "--bare", "-b", "main", str(upstream))
    git("init", "-b", "main")
    commit("initial")
    git("remote", "add", "origin", str(upstream))
    git("push", "-u", "origin", "main")
    git("clone", str(upstream), str(peer))
    commit("local change")
    original_remote = git("rev-parse", "HEAD", cwd=upstream)
    monkeypatch.setattr(settings, "eap_local_workspace_write_enabled", True)
    bridge = _bridge(repo)
    bridge._write_enabled = True
    assert web("git.push").status_code == 403
    assert bridge.handle_sidebar_api("demo", "git.pull")["error"]["code"] == "permission-denied"
    assert git("rev-parse", "HEAD", cwd=upstream) == original_remote
    git_plugin = client.get("/api/local-workspace/plugins").json()["items"][1]
    assert "git.push" not in git_plugin["methods"]

    monkeypatch.setattr(settings, "eap_local_workspace_remote_git_enabled", True)
    bridge._remote_git_enabled = True
    pushed = bridge.handle_sidebar_api("demo", "git.push")
    assert pushed["value"] == {"ok": True}, pushed
    assert git("rev-parse", "HEAD", cwd=upstream) == git("rev-parse", "HEAD")
    git("pull", "--ff-only", cwd=peer)
    commit("remote change", cwd=peer)
    git("push", cwd=peer)
    pulled = web("git.pull")
    assert pulled.json() == {"ok": True}, pulled.text
    assert git("rev-parse", "HEAD") == git("rev-parse", "HEAD", cwd=peer)

    commit("diverged local")
    local_head = git("rev-parse", "HEAD")
    commit("diverged remote", cwd=peer)
    git("push", cwd=peer)
    assert web("git.pull").status_code == 400
    assert git("rev-parse", "HEAD") == local_head
    assert web("git.push").status_code == 400
    assert git("rev-parse", "HEAD", cwd=upstream) == git("rev-parse", "HEAD", cwd=peer)
