from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.domain.errors import ChatErrorCode
from app.persistence.connections import ConnectionRecord


class LlmError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


async def stream_chat_completion(
    connection: ConnectionRecord,
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
) -> AsyncIterator[str]:
    """Yield text deltas from an OpenAI-compatible chat.completions stream."""
    if not connection.secret:
        raise LlmError(ChatErrorCode.MODEL_NOT_CONFIGURED, "model API key missing")
    target_model = model or connection.default_model
    if not target_model:
        raise LlmError(ChatErrorCode.MODEL_NOT_CONFIGURED, "model id missing")
    url = connection.base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {connection.secret}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": target_model,
        "messages": messages,
        "stream": True,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
            async with client.stream("POST", url, headers=headers, json=body) as response:
                if response.status_code >= 400:
                    text = (await response.aread()).decode("utf-8", errors="replace")[:2000]
                    raise LlmError(
                        ChatErrorCode.AI_PROVIDER_ERROR,
                        f"provider HTTP {response.status_code}: {text}",
                    )
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    import json

                    try:
                        payload = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = payload.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content")
                    if isinstance(content, str) and content:
                        yield content
    except LlmError:
        raise
    except httpx.HTTPError as exc:
        raise LlmError(ChatErrorCode.AI_PROVIDER_ERROR, str(exc)) from exc


async def fake_stream(text: str) -> AsyncIterator[str]:
    """Deterministic stream for tests / offline mode."""
    chunk_size = max(1, len(text) // 4) if text else 1
    if not text:
        yield ""
        return
    for index in range(0, len(text), chunk_size):
        yield text[index : index + chunk_size]
