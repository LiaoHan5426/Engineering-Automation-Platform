from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.config import Settings
from app.domain.errors import ConnectionErrorCode


@dataclass
class ConnectionRecord:
    id: str
    name: str
    kind: str = "openai-compatible"
    wire_api: str = "chat-completions"
    enabled: bool = True
    base_url: str = ""
    default_model: str = ""
    models: list[dict[str, Any]] = field(default_factory=list)
    allowed_models: list[str] = field(default_factory=list)
    discovered_at: str = ""
    discovery_error: str = ""
    secret: str = ""
    revision: int = 1
    default_selected: bool = False
    configuration_revision: str = "1"

    @property
    def secret_present(self) -> bool:
        return bool(self.secret)


class ConnectionStore:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._path = settings.connections_path

    def _load(self) -> list[ConnectionRecord]:
        if not self._path.exists():
            return []
        raw = json.loads(self._path.read_text(encoding="utf-8"))
        items: list[ConnectionRecord] = []
        for row in raw.get("items", []):
            items.append(
                ConnectionRecord(
                    id=row["id"],
                    name=row.get("name", ""),
                    kind=row.get("kind", "openai-compatible"),
                    wire_api=row.get("wireApi", "chat-completions"),
                    enabled=bool(row.get("enabled", True)),
                    base_url=row.get("baseUrl", ""),
                    default_model=row.get("defaultModel", ""),
                    models=list(row.get("models") or []),
                    allowed_models=list(row.get("allowedModels") or []),
                    discovered_at=row.get("discoveredAt", ""),
                    discovery_error=row.get("discoveryError", ""),
                    secret=row.get("secret", ""),
                    revision=int(row.get("revision", 1)),
                    default_selected=bool(row.get("defaultSelected", False)),
                    configuration_revision=str(row.get("configurationRevision", "1")),
                )
            )
        return items

    def _save(self, items: list[ConnectionRecord]) -> None:
        self._settings.ensure_layout()
        payload = {
            "items": [
                {
                    "id": item.id,
                    "name": item.name,
                    "kind": item.kind,
                    "wireApi": item.wire_api,
                    "enabled": item.enabled,
                    "baseUrl": item.base_url,
                    "defaultModel": item.default_model,
                    "models": item.models,
                    "allowedModels": item.allowed_models,
                    "discoveredAt": item.discovered_at,
                    "discoveryError": item.discovery_error,
                    "secret": item.secret,
                    "revision": item.revision,
                    "defaultSelected": item.default_selected,
                    "configurationRevision": item.configuration_revision,
                }
                for item in items
            ]
        }
        self._path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    def list_public(self) -> dict[str, Any]:
        items = self._load()
        effective = next((i.id for i in items if i.default_selected and i.enabled), None)
        if effective is None:
            effective = next((i.id for i in items if i.enabled), None)
        return {
            "items": [self.to_public(item) for item in items],
            "effectiveDefaultId": effective,
        }

    def get(self, connection_id: str) -> ConnectionRecord | None:
        return next((i for i in self._load() if i.id == connection_id), None)

    def effective(self) -> ConnectionRecord | None:
        items = [i for i in self._load() if i.enabled]
        if not items:
            return self._env_fallback()
        selected = next((i for i in items if i.default_selected), None)
        return selected or items[0]

    def _env_fallback(self) -> ConnectionRecord | None:
        key = self._settings.eap_model_api_key.strip()
        if not key:
            return None
        model = self._settings.eap_model_default
        return ConnectionRecord(
            id="env-default",
            name="Environment default",
            base_url=self._settings.eap_model_base_url.rstrip("/"),
            default_model=model,
            models=[{"id": model, "reasoningEfforts": ["low", "medium", "high"]}],
            allowed_models=[model],
            secret=key,
            default_selected=True,
            configuration_revision="env",
        )

    def create(self, body: dict[str, Any]) -> dict[str, Any]:
        name = str(body.get("name") or "").strip()
        base_url = str(body.get("baseUrl") or "").strip().rstrip("/")
        if not name or not base_url:
            raise ValueError(ConnectionErrorCode.INVALID_CONNECTION)
        secret = str(body.get("secret") or "")
        model = str(body.get("defaultModel") or self._settings.eap_model_default)
        items = self._load()
        default_selected = bool(body.get("defaultSelected", False))
        if default_selected:
            for item in items:
                item.default_selected = False
        record = ConnectionRecord(
            id=f"conn-{uuid.uuid4().hex[:10]}",
            name=name,
            base_url=base_url,
            default_model=model,
            models=[{"id": model, "reasoningEfforts": ["low", "medium", "high"]}],
            allowed_models=[model],
            secret=secret,
            enabled=bool(body.get("enabled", True)),
            default_selected=default_selected or not items,
            wire_api=str(body.get("wireApi") or "chat-completions"),
        )
        items.append(record)
        self._save(items)
        return self.to_public(record)

    def update(self, connection_id: str, body: dict[str, Any]) -> dict[str, Any]:
        items = self._load()
        record = next((i for i in items if i.id == connection_id), None)
        if record is None:
            raise LookupError(ConnectionErrorCode.UNKNOWN_CONNECTION)
        if "name" in body:
            record.name = str(body["name"]).strip() or record.name
        if "baseUrl" in body:
            record.base_url = str(body["baseUrl"]).strip().rstrip("/") or record.base_url
        if "secret" in body and body["secret"] is not None and str(body["secret"]) != "":
            record.secret = str(body["secret"])
        if "enabled" in body:
            record.enabled = bool(body["enabled"])
        if "defaultSelected" in body and body["defaultSelected"]:
            for item in items:
                item.default_selected = item.id == connection_id
            record.default_selected = True
        if "defaultModel" in body and body["defaultModel"]:
            model = str(body["defaultModel"])
            record.default_model = model
            if model not in record.allowed_models:
                record.allowed_models.append(model)
            if not any(m.get("id") == model for m in record.models):
                record.models.append({"id": model, "reasoningEfforts": ["low", "medium", "high"]})
        record.revision += 1
        self._save(items)
        return self.to_public(record)

    @staticmethod
    def to_public(item: ConnectionRecord) -> dict[str, Any]:
        return {
            "id": item.id,
            "name": item.name,
            "kind": item.kind,
            "wireApi": item.wire_api,
            "enabled": item.enabled,
            "baseUrl": item.base_url,
            "defaultModel": item.default_model,
            "models": item.models,
            "allowedModels": item.allowed_models,
            "discoveredAt": item.discovered_at,
            "discoveryError": item.discovery_error,
            "secretPresent": item.secret_present,
            "revision": item.revision,
            "defaultSelected": item.default_selected,
            "configurationRevision": item.configuration_revision,
        }
