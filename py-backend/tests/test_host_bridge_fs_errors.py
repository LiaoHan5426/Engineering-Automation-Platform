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
    assert read("changes.ops") == {"events": [], "lastSeq": 0}
    assert bridge.handle_sidebar_api("demo", "git.stage", {"path": "note.txt"})["error"]["code"] == "permission-denied"


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
