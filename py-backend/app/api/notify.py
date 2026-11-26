from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.api.problem import problem
from app.domain.notify import NotifyContractError
from app.services.notify_hub import NotifyHub
from app.api.sse import format_notify_heartbeat, format_notify_sse

router = APIRouter(prefix="/notify", tags=["notify"])


def _hub(request: Request) -> NotifyHub:
    return request.app.state.notify_hub


@router.get("/snapshot")
def notify_snapshot(request: Request, after: int = Query(default=0)) -> dict[str, Any]:
    try:
        return _hub(request).snapshot(after)
    except NotifyContractError as exc:
        return problem(400, exc.code, exc.code)


@router.get("/stream")
async def notify_stream(request: Request, after: int = Query(default=0)) -> StreamingResponse:
    hub = _hub(request)
    try:
        backlog = hub.snapshot(after)["events"]
    except NotifyContractError as exc:
        return problem(400, exc.code, exc.code)  # type: ignore[return-value]

    queue = hub.subscribe_sse()

    async def frames():
        try:
            for event in backlog:
                yield format_notify_sse(event)
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield format_notify_heartbeat()
                    continue
                if item is None:
                    break
                yield format_notify_sse(item)
        finally:
            hub.unsubscribe(queue)

    return StreamingResponse(
        frames(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws")
async def notify_ws(websocket: WebSocket, after: int = Query(default=0)) -> None:
    await websocket.accept()
    hub: NotifyHub = websocket.app.state.notify_hub
    try:
        backlog = hub.snapshot(after)["events"]
    except NotifyContractError as exc:
        await websocket.send_json({"code": exc.code})
        await websocket.close(code=1008)
        return
    queue = hub.subscribe_ws()
    try:
        for event in backlog:
            await websocket.send_json(event)
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat"})
                continue
            if item is None:
                break
            await websocket.send_json(item)
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(queue)
