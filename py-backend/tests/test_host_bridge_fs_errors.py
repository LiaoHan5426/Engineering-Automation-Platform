from __future__ import annotations

from pathlib import Path

from app.plugins.host_bridge import HostBridgeState, PluginHostBridge


def _bridge(workspace: Path) -> PluginHostBridge:
    bridge = object.__new__(PluginHostBridge)
    bridge._registry = None  # type: ignore[attr-defined]
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
    level = bridge._list_dir(bridge._active["demo"], str(blocked))
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
    level = bridge._list_dir(bridge._active["demo"], str(tmp_path))
    names = {entry["name"] for entry in level["entries"]}
    assert "ok.txt" in names
    assert "locked-dir" not in names
    assert "error" not in level
