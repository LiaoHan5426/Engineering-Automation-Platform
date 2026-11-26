from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_data_root() -> Path:
    # Default under py-backend/ (not repo root) so .eap is module-local and writable.
    return Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    eap_data_root: Path = _default_data_root()
    eap_local_workspace_write_enabled: bool = False
    eap_local_workspace_remote_git_enabled: bool = False
    eap_workspace_root: Path | None = None
    eap_dsh_web_dist: Path | None = None
    eap_model_base_url: str = "https://api.deepseek.com/v1"
    eap_model_api_key: str = ""
    eap_model_default: str = "deepseek-chat"
    eap_host: str = "127.0.0.1"
    eap_port: int = 8080
    # Local MVP defaults to hot reload; set EAP_RELOAD=false to disable.
    eap_reload: bool = True

    @property
    def eap_home(self) -> Path:
        return Path(self.eap_data_root).resolve() / ".eap"

    @property
    def db_path(self) -> Path:
        return self.eap_home / "db" / "eap.sqlite"

    @property
    def config_dir(self) -> Path:
        return self.eap_home / "config"

    @property
    def connections_path(self) -> Path:
        return self.config_dir / "model-connections.json"

    @property
    def workspace_root(self) -> Path:
        if self.eap_workspace_root:
            return Path(self.eap_workspace_root).resolve()
        # Default argv tools to the repository root (parent of py-backend).
        py_backend = Path(__file__).resolve().parents[1]
        if Path(self.eap_data_root).resolve() == py_backend:
            return py_backend.parent
        return Path(self.eap_data_root).resolve()

    @property
    def plugins_root(self) -> Path:
        return self.eap_home / "plugins"

    def ensure_layout(self) -> None:
        (self.eap_home / "db").mkdir(parents=True, exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        (self.eap_home / "logs").mkdir(parents=True, exist_ok=True)
        (self.eap_home / "tasks").mkdir(parents=True, exist_ok=True)
        self.plugins_root.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    return Settings()
