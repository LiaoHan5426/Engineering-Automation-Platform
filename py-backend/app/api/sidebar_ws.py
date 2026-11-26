"""DSH sidebar WebSocket routes backed by the local workspace Host."""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import suppress
from itertools import islice
from pathlib import Path
from urllib.parse import urlsplit

from anyio import CancelScope
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.infrastructure.local_workspace.files import resolve_workspace_path

router = APIRouter(tags=["sidebar-host-gateway"])
_SCAN_INTERVAL = 0.75
_MAX_WATCHES = 32
_MAX_ENTRIES = 500


async def _admit(socket: WebSocket, session_id: str) -> bool:
    origin = socket.headers.get("origin")
    if origin:
        try:
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or parsed.netloc != socket.headers.get("host"):
                await socket.close(code=1008)
                return False
        except ValueError:
            await socket.close(code=1008)
            return False
    plugins = socket.app.state.plugins
    if not session_id.strip() or len(session_id) > 256 or not await run_in_threadpool(plugins.sidebar_available):
        await socket.close(code=1008)
        return False
    return True


def _signature(workspace: Path, directory: Path) -> tuple:
    try:
        if resolve_workspace_path(workspace, str(directory)) != directory:
            return ()
        with os.scandir(directory) as entries:
            files = []
            for entry in islice(entries, _MAX_ENTRIES):
                with suppress(FileNotFoundError):
                    meta = entry.stat(follow_symlinks=False)
                    files.append((entry.name, meta.st_mtime_ns, meta.st_size))
        return directory.stat().st_mtime_ns, tuple(sorted(files))
    except (OSError, ValueError):
        return ()


@router.websocket("/sidebar/ws/fs-watch")
async def fs_watch(socket: WebSocket, sessionId: str) -> None:
    if not await _admit(socket, sessionId):
        return
    await socket.accept()
    workspace = socket.app.state.settings.workspace_root
    watched: dict[Path, tuple] = {}
    try:
        while True:
            try:
                data = await asyncio.wait_for(socket.receive(), timeout=_SCAN_INTERVAL)
            except TimeoutError:
                if not await run_in_threadpool(socket.app.state.plugins.sidebar_available):
                    await socket.close(code=1008)
                    return
                for directory, previous in tuple(watched.items()):
                    current = await run_in_threadpool(_signature, workspace, directory)
                    if current != previous:
                        watched[directory] = current
                        await socket.send_json({"dir": str(directory)})
                continue
            if data["type"] == "websocket.disconnect":
                return
            message = data.get("text")
            if not isinstance(message, str):
                continue
            if len(message) > 8192:
                await socket.close(code=1009)
                return
            try:
                frame = json.loads(message)
                if not isinstance(frame, dict) or not isinstance(frame.get("path"), str) or not frame["path"]:
                    continue
                directory = await run_in_threadpool(resolve_workspace_path, workspace, frame["path"])
            except (ValueError, OSError):
                continue
            if frame.get("op") == "unwatch":
                watched.pop(directory, None)
            elif frame.get("op") == "watch" and (directory in watched or len(watched) < _MAX_WATCHES):
                signature = await run_in_threadpool(_signature, workspace, directory)
                if signature:
                    watched.setdefault(directory, signature)
                    await socket.send_json({"ok": True, "dir": str(directory)})
    except WebSocketDisconnect:
        return


@router.websocket("/sidebar/ws/agent-opens")
async def agent_opens(socket: WebSocket, sessionId: str) -> None:
    if not await _admit(socket, sessionId):
        return
    plugins = socket.app.state.plugins
    with plugins.sidebar_opens(sessionId) as queue:
        await socket.accept()
        incoming = asyncio.create_task(socket.receive())
        queued = asyncio.create_task(queue.get())
        try:
            while True:
                ready, _ = await asyncio.wait((incoming, queued), timeout=1, return_when=asyncio.FIRST_COMPLETED)
                if incoming in ready:
                    if incoming.result()["type"] == "websocket.disconnect":
                        return
                    incoming = asyncio.create_task(socket.receive())
                if (not ready or queued in ready) and not await run_in_threadpool(plugins.sidebar_available):
                    await socket.close(code=1008)
                    return
                if queued in ready:
                    await socket.send_json(queued.result())
                    queued = asyncio.create_task(queue.get())
        except WebSocketDisconnect:
            return
        finally:
            incoming.cancel()
            queued.cancel()
            with CancelScope(shield=True):
                await asyncio.gather(incoming, queued, return_exceptions=True)
