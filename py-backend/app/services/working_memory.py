"""Task working memory: goals and references, never document bodies."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from app.domain.errors import ChatErrorCode

EMPTY_UPDATED_AT = "1970-01-01T00:00:00Z"
LAYERS = ["display_history", "model_window", "task_working", "binding"]
_ALLOWED = {"goal", "constraints", "facts", "evidenceRefs", "dependencyKeys", "expectedUpdatedAt"}
_FACT_KEYS = {"kind", "id", "revisionOrDigest"}


def empty_snapshot() -> dict[str, Any]:
    return {
        "goal": "",
        "constraints": [],
        "facts": [],
        "evidenceRefs": [],
        "dependencyKeys": [],
        "invalidation": "",
        "updatedAt": EMPTY_UPDATED_AT,
        "layers": list(LAYERS),
    }


def snapshot_from_json(raw: str) -> dict[str, Any]:
    if not raw:
        return empty_snapshot()
    loaded = json.loads(raw)
    if not isinstance(loaded, dict):
        return empty_snapshot()
    snapshot = empty_snapshot()
    snapshot.update(loaded)
    snapshot["layers"] = list(LAYERS)
    return snapshot


def apply_edit(current: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(body, dict) or set(body) - _ALLOWED:
        raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
    expected = body.get("expectedUpdatedAt")
    if not isinstance(expected, str) or _parse_instant(expected) is None:
        raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
    if _parse_instant(expected) != _parse_instant(str(current.get("updatedAt") or EMPTY_UPDATED_AT)):
        raise ValueError(ChatErrorCode.WORKING_MEMORY_CHANGED)

    goal = body["goal"] if "goal" in body else ""
    if not isinstance(goal, str) or len(goal) > 500:
        raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
    constraints = _strings(body.get("constraints"), limit=16, item_limit=200, drop_blank=True)
    facts = _facts(body.get("facts"))
    evidence = _strings(body.get("evidenceRefs"), limit=32, item_limit=200, drop_blank=True)
    dependencies = _strings(body.get("dependencyKeys"), limit=32, item_limit=200, drop_blank=False)
    seen: list[str] = []
    for key in dependencies:
        if key not in seen:
            seen.append(key)

    updated = datetime.now(timezone.utc)
    previous = _parse_instant(str(current.get("updatedAt") or EMPTY_UPDATED_AT))
    if previous is not None and updated <= previous:
        updated = previous + timedelta(microseconds=1)
    return {
        "goal": goal,
        "constraints": constraints,
        "facts": facts,
        "evidenceRefs": evidence,
        "dependencyKeys": seen,
        "invalidation": "",
        "updatedAt": updated.strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        "layers": list(LAYERS),
    }


def _strings(raw: Any, *, limit: int, item_limit: int, drop_blank: bool) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > limit:
        raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
    values: list[str] = []
    for item in raw:
        if not isinstance(item, str) or len(item) > item_limit:
            raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
        if drop_blank and not item.strip():
            continue
        values.append(item)
    return values


def _facts(raw: Any) -> list[dict[str, str]]:
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > 32:
        raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
    facts: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict) or set(item) != _FACT_KEYS:
            raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
        kind, fact_id, revision = item["kind"], item["id"], item["revisionOrDigest"]
        if (
            not isinstance(kind, str)
            or not isinstance(fact_id, str)
            or not isinstance(revision, str)
            or len(kind) > 40
            or len(fact_id) > 120
            or len(revision) > 128
        ):
            raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
        facts.append({"kind": kind, "id": fact_id, "revisionOrDigest": revision})
    return facts


def _parse_instant(value: str) -> datetime | None:
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)
