from __future__ import annotations

from typing import Any, Literal

NotifyKind = Literal["probe", "session", "system"]
NotifySeverity = Literal["info", "warning", "error"]
NotifySurface = Literal["badge", "toast", "banner", "dialog"]

NOTIFY_KINDS = frozenset({"probe", "session", "system"})
NOTIFY_SEVERITIES = frozenset({"info", "warning", "error"})
NOTIFY_SURFACES = frozenset({"badge", "toast", "banner", "dialog"})


class NotifyContractError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def surfaces_for(kind: str, severity: str) -> list[str]:
    if kind == "probe":
        return []
    if kind == "session":
        return ["badge", "toast"]
    if severity == "error":
        return ["banner", "dialog"]
    if severity == "warning":
        return ["banner"]
    return ["toast"]


def validate_notify_fields(
    *,
    kind: object,
    severity: object,
    code: object,
    title: object,
    text: object,
    surfaces: object | None = None,
    target: object | None = None,
) -> dict[str, Any]:
    if kind not in NOTIFY_KINDS:
        raise NotifyContractError("NOTIFY_KIND_INVALID")
    if severity not in NOTIFY_SEVERITIES:
        raise NotifyContractError("NOTIFY_SEVERITY_INVALID")
    if not isinstance(code, str) or not code:
        raise NotifyContractError("NOTIFY_EVENT_INVALID")
    if not isinstance(title, str) or not isinstance(text, str):
        raise NotifyContractError("NOTIFY_EVENT_INVALID")
    if surfaces is None:
        resolved_surfaces = surfaces_for(str(kind), str(severity))
    else:
        if not isinstance(surfaces, list) or any(item not in NOTIFY_SURFACES for item in surfaces):
            raise NotifyContractError("NOTIFY_SURFACE_INVALID")
        resolved_surfaces = list(surfaces)
    resolved_target: dict[str, str] | None = None
    if target is not None:
        if not isinstance(target, dict):
            raise NotifyContractError("NOTIFY_EVENT_INVALID")
        conversation_id = target.get("conversationId")
        if conversation_id is not None and not isinstance(conversation_id, str):
            raise NotifyContractError("NOTIFY_EVENT_INVALID")
        if isinstance(conversation_id, str) and conversation_id:
            resolved_target = {"conversationId": conversation_id}
    return {
        "kind": kind,
        "severity": severity,
        "code": code,
        "title": title,
        "text": text,
        "surfaces": resolved_surfaces,
        "target": resolved_target,
    }
