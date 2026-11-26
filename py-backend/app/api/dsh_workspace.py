from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlsplit

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.api.dsh_session import (
    WORKSPACE_ID, SessionPageRequest, history_page, history_records, session_projection,
)

router = APIRouter(tags=["dsh-workspace"])



def workspace_snapshot(socket: WebSocket) -> dict:
    root = socket.app.state.settings.workspace_root
    sessions = socket.app.state.chat_service.workspace_sessions(WORKSPACE_ID)
    try:
        created_at = datetime.fromtimestamp(root.stat().st_ctime, tz=timezone.utc).isoformat()
    except OSError:
        return {"items": [], "archivedSessionIds": [], "pinnedSessionIds": []}
    return {
        "items": [{
            "workspaceId": WORKSPACE_ID,
            "path": str(root),
            "title": root.name or str(root),
            "sessionIds": [session_id for session_id, _ in sessions],
            "createdAt": created_at,
            "updatedAt": max([created_at, *(timestamp for _, timestamp in sessions)]),
        }],
        "archivedSessionIds": [],
        "pinnedSessionIds": [],
    }


class SessionFollowRequest(SessionPageRequest):
    activate: bool = False
    assistantStream: bool = False


def open_session(socket: WebSocket, command: SessionFollowRequest) -> dict | None:
    session_id = command.address.sessionId
    history = socket.app.state.chat_service.session_history(session_id)
    if history is None:
        return None
    created_at, messages = history
    conversation = socket.app.state.chat_service.get_conversation(session_id)
    if conversation is None:
        return None
    page = history_page(history_records(messages), command)
    snapshot = {
        "type": "snapshot",
        "header": {
            "version": 4, "id": session_id, "createdAt": created_at,
            "cwd": str(socket.app.state.settings.workspace_root), "isSeeded": False,
        },
        **page,
        "projections": session_projection(conversation, page["cursor"]),
    }
    if command.assistantStream:
        snapshot["assistantStream"] = {"revision": 0}
    return snapshot


def session_updates(socket: WebSocket, session_id: str, cursor: int) -> list[dict]:
    history = socket.app.state.chat_service.session_history(session_id)
    if history is None:
        return []
    return history_records(history[1])[cursor + 1:]


async def stream_item(socket: WebSocket, stream_id: str, value: dict) -> None:
    await socket.send_json({"type": "item", "streamId": stream_id, "value": value})


async def stream_error(socket: WebSocket, stream_id: str, code: str, message: str) -> None:
    await socket.send_json({
        "type": "error", "streamId": stream_id,
        "error": {"code": code, "message": message, "details": {}},
    })


@router.websocket("/remote.mux")
async def remote_mux(socket: WebSocket):
    try:
        origin = urlsplit(socket.headers.get("origin", ""))
    except ValueError:
        await socket.close(code=1008)
        return
    if origin.scheme not in {"http", "https"} or origin.netloc != socket.headers.get("host"):
        await socket.close(code=1008)
        return

    await socket.accept()
    followers: set[str] = set()
    sessions: dict[str, tuple[str, int]] = {}
    event_streams: set[str] = set()
    previous = None
    loop = asyncio.get_running_loop()
    next_scan = loop.time() + 0.75
    try:
        while True:
            try:
                timeout = max(0, next_scan - loop.time()) if followers or sessions else None
                raw = await asyncio.wait_for(socket.receive_text(), timeout=timeout)
            except TimeoutError:
                next_scan = loop.time() + 0.75
                if followers:
                    current = await run_in_threadpool(workspace_snapshot, socket)
                    if current != previous:
                        for stream_id in followers:
                            await stream_item(socket, stream_id, {"type": "replace", "value": current})
                        previous = current
                for stream_id, (session_id, cursor) in sessions.items():
                    updates = await run_in_threadpool(session_updates, socket, session_id, cursor)
                    for update in updates:
                        await stream_item(socket, stream_id, update)
                    if updates:
                        sessions[stream_id] = (session_id, updates[-1]["event"]["seq"])
                continue
            try:
                frame = json.loads(raw)
            except ValueError:
                await socket.close(code=1003)
                return
            if not isinstance(frame, dict) or not isinstance(stream_id := frame.get("streamId"), str) or not stream_id:
                await socket.close(code=1003)
                return
            kind = frame.get("type")
            if kind == "cancel":
                followers.discard(stream_id)
                sessions.pop(stream_id, None)
                event_streams.discard(stream_id)
            elif kind == "end":
                continue
            elif (kind != "open" or stream_id in followers or stream_id in sessions
                  or stream_id in event_streams
                  or len(followers) + len(sessions) + len(event_streams) >= 16):
                await stream_error(socket, stream_id, "gateway/bad-request", "Invalid stream operation.")
            elif frame.get("endpoint") == "$events":
                event_streams.add(stream_id)
                await stream_item(socket, stream_id, {
                    "type": "ready",
                    "clientId": str(uuid4()),
                    "host": {"home": str(Path.home())},
                })
            elif frame.get("endpoint") == "workspace/follow":
                snapshot = await run_in_threadpool(workspace_snapshot, socket)
                if not followers:
                    previous = snapshot
                followers.add(stream_id)
                await stream_item(socket, stream_id, {"type": "baseline", "value": snapshot})
            elif frame.get("endpoint") == "session/follow":
                try:
                    command = SessionFollowRequest.model_validate(frame["payload"]["args"]["request"])
                    if (command.beforeSeq is not None or command.throughSeq is not None
                        or (command.turnWindow is not None and command.turnWindow.minMessages > command.maxMessages)):
                        raise ValueError("A follow opens at the current cursor")
                except (KeyError, TypeError, ValidationError, ValueError):
                    await stream_error(socket, stream_id, "gateway/bad-request", "Invalid session follow request.")
                    continue
                snapshot = await run_in_threadpool(open_session, socket, command)
                if snapshot is None:
                    await stream_error(socket, stream_id, "session/not-found", "Session does not exist.")
                    continue
                sessions[stream_id] = (command.address.sessionId, snapshot["cursor"])
                await stream_item(socket, stream_id, snapshot)
            else:
                await stream_error(socket, stream_id, "gateway/bad-request", "Unsupported stream request.")
    except WebSocketDisconnect:
        return
