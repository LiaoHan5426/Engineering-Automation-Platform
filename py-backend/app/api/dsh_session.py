"""HTTP session commands for the DSH browser, backed by the EAP conversation store."""

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, ConfigDict, Field

from app.domain.execution_journal import DuplicatePromptError

WORKSPACE_ID = "ws-local"

router = APIRouter(tags=["dsh-session"])


class SessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workspaceId: str | None = None
    cwd: str | None = None
    sessionId: str | None = None
    agentPreset: str | None = None


class SessionCreateArgs(BaseModel):
    request: SessionCreateRequest


class SessionCreatePayload(BaseModel):
    args: SessionCreateArgs


class SessionCreateFrame(BaseModel):
    type: Literal["client-request"]
    rpcId: str = Field(min_length=1, max_length=128)
    method: Literal["session/create"]
    payload: SessionCreatePayload


@router.post("/session/create")
def create_session(frame: SessionCreateFrame, request: Request):
    command = frame.payload.args.request
    response = {"type": "server-response", "rpcId": frame.rpcId}

    def reject(code: str, message: str):
        return {
            **response,
            "result": {"ok": False, "error": {"code": code, "message": message, "details": {}}},
        }

    if command.workspaceId is not None and command.cwd is not None:
        return reject("gateway/bad-request", "Choose workspaceId or cwd.")
    if command.workspaceId is not None and command.workspaceId != WORKSPACE_ID:
        return reject("workspace/not-found", "The requested workspace has no registered EAP identity.")
    if command.agentPreset is not None:
        return reject("gateway/bad-request", "Explicit agent presets are unavailable.")
    if command.cwd is not None:
        try:
            directory = Path(command.cwd)
            in_workspace = directory.is_absolute() and directory.resolve() == request.app.state.settings.workspace_root
        except (OSError, RuntimeError, ValueError):
            in_workspace = False
        if not in_workspace:
            return reject("gateway/bad-request", "The session directory must be the configured workspace root.")

    chat = request.app.state.chat_service
    session_id = command.sessionId
    if session_id is not None:
        history = chat.session_history(session_id)
        if history is None or history[1] or chat.has_active_turn(session_id):
            session_id = None
    if session_id is None:
        session_id = chat.open_conversation()["conversationId"]
    return {
        **response,
        "result": {"ok": True, "value": {"sessionId": session_id}},
    }


class ModelCatalogFrame(BaseModel):
    type: Literal["client-request"]
    rpcId: str = Field(min_length=1, max_length=128)
    method: Literal["session/modelCatalog"]


@router.post("/session/modelCatalog")
def model_catalog(frame: ModelCatalogFrame, request: Request):
    connections = request.app.state.connections
    effective = connections.effective()
    entries = {item["id"]: item for item in connections.list_public()["items"]}
    if effective is not None:
        entries.setdefault(effective.id, connections.to_public(effective))
    groups = []
    for item in entries.values():
        if not item["enabled"] or not item["secretPresent"]:
            continue
        allowed = item["allowedModels"]
        models = [
            {"id": model["id"], "name": model.get("name") or model["id"]}
            for model in item["models"]
            if not allowed or model["id"] in allowed
        ]
        if not models:
            models = [{"id": name, "name": name} for name in allowed or [item["defaultModel"]] if name]
        if models:
            groups.append({"id": item["id"], "name": item["name"], "models": models})
    settings = request.app.state.settings
    return {
        "type": "server-response",
        "rpcId": frame.rpcId,
        "result": {"ok": True, "value": {
            "default": {
                "provider": effective.id if effective else "",
                "model": effective.default_model if effective else settings.eap_model_default,
            },
            "groups": groups,
            "routableProviders": [group["id"] for group in groups],
            "failures": [],
        }},
    }

class SessionListFrame(BaseModel):
    type: Literal["client-request"]
    rpcId: str = Field(min_length=1, max_length=128)
    method: Literal["session/list"]


@router.post("/session/list")
def list_sessions(frame: SessionListFrame, request: Request):
    items = request.app.state.chat_service.session_summaries(WORKSPACE_ID)
    for item in items:
        cursor = item.pop("messageCount") // 2 * 5 - 1
        item["projections"] = {"kind": "sequenced", **session_projection(item, cursor)}
        item.pop("connectionId")
        item.pop("model")
        item.pop("firstUserMessage")
    return {
        "type": "server-response",
        "rpcId": frame.rpcId,
        "result": {"ok": True, "value": {
            "items": items,
        }},
    }

class SessionAddress(BaseModel):
    kind: Literal["session"]
    sessionId: str = Field(min_length=1, max_length=256)


class TurnWindow(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    minMessages: int = Field(ge=0)
    minTurns: int = Field(ge=0)


class SessionPageRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    address: SessionAddress
    beforeSeq: int | None = Field(default=None, ge=0)
    throughSeq: int | None = Field(default=None, ge=-1)
    maxMessages: int = Field(default=64, ge=1, le=4096)
    turnWindow: TurnWindow | None = None


class SessionPageArgs(BaseModel):
    request: SessionPageRequest


class SessionPagePayload(BaseModel):
    args: SessionPageArgs


class SessionPageFrame(BaseModel):
    type: Literal["client-request"]
    rpcId: str = Field(min_length=1, max_length=128)
    method: Literal["session/page", "session/events"]
    payload: SessionPagePayload


def history_records(messages: list[dict]) -> list[dict]:
    records = []

    def append(kind: str, time: int, data: dict, *, surface: bool = False):
        event = {"type": kind, "seq": len(records), "time": time, "data": data}
        if surface:
            event["surfaceOp"] = "append"
        records.append({"type": "event", "event": event})

    for turn, (user, assistant) in enumerate(zip(messages[::2], messages[1::2], strict=True), 1):
        if (user["role"], assistant["role"]) != ("USER", "ASSISTANT"):
            raise ValueError("Stored conversation does not contain alternating message pairs")
        start, finish = user["time"], assistant["time"]
        append("turn/start", start, {"turn": turn})
        append("user/message", start, {
            "id": user["id"], "role": "user", "source": {"kind": "user"},
            "content": [{"type": "text", "text": user["text"]}],
        }, surface=True)
        append("step/start", finish, {"turn": turn, "step": 0})
        append("assistant/message", finish, {
            "turn": turn, "step": 0,
            "stream": [
                {"type": "chunk", "time": finish,
                 "chunk": {"type": "block-start", "index": 0, "blockType": "text"}},
                {"type": "text-chunks", "time0": finish, "index": 0, "dt": [],
                 "texts": [assistant["text"]]},
                {"type": "chunk", "time": finish, "chunk": {
                    "type": "block-end", "index": 0,
                    "block": {"type": "text", "text": assistant["text"]},
                }},
                {"type": "chunk", "time": finish,
                 "chunk": {"type": "finish", "reason": {"kind": "stop"}}},
            ],
            "message": {
                "id": assistant["id"], "role": "assistant",
                "source": {"kind": "model", "provider": assistant["provider"] or "", "model": assistant["model"] or ""},
                "content": [{"type": "text", "text": assistant["text"]}],
            },
        }, surface=True)
        append("turn/end", finish, {"turn": turn, "reason": {"kind": "completed"}})
    return records


@router.post("/session/page")
@router.post("/session/events")
def session_page(frame: SessionPageFrame, request: Request):
    command = frame.payload.args.request
    response = {"type": "server-response", "rpcId": frame.rpcId}
    history = request.app.state.chat_service.session_history(command.address.sessionId)
    if history is None:
        return {**response, "result": {"ok": False, "error": {
            "code": "session/not-found", "message": "Session does not exist.",
            "details": {"sessionId": command.address.sessionId},
        }}}
    _, messages = history
    records = history_records(messages)
    try:
        value = history_page(records, command)
    except ValueError:
        return {**response, "result": {"ok": False, "error": {
            "code": "gateway/bad-request", "message": "Invalid history window.", "details": {},
        }}}
    return {**response, "result": {"ok": True, "value": value}}


def history_page(records: list[dict], command: SessionPageRequest) -> dict:
    latest = len(records) - 1
    cursor = latest if command.throughSeq is None else command.throughSeq
    window = command.turnWindow
    if cursor > latest or (window is not None and window.minMessages > command.maxMessages):
        raise ValueError("Invalid history window")
    stop = cursor + 1
    if command.beforeSeq is not None:
        stop = min(stop, command.beforeSeq)
    start = count = turns = 0
    for index in range(stop - 1, -1, -1):
        kind = records[index]["event"]["type"]
        if window is not None and kind == "turn/start":
            turns += 1
            if count >= window.minMessages and turns >= window.minTurns:
                start = index
                break
        if kind in {"user/message", "assistant/message"}:
            count += 1
            if count >= command.maxMessages:
                start = index
                break
    return {"records": records[start:stop], "cursor": cursor, "hasMore": start > 0}

class PromptText(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["text"]
    text: str


class SessionPromptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    requestId: str = Field(min_length=1, max_length=256)
    sessionId: str = Field(min_length=1, max_length=256)
    mode: Literal["queue", "steer"]
    content: list[PromptText] = Field(min_length=1, max_length=128)
    clientTimeZone: str | None = None


class SessionPromptArgs(BaseModel):
    request: SessionPromptRequest


class SessionPromptPayload(BaseModel):
    args: SessionPromptArgs


class SessionPromptFrame(BaseModel):
    type: Literal["client-request"]
    rpcId: str = Field(min_length=1, max_length=128)
    method: Literal["session/prompt"]
    payload: SessionPromptPayload


@router.post("/session/prompt")
async def session_prompt(frame: SessionPromptFrame, request: Request, background: BackgroundTasks):
    command = frame.payload.args.request
    response = {"type": "server-response", "rpcId": frame.rpcId}
    accepted = {**response, "result": {"ok": True, "value": {"accepted": True}}}

    def reject(code: str, message: str):
        return {**response, "result": {"ok": False, "error": {
            "code": code, "message": message, "details": {},
        }}}

    if command.mode != "queue":
        return reject("gateway/bad-request", "Steering is unavailable on this host.")
    message = "\n".join(part.text for part in command.content)
    service = request.app.state.chat_service
    events = service.stream_send(
        command.sessionId, {"message": message, "toolMode": "none"},
        request_id=command.requestId,
        allow_source_tools=True,
    )
    try:
        await anext(events)
    except DuplicatePromptError as exc:
        if exc.same_content:
            return accepted
        return reject("gateway/bad-request", "Prompt request identity was already used with different content.")
    except LookupError:
        return reject("session/not-found", "Session does not exist.")
    except ValueError:
        return reject("gateway/bad-request", "Prompt text must be non-empty and at most 32000 characters.")
    except RuntimeError:
        return reject("session/busy", "A turn is already running for this session.")

    async def finish_turn():
        async for _ in events:
            pass

    background.add_task(finish_turn)
    return accepted

class SessionProjectionsArgs(BaseModel):
    sessionId: str = Field(min_length=1, max_length=256)


class SessionProjectionsPayload(BaseModel):
    args: SessionProjectionsArgs


class SessionProjectionsFrame(BaseModel):
    type: Literal["client-request"]
    rpcId: str = Field(min_length=1, max_length=128)
    method: Literal["session/projections"]
    payload: SessionProjectionsPayload


def session_projection(conversation: dict, cursor: int, first_message: str | None = None) -> dict:
    provider, model = conversation["connectionId"], conversation["model"]
    selection = {"provider": provider, "model": model} if provider and model else None
    title = " ".join((first_message or conversation.get("firstUserMessage") or "").split())[:80]
    return {
        "asOfSeq": cursor,
        "values": {"modelSelection": {"next": selection, "lastUsed": None}, **({"title": title} if title else {})},
    }


@router.post("/session/projections")
def session_projections(frame: SessionProjectionsFrame, request: Request):
    session_id = frame.payload.args.sessionId
    chat = request.app.state.chat_service
    history = chat.session_history(session_id)
    conversation = chat.get_conversation(session_id) if history is not None else None
    value = None
    if conversation is not None and history is not None:
        cursor = len(history_records(history[1])) - 1
        value = {"kind": "sequenced", **session_projection(conversation, cursor, history[1][0]["text"] if history[1] else None)}
    return {
        "type": "server-response",
        "rpcId": frame.rpcId,
        "result": {"ok": True, "value": value},
    }