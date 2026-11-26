from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any, Protocol

from app.catalog.service import CatalogService
from app.config import Settings
from app.domain.errors import ChatErrorCode, LlmError
from app.domain.execution_journal import BusyError, ExecutionJournal, ExecutionState
from app.domain.statuses import is_ai_tool_mode, is_task_mode
from app.persistence.connections import ConnectionRecord, ConnectionStore
from app.services.notify_hub import NotifyHub
from app.services.tools.git_status import run_git_status
from app.services.workspace_files import (
    inspect_baseline,
    inspect_source,
    list_directory,
    verification_probe,
)
from app.services.tools.registry import CapabilityRegistry


def _instruction_focus(context: object) -> str | None:
    if not isinstance(context, dict):
        return None
    target = context.get("targetPath")
    if not isinstance(target, str) or not target.strip():
        return None
    return target.strip()


def _attached_files(context: object) -> list[dict[str, Any]]:
    if not isinstance(context, dict):
        return []
    files = context.get("files")
    if not isinstance(files, list):
        return []
    return [item for item in files if isinstance(item, dict)]


class ChatConversations(Protocol):
    def open_conversation(self, connection_id: str | None, model: str | None) -> dict[str, Any]: ...
    def session_history(self, conversation_id: str) -> tuple[int, list[dict[str, Any]]] | None: ...
    def session_summaries(self, workspace_id: str) -> list[tuple[str, int, int, str | None, str | None]]: ...
    def workspace_sessions(self, workspace_id: str) -> list[tuple[str, str]]: ...
    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None: ...
    def put_working_memory(self, conversation_id: str, body: dict[str, Any]) -> dict[str, Any]: ...
    def graph(self, conversation_id: str, leaf_id: str | None = None) -> dict[str, Any] | None: ...
    def model_history(self, conversation_id: str) -> dict[str, int] | None: ...
    def clear_model_history(self, conversation_id: str) -> bool: ...
    def summary_context(
        self, conversation_id: str
    ) -> tuple[dict[str, int], str | None, list[dict[str, Any]]] | None: ...
    def turn_context(
        self, conversation_id: str
    ) -> tuple[list[dict[str, Any]], str | None, str | None] | None: ...
    def persist_pair(
        self, conversation_id: str, *, user_text: str, assistant_text: str, execution_id: str
    ) -> None: ...


class StreamCompletion(Protocol):
    def __call__(
        self, connection: ConnectionRecord, messages: list[dict[str, str]], *, model: str | None = None,
        read_source: Callable[[str], str] | None = None,
    ) -> AsyncIterator[str]: ...


class OfflineStream(Protocol):
    def __call__(self, text: str) -> AsyncIterator[str]: ...


class ChatService:
    def __init__(
        self,
        *,
        settings: Settings,
        conversations: ChatConversations,
        stream_completion: StreamCompletion,
        offline_stream: OfflineStream,
        journal: ExecutionJournal,
        connections: ConnectionStore,
        tools: CapabilityRegistry,
        catalog: CatalogService,
        record_file_read: Callable[[Path, str, str], None],
        notify_hub: NotifyHub | None = None,
        offline_reply: str | None = None,
    ) -> None:
        self._settings = settings
        self._conversations = conversations
        self._stream_completion = stream_completion
        self._offline_stream = offline_stream
        self._journal = journal
        self._connections = connections
        self._tools = tools
        self._catalog = catalog
        self._record_file_read = record_file_read
        self._notify_hub = notify_hub
        self._offline_reply = offline_reply

    def ai_status(self) -> dict[str, Any]:
        """Connection readiness. Does not call the model."""
        connection = self._connections.effective()
        root = self._settings.workspace_root
        root_ok = root.is_dir()
        if connection is None or not connection.secret_present:
            state = "not_configured"
            provider = "none"
            model = ""
            revision = "0"
            error = ""
        elif connection.discovery_error:
            state = "error"
            provider = connection.kind
            model = connection.default_model
            revision = connection.configuration_revision
            error = "MODEL_DISCOVERY_FAILED"
        else:
            state = "configured_unverified"
            provider = connection.kind
            model = connection.default_model
            revision = connection.configuration_revision
            error = ""
        return {
            "state": state,
            "provider": provider,
            "model": model,
            "configurationRevision": revision,
            "lastObservedAt": None,
            "errorCode": error,
            "tools": {"git_status": True},
            "workspaceLabel": "ws-local",
            "workspacePath": str(root) if root_ok else "",
            "authorizedRootPath": str(root) if root_ok else "",
            "authorizedRootDenial": "" if root_ok else "AUTHORIZED_ROOT_MISSING",
            "storesUserDirectoryGrants": False,
            "verificationEnabled": False,
            "verificationCommands": [],
        }

    def workspace_dirty(self) -> dict[str, Any]:
        root = self._settings.workspace_root
        if not root.is_dir():
            return {
                "requested": False,
                "denial": "AUTHORIZED_ROOT_MISSING",
                "count": 0,
                "paths": [],
                "detail": "",
            }
        observation = run_git_status(root)
        if not observation.get("ok"):
            return {
                "requested": False,
                "denial": "GIT_STATUS_FAILED",
                "count": 0,
                "paths": [],
                "detail": str(observation.get("summary") or ""),
            }
        paths = [line[3:].strip() for line in str(observation.get("stdout") or "").splitlines() if len(line) > 3]
        return {
            "requested": True,
            "denial": "",
            "count": len(paths),
            "paths": paths[:50],
            "detail": "",
        }

    def workspace_files(self, requested: str | None) -> dict[str, Any]:
        return list_directory(self._settings.workspace_root, requested)

    def workspace_baseline(self, requested: str | None) -> dict[str, Any]:
        return inspect_baseline(self._settings.workspace_root, requested)

    def workspace_source(self, requested: str | None) -> dict[str, Any]:
        return inspect_source(self._settings.workspace_root, requested)

    def verification_probe(self) -> dict[str, Any]:
        return verification_probe(self._settings.workspace_root)

    def open_conversation(self) -> dict[str, Any]:
        target = self._connections.effective()
        return self._conversations.open_conversation(
            connection_id=target.id if target else None,
            model=target.default_model if target else None,
        )

    def session_history(self, conversation_id: str) -> tuple[int, list[dict[str, Any]]] | None:
        return self._conversations.session_history(conversation_id)

    def session_summaries(self, workspace_id: str) -> list[dict[str, Any]]:
        return [
            {
                "sessionId": session_id,
                "updatedAt": updated_at,
                "blank": count == 0,
                "messageCount": count,
                "connectionId": connection_id,
                "model": model,
                "running": self.has_active_turn(session_id),
                "agentAvailable": True,
                "cwd": str(self._settings.workspace_root),
            }
            for session_id, updated_at, count, connection_id, model in self._conversations.session_summaries(workspace_id)
        ]

    def workspace_sessions(self, workspace_id: str) -> list[tuple[str, str]]:
        return self._conversations.workspace_sessions(workspace_id)

    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        return self._conversations.get_conversation(conversation_id)

    def put_working_memory(self, conversation_id: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._conversations.put_working_memory(conversation_id, body)

    def graph(self, conversation_id: str, leaf_id: str | None = None) -> dict[str, Any] | None:
        return self._conversations.graph(conversation_id, leaf_id)

    def model_history(self, conversation_id: str) -> dict[str, int] | None:
        return self._conversations.model_history(conversation_id)

    def clear_model_history(self, conversation_id: str) -> bool:
        return self._conversations.clear_model_history(conversation_id)

    def has_active_turn(self, conversation_id: str) -> bool:
        return self._journal.active_for(conversation_id) is not None

    async def summarize_model_history(self, conversation_id: str) -> dict[str, Any]:
        context = self._conversations.summary_context(conversation_id)
        if context is None:
            raise LookupError(ChatErrorCode.UNKNOWN_CONVERSATION)
        usage, model, visible = context
        connection = self._connections.effective()
        if connection is None or not connection.secret:
            raise LlmError(ChatErrorCode.MODEL_NOT_CONFIGURED, "no model connection configured")
        messages: list[dict[str, str]] = [
            {
                "role": "system",
                "content": "Summarize the conversation for the operator. The summary is observation, not completion evidence.",
            }
        ]
        for node in visible:
            role = "user" if node["role"] == "USER" else "assistant"
            messages.append({"role": role, "content": node["text"]})
        if len(messages) == 1:
            messages.append({"role": "user", "content": "(no messages in the model window)"})
        parts: list[str] = []
        async for delta in self._stream_completion(connection, messages, model=model):
            parts.append(delta)
        return {
            "text": "".join(parts),
            "sourceMessages": usage["messages"],
            "sourceChars": usage["chars"],
            "model": connection.default_model,
        }

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
        self, conversation_id: str, body: dict[str, Any], *, request_id: str | None = None,
        allow_source_tools: bool = False,
    ) -> AsyncIterator[dict[str, Any]]:
        self.validate_send(body)
        context = self._conversations.turn_context(conversation_id)
        if context is None:
            raise LookupError(ChatErrorCode.UNKNOWN_CONVERSATION)
        history_nodes, connection_id, model = context

        try:
            state = self._journal.start(
                conversation_id, request_id=request_id, message=str(body["message"]).strip(),
            )
        except BusyError as exc:
            raise RuntimeError(ChatErrorCode.CONVERSATION_BUSY) from exc

        message = str(body["message"]).strip()
        tool_mode = str(body["toolMode"])
        tool_events: list[dict[str, Any]] = []

        try:
            yield self._journal.append_event(
                state,
                event_type="status",
                status="RUNNING",
            )

            if tool_mode != "none":
                if tool_mode == "code_sources":
                    observation = self._tools.run(
                        tool_mode, session_id=conversation_id,
                        target_path=_instruction_focus(body.get("context")),
                    )
                    if observation.get("ok"):
                        self._record_file_read(
                            self._settings.workspace_root, conversation_id, observation["path"],
                        )
                else:
                    observation = self._tools.run(tool_mode, session_id=conversation_id)
                tool_events.append(
                    {
                        "sequence": len(tool_events) + 1,
                        "code": str(observation.get("code") or tool_mode),
                        **({"summary": observation["summary"]} if tool_mode == "code_sources" and observation.get("ok") else {}),
                    }
                )
                yield self._journal.append_event(
                    state,
                    event_type="tool",
                    status="RUNNING",
                    text=str(observation.get("summary") or ""),
                    code=str(observation.get("code") or ""),
                    payload={"sequence": tool_events[-1]["sequence"], **observation},
                )
                if not observation.get("ok") and (
                    tool_mode == "code_sources" or observation.get("code") == ChatErrorCode.TOOL_MODE_UNSUPPORTED
                ):
                    error_code = observation["code"]
                    result = self._final_payload(
                        state,
                        answer="",
                        status="FAILED",
                        error=error_code,
                        tool_events=tool_events,
                    )
                    yield self._journal.append_event(
                        state,
                        event_type="final",
                        status="FAILED",
                        text="",
                        code=error_code,
                        payload=result,
                        message=str(observation.get("summary") or ""),
                    )
                    self._journal.complete(state, "FAILED")
                    await self._notify_session_terminal(state, "FAILED")
                    return

            if self._journal.is_cancel_requested(state.execution_id):
                async for event in self._finish_cancelled(state, tool_events):
                    yield event
                return

            answer_parts: list[str] = []
            try:
                async for delta in self._answer_stream(
                    conversation_id=conversation_id,
                    history=history_nodes,
                    user_message=message,
                    tool_events=tool_events,
                    allow_source_tools=allow_source_tools,
                    attachments=_attached_files(body.get("context")),
                    focus=_instruction_focus(body.get("context")),
                    connection_id=connection_id,
                    model=model,
                ):
                    if self._journal.is_cancel_requested(state.execution_id):
                        async for event in self._finish_cancelled(
                            state, tool_events, partial="".join(answer_parts)
                        ):
                            yield event
                        return
                    if not delta:
                        continue
                    answer_parts.append(delta)
                    yield self._journal.append_event(
                        state,
                        event_type="answer.delta",
                        status="RUNNING",
                        text=delta,
                    )
            except LlmError as exc:
                result = self._final_payload(
                    state,
                    answer="".join(answer_parts),
                    status="FAILED",
                    error=exc.code,
                    tool_events=tool_events,
                )
                yield self._journal.append_event(
                    state,
                    event_type="final",
                    status="FAILED",
                    text=result["answer"],
                    code=exc.code,
                    payload=result,
                    message=exc.detail,
                )
                self._journal.complete(state, "FAILED")
                await self._notify_session_terminal(state, "FAILED")
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
                yield self._journal.append_event(
                    state,
                    event_type="final",
                    status="FAILED",
                    text="",
                    code=ChatErrorCode.AI_EMPTY_RESPONSE,
                    payload=result,
                    message="empty model response",
                )
                self._journal.complete(state, "FAILED")
                await self._notify_session_terminal(state, "FAILED")
                return

            self._conversations.persist_pair(
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
            yield self._journal.append_event(
                state,
                event_type="final",
                status="SUCCEEDED",
                text=answer,
                code="",
                payload=result,
            )
            self._journal.complete(state, "SUCCEEDED")
            await self._notify_session_terminal(state, "SUCCEEDED")
        except Exception as exc:  # noqa: BLE001 — convert to UNKNOWN evidence, no resume
            result = self._final_payload(
                state,
                answer="",
                status="UNKNOWN",
                error=ChatErrorCode.AI_PROVIDER_ERROR,
                tool_events=tool_events,
            )
            yield self._journal.append_event(
                state,
                event_type="final",
                status="UNKNOWN",
                text="",
                code=ChatErrorCode.AI_PROVIDER_ERROR,
                payload=result,
                message=str(exc),
            )
            self._journal.complete(state, "UNKNOWN")
            await self._notify_session_terminal(state, "UNKNOWN")

    async def _finish_cancelled(
        self,
        state: ExecutionState,
        tool_events: list[dict[str, Any]],
        partial: str = "",
    ) -> AsyncIterator[dict[str, Any]]:
        result = self._final_payload(
            state,
            answer=partial,
            status="CANCELLED",
            error="",
            tool_events=tool_events,
        )
        yield self._journal.append_event(
            state,
            event_type="final",
            status="CANCELLED",
            text=partial,
            code="",
            payload=result,
        )
        self._journal.complete(state, "CANCELLED")

    async def _answer_stream(
        self,
        *,
        conversation_id: str,
        history: list[dict[str, Any]],
        user_message: str,
        tool_events: list[dict[str, Any]],
        attachments: list[dict[str, Any]],
        allow_source_tools: bool,
        focus: str | None,
        connection_id: str | None,
        model: str | None,
    ) -> AsyncIterator[str]:
        preamble = self._catalog.render_turn(
            user_message,
            tool_events,
            attachments,
            workspace_root=self._settings.workspace_root,
            focus=focus,
            on_instruction_read=lambda path: self._record_file_read(
                self._settings.workspace_root, conversation_id, path,
            ),
        )
        if self._offline_reply is not None:
            async for chunk in self._offline_stream(self._offline_reply):
                yield chunk
            return

        connection = None
        if connection_id:
            connection = self._connections.get(connection_id)
        if connection is None:
            connection = self._connections.effective()
        if connection is None or not connection.secret:
            raise LlmError(ChatErrorCode.MODEL_NOT_CONFIGURED, "no model connection configured")

        messages: list[dict[str, str]] = [{"role": "system", "content": preamble}]
        for node in history:
            role = "user" if node["role"] == "USER" else "assistant"
            messages.append({"role": role, "content": node["text"]})
        messages.append({"role": "user", "content": user_message})
        def read_source(path: str) -> str:
            result = self._tools.run("code_sources", session_id=conversation_id, target_path=path)
            if not result["ok"]:
                return str(result["code"])
            self._record_file_read(self._settings.workspace_root, conversation_id, result["path"])
            return str(result["summary"])

        options = {"read_source": read_source} if allow_source_tools and connection.wire_api == "chat-completions" else {}
        async for delta in self._stream_completion(connection, messages, model=model, **options):
            yield delta

    async def _notify_session_terminal(self, state: ExecutionState, status: str) -> None:
        """Publish a session notify for terminal turns. Focus filtering is client-side."""
        if self._notify_hub is None:
            return
        if status not in {"SUCCEEDED", "FAILED", "UNKNOWN"}:
            return
        severity = "info" if status == "SUCCEEDED" else "error"
        title = "会话已更新" if status == "SUCCEEDED" else "会话执行异常"
        text = f"conversation {state.conversation_id} ended with {status}"
        await self._notify_hub.publish(
            kind="session",
            severity=severity,
            code=f"CHAT_TURN_{status}",
            title=title,
            text=text,
            target={"conversationId": state.conversation_id},
        )

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
