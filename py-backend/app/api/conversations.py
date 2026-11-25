from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import Response, StreamingResponse

from app.api.problem import problem_from_code
from app.domain.errors import ChatErrorCode
from app.services.chat_service import ChatService
from app.services.llm_openai import LlmError

router = APIRouter(prefix="/ai", tags=["chat"])


def _chat(request: Request) -> ChatService:
    return request.app.state.chat_service


@router.get("/status")
def ai_status(request: Request) -> dict[str, Any]:
    return _chat(request).ai_status()


@router.get("/workspace/dirty")
def workspace_dirty(request: Request) -> dict[str, Any]:
    return _chat(request).workspace_dirty()


@router.get("/workspace/files")
def workspace_files(request: Request, path: str = "") -> dict[str, Any]:
    return _chat(request).workspace_files(path)


@router.get("/workspace/baseline")
def workspace_baseline(request: Request, path: str = "") -> dict[str, Any]:
    return _chat(request).workspace_baseline(path)


@router.get("/workspace/source")
def workspace_source(request: Request, path: str = "") -> dict[str, Any]:
    return _chat(request).workspace_source(path)


@router.post("/workspace/verification/probe")
def workspace_verification_probe(request: Request) -> dict[str, Any]:
    return _chat(request).verification_probe()


@router.post("/conversations")
def open_conversation(request: Request) -> dict[str, Any]:
    return _chat(request).open_conversation()


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, request: Request):
    item = _chat(request).get_conversation(conversation_id)
    if item is None:
        return problem_from_code(ChatErrorCode.UNKNOWN_CONVERSATION)
    return item


@router.put("/conversations/{conversation_id}/working-memory")
async def put_working_memory(conversation_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        return problem_from_code(ChatErrorCode.INVALID_CHAT_REQUEST)
    if not isinstance(body, dict):
        return problem_from_code(ChatErrorCode.INVALID_CHAT_REQUEST)
    try:
        return _chat(request).put_working_memory(conversation_id, body)
    except LookupError as exc:
        return problem_from_code(str(exc))
    except ValueError as exc:
        return problem_from_code(str(exc))


@router.get("/conversations/{conversation_id}/model-history")
def model_history(conversation_id: str, request: Request):
    usage = _chat(request).model_history(conversation_id)
    if usage is None:
        return problem_from_code(ChatErrorCode.UNKNOWN_CONVERSATION)
    return usage


@router.delete("/conversations/{conversation_id}/model-history")
def clear_model_history(conversation_id: str, request: Request):
    if not _chat(request).clear_model_history(conversation_id):
        return problem_from_code(ChatErrorCode.UNKNOWN_CONVERSATION)
    return Response(status_code=204)


@router.post("/conversations/{conversation_id}/model-history/summary")
async def summarize_model_history(conversation_id: str, request: Request):
    try:
        return await _chat(request).summarize_model_history(conversation_id)
    except LookupError as exc:
        return problem_from_code(str(exc))
    except LlmError as exc:
        return problem_from_code(exc.code)


@router.get("/conversations/{conversation_id}/graph")
def conversation_graph(conversation_id: str, request: Request, leafId: str | None = None):
    graph = _chat(request).graph(conversation_id, leafId)
    if graph is None:
        return problem_from_code(ChatErrorCode.UNKNOWN_CONVERSATION)
    return graph


@router.post("/conversations/{conversation_id}/cancel")
def cancel_conversation(conversation_id: str, request: Request):
    try:
        return _chat(request).cancel(conversation_id)
    except LookupError as exc:
        return problem_from_code(str(exc))


@router.get("/conversations/{conversation_id}/executions/{execution_id}/snapshot")
def execution_snapshot(
    conversation_id: str,
    execution_id: str,
    request: Request,
    afterSequence: int = 0,
):
    snap = _chat(request).snapshot(conversation_id, execution_id, afterSequence)
    if snap is None:
        return problem_from_code(ChatErrorCode.UNKNOWN_CONVERSATION)
    return snap


@router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, request: Request):
    body = await request.json()
    service = _chat(request)
    try:
        service.validate_send(body if isinstance(body, dict) else {})
    except ValueError as exc:
        return problem_from_code(str(exc))

    if service.get_conversation(conversation_id) is None:
        return problem_from_code(ChatErrorCode.UNKNOWN_CONVERSATION)

    if service._journal.active_for(conversation_id) is not None:  # noqa: SLF001
        return problem_from_code(ChatErrorCode.CONVERSATION_BUSY)

    async def event_stream():
        try:
            async for frame in service.stream_send(conversation_id, body):
                yield frame
        except LookupError as exc:
            # Should be rare after pre-check; emit final-like problem via SSE is avoided —
            # pre-stream validation already returned JSON. Close stream quietly.
            _ = exc
            return
        except RuntimeError as exc:
            _ = exc
            return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
