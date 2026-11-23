from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from sqlmodel import Session

from app.config import Settings
from app.domain.errors import ChatErrorCode
from app.domain.statuses import is_ai_tool_mode, is_task_mode
from app.persistence.connections import ConnectionStore
from app.persistence.execution_journal import BusyError, ExecutionJournal, ExecutionState
from app.persistence.message_store import MessageStore
from app.services.llm_openai import LlmError, fake_stream, stream_chat_completion
from app.services.sse import format_sse
from app.services.tools.registry import CapabilityRegistry


class ChatService:
    def __init__(
        self,
        *,
        settings: Settings,
        engine,
        journal: ExecutionJournal,
        connections: ConnectionStore,
        tools: CapabilityRegistry,
        offline_reply: str | None = None,
    ) -> None:
        self._settings = settings
        self._engine = engine
        self._journal = journal
        self._connections = connections
        self._tools = tools
        self._offline_reply = offline_reply

    def open_conversation(self) -> dict[str, Any]:
        target = self._connections.effective()
        with Session(self._engine) as session:
            store = MessageStore(session)
            item = store.create_conversation(
                connection_id=target.id if target else None,
                model=target.default_model if target else None,
            )
            session.commit()
            return item

    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        with Session(self._engine) as session:
            store = MessageStore(session)
            row = store.get_conversation(conversation_id)
            return store.to_conversation(row) if row else None

    def graph(self, conversation_id: str, leaf_id: str | None = None) -> dict[str, Any] | None:
        with Session(self._engine) as session:
            store = MessageStore(session)
            if store.get_conversation(conversation_id) is None:
                return None
            return store.graph(conversation_id, leaf_id)

    def cancel(self, conversation_id: str) -> dict[str, Any]:
        if self.get_conversation(conversation_id) is None:
            raise LookupError(ChatErrorCode.UNKNOWN_CONVERSATION)
        return self._journal.request_cancel(conversation_id)

    def snapshot(
        self, conversation_id: str, execution_id: str, after_sequence: int = 0
    ) -> dict[str, Any] | None:
        return self._journal.snapshot(conversation_id, execution_id, after_sequence)

    def validate_send(self, body: dict[str, Any]) -> None:
        message = body.get("message")
        tool_mode = body.get("toolMode")
        if not isinstance(message, str) or not message.strip() or len(message) > 32_000:
            raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
        if not is_ai_tool_mode(tool_mode):
            raise ValueError(ChatErrorCode.INVALID_CHAT_REQUEST)
        context = body.get("context")
        if context is not None:
            if not isinstance(context, dict):
                raise ValueError(ChatErrorCode.INVALID_TASK_CONTEXT)
            mode = context.get("mode")
            if mode is not None and not is_task_mode(mode):
                raise ValueError(ChatErrorCode.INVALID_TASK_CONTEXT)
            if mode == "plan" and tool_mode != "none":
                raise ValueError(ChatErrorCode.INVALID_TASK_CONTEXT)
            if mode in {"code", "plan"}:
                # Thin MVP: only chat mode is fully supported.
                raise ValueError(ChatErrorCode.INVALID_TASK_CONTEXT)

    async def stream_send(
        self, conversation_id: str, body: dict[str, Any]
    ) -> AsyncIterator[str]:
        self.validate_send(body)
        with Session(self._engine) as session:
            store = MessageStore(session)
            conversation = store.get_conversation(conversation_id)
            if conversation is None:
                raise LookupError(ChatErrorCode.UNKNOWN_CONVERSATION)
            history_nodes = store.graph(conversation_id)["path"]
            connection_id = conversation.connection_id
            model = conversation.model
            session.commit()

        try:
            state = self._journal.start(conversation_id)
        except BusyError as exc:
            raise RuntimeError(ChatErrorCode.CONVERSATION_BUSY) from exc

        message = str(body["message"]).strip()
        tool_mode = str(body["toolMode"])
        tool_events: list[dict[str, Any]] = []

        try:
            yield format_sse(
                self._journal.append_event(
                    state,
                    event_type="status",
                    status="RUNNING",
                )
            )

            if tool_mode != "none":
                observation = self._tools.run(tool_mode)
                tool_events.append(
                    {
                        "sequence": len(tool_events) + 1,
                        "code": str(observation.get("code") or tool_mode),
                    }
                )
                yield format_sse(
                    self._journal.append_event(
                        state,
                        event_type="tool",
                        status="RUNNING",
                        text=str(observation.get("summary") or ""),
                        code=str(observation.get("code") or ""),
                        payload={"sequence": tool_events[-1]["sequence"], **observation},
                    )
                )
                if observation.get("code") == ChatErrorCode.TOOL_MODE_UNSUPPORTED:
                    result = self._final_payload(
                        state,
                        answer="",
                        status="FAILED",
                        error=ChatErrorCode.TOOL_MODE_UNSUPPORTED,
                        tool_events=tool_events,
                    )
                    yield format_sse(
                        self._journal.append_event(
                            state,
                            event_type="final",
                            status="FAILED",
                            text="",
                            code=ChatErrorCode.TOOL_MODE_UNSUPPORTED,
                            payload=result,
                            message="tool mode unsupported",
                        )
                    )
                    self._journal.complete(state, "FAILED")
                    return

            if self._journal.is_cancel_requested(state.execution_id):
                async for frame in self._finish_cancelled(state, tool_events):
                    yield frame
                return

            answer_parts: list[str] = []
            try:
                async for delta in self._answer_stream(
                    conversation_id=conversation_id,
                    history=history_nodes,
                    user_message=message,
                    tool_mode=tool_mode,
                    tool_events=tool_events,
                    connection_id=connection_id,
                    model=model,
                ):
                    if self._journal.is_cancel_requested(state.execution_id):
                        async for frame in self._finish_cancelled(
                            state, tool_events, partial="".join(answer_parts)
                        ):
                            yield frame
                        return
                    if not delta:
                        continue
                    answer_parts.append(delta)
                    yield format_sse(
                        self._journal.append_event(
                            state,
                            event_type="answer.delta",
                            status="RUNNING",
                            text=delta,
                        )
                    )
            except LlmError as exc:
                result = self._final_payload(
                    state,
                    answer="".join(answer_parts),
                    status="FAILED",
                    error=exc.code,
                    tool_events=tool_events,
                )
                yield format_sse(
                    self._journal.append_event(
                        state,
                        event_type="final",
                        status="FAILED",
                        text=result["answer"],
                        code=exc.code,
                        payload=result,
                        message=exc.detail,
                    )
                )
                self._journal.complete(state, "FAILED")
                return

            answer = "".join(answer_parts)
            if not answer and self._offline_reply is None:
                # Empty stream with configured model still succeeds with empty answer only if
                # provider returned nothing; treat as provider failure for clarity.
                result = self._final_payload(
                    state,
                    answer="",
                    status="FAILED",
                    error=ChatErrorCode.AI_EMPTY_RESPONSE,
                    tool_events=tool_events,
                )
                yield format_sse(
                    self._journal.append_event(
                        state,
                        event_type="final",
                        status="FAILED",
                        text="",
                        code=ChatErrorCode.AI_EMPTY_RESPONSE,
                        payload=result,
                        message="empty model response",
                    )
                )
                self._journal.complete(state, "FAILED")
                return

            self._persist_pair(
                conversation_id,
                user_text=message,
                assistant_text=answer,
                execution_id=state.execution_id,
            )
            result = self._final_payload(
                state,
                answer=answer,
                status="SUCCEEDED",
                error="",
                tool_events=tool_events,
            )
            yield format_sse(
                self._journal.append_event(
                    state,
                    event_type="final",
                    status="SUCCEEDED",
                    text=answer,
                    code="",
                    payload=result,
                )
            )
            self._journal.complete(state, "SUCCEEDED")
        except Exception as exc:  # noqa: BLE001 — convert to UNKNOWN evidence, no resume
            result = self._final_payload(
                state,
                answer="",
                status="UNKNOWN",
                error=ChatErrorCode.AI_PROVIDER_ERROR,
                tool_events=tool_events,
            )
            yield format_sse(
                self._journal.append_event(
                    state,
                    event_type="final",
                    status="UNKNOWN",
                    text="",
                    code=ChatErrorCode.AI_PROVIDER_ERROR,
                    payload=result,
                    message=str(exc),
                )
            )
            self._journal.complete(state, "UNKNOWN")

    async def _finish_cancelled(
        self,
        state: ExecutionState,
        tool_events: list[dict[str, Any]],
        partial: str = "",
    ) -> AsyncIterator[str]:
        result = self._final_payload(
            state,
            answer=partial,
            status="CANCELLED",
            error="",
            tool_events=tool_events,
        )
        yield format_sse(
            self._journal.append_event(
                state,
                event_type="final",
                status="CANCELLED",
                text=partial,
                code="",
                payload=result,
            )
        )
        self._journal.complete(state, "CANCELLED")

    async def _answer_stream(
        self,
        *,
        conversation_id: str,
        history: list[dict[str, Any]],
        user_message: str,
        tool_mode: str,
        tool_events: list[dict[str, Any]],
        connection_id: str | None,
        model: str | None,
    ) -> AsyncIterator[str]:
        if self._offline_reply is not None:
            async for chunk in fake_stream(self._offline_reply):
                yield chunk
            return

        connection = None
        if connection_id:
            connection = self._connections.get(connection_id)
        if connection is None:
            connection = self._connections.effective()
        if connection is None or not connection.secret:
            raise LlmError(ChatErrorCode.MODEL_NOT_CONFIGURED, "no model connection configured")

        messages: list[dict[str, str]] = [
            {
                "role": "system",
                "content": (
                    "You are the EAP local engineering assistant. "
                    "Model output is observation, not completion evidence."
                ),
            }
        ]
        for node in history:
            role = "user" if node["role"] == "USER" else "assistant"
            messages.append({"role": role, "content": node["text"]})
        if tool_mode == "git_status" and tool_events:
            messages.append(
                {
                    "role": "system",
                    "content": f"Deterministic tool observation ({tool_mode}) was attached to this turn.",
                }
            )
        messages.append({"role": "user", "content": user_message})
        async for delta in stream_chat_completion(connection, messages, model=model):
            yield delta

    def _persist_pair(
        self,
        conversation_id: str,
        *,
        user_text: str,
        assistant_text: str,
        execution_id: str,
    ) -> None:
        with Session(self._engine) as session:
            store = MessageStore(session)
            tip = store.tip(conversation_id)
            parent_id = tip.id if tip is not None else None
            user_node = store.append(
                conversation_id,
                role="USER",
                content=user_text,
                parent_id=parent_id,
            )
            store.append(
                conversation_id,
                role="ASSISTANT",
                content=assistant_text,
                parent_id=user_node.id,
                execution_id=execution_id,
            )
            session.commit()

    @staticmethod
    def _final_payload(
        state: ExecutionState,
        *,
        answer: str,
        status: str,
        error: str,
        tool_events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "executionId": state.execution_id,
            "answer": answer,
            "error": error,
            "status": status,
            "approval": "review",
            "verification": "not_requested",
            "toolEvents": tool_events,
            "artifactError": "",
            "artifacts": [],
            "proposal": None,
            "contextBudget": None,
            "skillContext": None,
            "knowledgeContext": None,
            "contextMemoryCleared": False,
            "knowledgeMemoryCleared": False,
        }
