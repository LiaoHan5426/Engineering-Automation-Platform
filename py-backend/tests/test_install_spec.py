import json
from pathlib import Path

import pytest

from app.plugins.install_spec import InvalidInstallSpecError, parse_install_spec
from app.plugins.installer import _git_target


def test_registry_name_and_range():
    plain = parse_install_spec(" dsh-better-sidebar ")
    assert plain.kind == "registry"
    assert plain.name == "dsh-better-sidebar"
    ranged = parse_install_spec("@acme/dsh-tool@^1.2")
    assert ranged.kind == "registry"
    assert ranged.name == "@acme/dsh-tool"
    assert ranged.range == "^1.2"


def test_git_addresses():
    hosts = {
        "github:someone/dsh-plugin": "github.com",
        "gitlab:a/b#main": "gitlab.com",
        "git+https://Git.Example.com:8443/a/b.git": "git.example.com:8443",
        "https://github.com/a/b.git#v1": "github.com",
        "git@github.com:a/b.git": "github.com",
    }
    for spec, host in hosts.items():
        parsed = parse_install_spec(spec)
        assert parsed.kind == "git"
        assert parsed.host == host


def test_absolute_path_and_refusals(tmp_path: Path):
    parsed = parse_install_spec(str(tmp_path))
    assert parsed.kind == "path"
    assert Path(parsed.path) == tmp_path
    with pytest.raises(InvalidInstallSpecError) as empty:
        parse_install_spec("   ")
    assert empty.value.reason == "the package spec must not be empty"
    with pytest.raises(InvalidInstallSpecError) as relative:
        parse_install_spec("./dsh-x")
    assert relative.value.reason == "a local path must be absolute"
    with pytest.raises(InvalidInstallSpecError) as url:
        parse_install_spec("https://example.com/not-a-package")
    assert url.value.reason == "a URL must point at a git repository or a tarball"
    with pytest.raises(InvalidInstallSpecError):
        parse_install_spec("pkg@")


def test_install_accepts_absolute_path_spec(client, tmp_path: Path):
    package = tmp_path / "pkg"
    client_dir = package / "lib"
    client_dir.mkdir(parents=True)
    (client_dir / "client.js").write_text("exports.apply = function () {};\n", encoding="utf-8")
    (package / "package.json").write_text(
        json.dumps(
            {
                "name": "eap-spec-plugin",
                "version": "0.0.1",
                "dsh": {"client": {"platform": "web"}},
                "exports": {"./client": "./lib/client.js"},
            }
        ),
        encoding="utf-8",
    )
    response = client.post("/api/plugins/install", json={"spec": str(package)})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "eap-spec-plugin"
    refused = client.post("/api/plugins/install", json={"spec": "not a package"})
    assert refused.status_code == 400
    assert refused.json()["code"] == "INVALID_INSTALL_SPEC"
    listed = client.get("/api/plugins").json()
    row = next(item for item in listed["items"] if item["name"] == "eap-spec-plugin")
    assert row["installSpec"] == str(package)
    enabled = client.post("/api/plugins/eap-spec-plugin/enable")
    assert enabled.status_code == 200
    updated = client.post("/api/plugins/eap-spec-plugin/update")
    assert updated.status_code == 200, updated.text
    assert updated.json()["enabled"] is True
    assert updated.json()["version"] == "0.0.1"
    removed = client.post("/api/plugins/eap-spec-plugin/uninstall")
    assert removed.status_code == 200
    assert removed.json()["removed"] is True
    listed_after = client.get("/api/plugins").json()
    assert all(item["name"] != "eap-spec-plugin" for item in listed_after["items"])
    missing = client.post("/api/plugins/eap-spec-plugin/update")
    assert missing.status_code == 404


def test_git_target_keeps_ref_and_path():
    url, ref, subpath = _git_target(
        "git+https://github.com/o/plugins.git#bbbbbbb&path:/packages/sidebar"
    )
    assert url == "https://github.com/o/plugins.git"
    assert ref == "bbbbbbb"
    assert subpath == "packages/sidebar"
    shorthand, branch, nested = _git_target("github:acme/tool#main&path:/pkg")
    assert shorthand == "https://github.com/acme/tool.git"
    assert branch == "main"
    assert nested == "pkg"
