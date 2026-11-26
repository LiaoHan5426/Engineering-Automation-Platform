from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx

from app.domain.errors import ChatErrorCode, LlmError
from app.persistence.connections import ConnectionRecord


async def stream_chat_completion(
    connection: ConnectionRecord,
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    read_source: Callable[[str], str] | None = None,
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
            calls: dict[int, dict[str, Any]] = {}
            if read_source is not None:
                body["tools"] = [{
                    "type": "function",
                    "function": {
                        "name": "read_workspace_source",
                        "description": "Read an authorized workspace source file using its relative path.",
                        "parameters": {
                            "type": "object",
                            "properties": {"path": {"type": "string"}},
                            "required": ["path"],
                            "additionalProperties": False,
                        },
                    },
                }]
                body["parallel_tool_calls"] = False
            content_parts: list[str] = []
            async for delta in _stream_deltas(client, url, headers, body):
                content = delta.get("content")
                if isinstance(content, str) and content:
                    content_parts.append(content)
                    yield content
                for fragment in delta.get("tool_calls") or []:
                    index = fragment["index"]
                    if read_source is None or index != 0:
                        raise LlmError(ChatErrorCode.AI_PROVIDER_ERROR, "Unexpected model tool call")
                    call = calls.setdefault(index, {
                        "id": "", "type": "function", "function": {"name": "", "arguments": ""},
                    })
                    call["id"] += fragment.get("id") or ""
                    for key in ("name", "arguments"):
                        call["function"][key] += (fragment.get("function") or {}).get(key) or ""
                    if len(call["function"]["arguments"]) > 4096:
                        raise LlmError(ChatErrorCode.AI_PROVIDER_ERROR, "Model tool arguments exceed limit")
            if calls and read_source is not None:
                call = calls[0]
                args = json.loads(call["function"]["arguments"])
                if (call["function"]["name"] != "read_workspace_source" or not call["id"]
                    or not isinstance(args, dict) or set(args) != {"path"} or not isinstance(args["path"], str)):
                    raise LlmError(ChatErrorCode.AI_PROVIDER_ERROR, "Invalid model source tool call")
                body.pop("tools")
                body.pop("parallel_tool_calls")
                body["messages"] = [
                    *messages,
                    {"role": "assistant", "content": "".join(content_parts) or None, "tool_calls": [call]},
                    {"role": "tool", "tool_call_id": call["id"], "content": read_source(args["path"])},
                ]
                async for delta in _stream_deltas(client, url, headers, body):
                    if delta.get("tool_calls"):
                        raise LlmError(ChatErrorCode.AI_PROVIDER_ERROR, "Model source tool round exhausted")
                    content = delta.get("content")
                    if isinstance(content, str) and content:
                        yield content
    except LlmError:
        raise
    except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
        raise LlmError(ChatErrorCode.AI_PROVIDER_ERROR, str(exc)) from exc


async def _stream_deltas(client, url, headers, body):
    async with client.stream("POST", url, headers=headers, json=body) as response:
        if response.status_code >= 400:
            text = (await response.aread()).decode("utf-8", errors="replace")[:2000]
            raise LlmError(ChatErrorCode.AI_PROVIDER_ERROR, f"provider HTTP {response.status_code}: {text}")
        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue
            choices = payload.get("choices") or []
            if choices:
                yield choices[0].get("delta") or {}

async def fake_stream(text: str) -> AsyncIterator[str]:
    """Deterministic stream for tests / offline mode."""
    chunk_size = max(1, len(text) // 4) if text else 1
    if not text:
        yield ""
        return
    for index in range(0, len(text), chunk_size):
        yield text[index : index + chunk_size]
