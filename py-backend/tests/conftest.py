from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture()
def data_root(tmp_path: Path) -> Path:
    root = tmp_path / "data"
    root.mkdir()
    return root


@pytest.fixture()
def client(data_root: Path, tmp_path: Path) -> TestClient:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    settings = Settings(
        eap_data_root=data_root,
        eap_workspace_root=workspace,
        eap_model_api_key="",
    )
    app = create_app(settings, offline_reply="offline-mvp-reply")
    with TestClient(app) as test_client:
        yield test_client
