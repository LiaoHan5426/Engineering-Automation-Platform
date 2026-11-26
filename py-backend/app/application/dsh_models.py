"""Project EAP connections through the native DSH model settings contract."""

import hashlib
import json
import re
from urllib.parse import urlsplit

from app.persistence.connections import ConnectionRecord, ConnectionStore

NAMESPACE = "llm-pi-ai"
PROTOCOLS = {"openai-completions": "chat-completions", "openai-responses": "responses"}
ROUTE = re.compile(r"[a-z][a-z0-9-]{0,63}")

MODEL_SCHEMA = {
    "uid": 11,
    "refs": {
        "1": {"type": "string", "meta": {}},
        "2": {"type": "const", "meta": {}, "value": "openai-completions"},
        "3": {"type": "const", "meta": {}, "value": "openai-responses"},
        "4": {"type": "union", "meta": {}, "list": [2, 3]},
        "5": {"type": "object", "meta": {}, "dict": {"id": 1, "name": 1}},
        "6": {"type": "array", "meta": {}, "inner": 5},
        "7": {"type": "object", "meta": {}, "dict": {
            "displayName": 1, "baseURL": 1, "apiKeyEnv": 1, "api": 4, "models": 6,
        }},
        "8": {"type": "dict", "meta": {"default": {}}, "inner": 7, "sKey": 1},
        "11": {"type": "object", "meta": {"default": {}}, "dict": {"providers": 8}},
    },
}


def key_ref(route: str) -> str:
    return route.upper().replace("-", "_") + "_API_KEY"


def _providers(items):
    return {
        item["id"]: {
            "displayName": item["name"], "baseURL": item["baseUrl"],
            "apiKeyEnv": key_ref(item["id"]),
            "api": next((name for name, api in PROTOCOLS.items() if api == item["wireApi"]), "openai-completions"),
            "models": [{key: model[key] for key in ("id", "name") if key in model} for model in item["models"]],
        }
        for item in items if item["kind"] == "openai-compatible"
    }


def _revision(providers) -> int:
    digest = hashlib.sha256(json.dumps(providers, sort_keys=True).encode()).digest()
    return int.from_bytes(digest[:6], "big")


def namespace_view(store: ConnectionStore) -> dict:
    providers = _providers(store.list_public()["items"])
    doc = {"providers": providers}
    return {
        "ns": NAMESPACE, "autoGenerate": False, "schema": MODEL_SCHEMA,
        "value": doc, "base": {}, "user": doc, "applies": "live",
        "secrets": [], "revision": _revision(providers),
    }


def directory(store: ConnectionStore) -> list[dict]:
    return [{
        "provider": route, "displayName": profile["displayName"],
        "settingsNs": NAMESPACE, "settingsPath": ["providers", route], "declared": True,
    } for route, profile in namespace_view(store)["value"]["providers"].items()]


def credentials(store: ConnectionStore, refs: list[str]) -> dict:
    known = {
        key_ref(item["id"]): item["secretPresent"]
        for item in store.list_public()["items"] if item["kind"] == "openai-compatible"
    }
    return {
        ref: {
            "configured": known.get(ref, False),
            "writable": ref in known,
            **({"source": "file", "masked": "••••••••"} if known.get(ref) else {}),
        }
        for ref in refs
    }


def set_credential(store: ConnectionStore, ref: str, secret: str) -> None:
    def edit(items):
        record = next((item for item in items if key_ref(item.id) == ref and item.kind == "openai-compatible"), None)
        if record is None:
            raise LookupError(ref)
        record.secret = secret
    store.edit_records(edit)


def mutate(store: ConnectionStore, ops: list[dict], expected_revision: int | None) -> dict:
    def edit(items: list[ConnectionRecord]) -> None:
        original = _providers(map(store.to_public, items))
        if expected_revision is not None and expected_revision != _revision(original):
            raise RuntimeError("settings/conflict")
        profiles = json.loads(json.dumps(original))
        touched = set()
        for op in ops:
            path = op.get("path")
            if not isinstance(path, list) or len(path) not in (2, 3) or path[0] != "providers":
                raise ValueError("Invalid provider settings path.")
            route = path[1]
            if not isinstance(route, str) or not ROUTE.fullmatch(route) or route in ("env-default", "deepseek-account"):
                raise ValueError("Invalid provider ID.")
            touched.add(route)
            if len(path) == 2:
                if op.get("op") == "unset":
                    profiles.pop(route, None)
                elif op.get("op") == "set" and isinstance(op.get("value"), dict):
                    profiles[route] = op["value"]
                else:
                    raise ValueError("Invalid provider settings operation.")
                continue
            field = path[2]
            if route not in profiles or field not in ("displayName", "baseURL", "api", "apiKeyEnv", "models"):
                raise ValueError("Unsupported provider settings field.")
            if op.get("op") == "unset":
                profiles[route].pop(field, None)
            elif op.get("op") == "set":
                profiles[route][field] = op.get("value")
            else:
                raise ValueError("Invalid provider settings operation.")
        for route in touched:
            record = next((item for item in items if item.id == route), None)
            if record is not None and record.kind != "openai-compatible":
                raise ValueError("Unsupported provider type.")
            if route not in profiles:
                if record is not None:
                    items.remove(record)
                continue
            profile = profiles[route]
            endpoint = profile.get("baseURL")
            parsed = urlsplit(endpoint if isinstance(endpoint, str) else "")
            protocol = profile.get("api", "openai-completions")
            models = profile.get("models")
            if (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment
                    or not isinstance(protocol, str) or protocol not in PROTOCOLS or not isinstance(models, list)
                    or not models or any(not isinstance(model, dict) or not isinstance(model.get("id"), str)
                                         or not model["id"].strip() for model in models)
                    or profile.get("apiKeyEnv", key_ref(route)) != key_ref(route)):
                raise ValueError("A valid API endpoint, protocol, and model list are required.")
            if record is None:
                record = ConnectionRecord(id=route, name=route, default_selected=not items)
                items.append(record)
            record.name = str(profile.get("displayName") or route)
            record.base_url = endpoint.rstrip("/")
            record.wire_api = PROTOCOLS[protocol]
            record.models = [{key: model[key] for key in ("id", "name") if key in model} for model in models]
            record.allowed_models = list(dict.fromkeys(model["id"] for model in models))
            if record.default_model not in record.allowed_models:
                record.default_model = record.allowed_models[0]
            record.revision += 1
    store.edit_records(edit)
    return namespace_view(store)


async def discover(store: ConnectionStore, draft: dict, load_catalog) -> list[dict]:
    provider = draft.get("provider")
    record = store.get(provider) if isinstance(provider, str) else None
    if record is not None and record.kind != "openai-compatible":
        raise ValueError("Unsupported model provider.")
    endpoint = draft.get("baseURL")
    if endpoint is None and record is not None:
        return [{"id": model["id"]} for model in record.models]
    parsed = urlsplit(endpoint if isinstance(endpoint, str) else "")
    if (parsed.scheme not in ("http", "https") or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError("A valid API endpoint is required.")
    protocol = draft.get("api")
    if protocol is not None and (not isinstance(protocol, str) or protocol not in PROTOCOLS):
        raise ValueError("Unsupported API protocol.")
    secret = draft.get("apiKey")
    if secret is None and record is not None and record.base_url.rstrip("/") == endpoint.rstrip("/"):
        secret = record.secret
    if not isinstance(secret, str) or not secret or len(secret) > 16384 or "\r" in secret or "\n" in secret:
        raise ValueError("Enter the API key for this endpoint.")
    return await load_catalog(endpoint, secret)
