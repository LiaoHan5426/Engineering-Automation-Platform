"""SQLModel adapter for conversation history and turn writes."""

from datetime import timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.domain.errors import ChatErrorCode
from app.persistence.message_store import MessageStore
from app.persistence.models import ChatMessageRow, ConversationRow


class SqlChatConversations:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def open_conversation(self, connection_id: str | None, model: str | None) -> dict[str, Any]:
        with Session(self._engine) as session:
            item = MessageStore(session).create_conversation(connection_id=connection_id, model=model)
            session.commit()
            return item

    def session_history(self, conversation_id: str) -> tuple[int, list[dict[str, Any]]] | None:
        with Session(self._engine) as session:
            conversation = session.get(ConversationRow, conversation_id)
            if conversation is None:
                return None
            rows = session.exec(
                select(ChatMessageRow)
                .where(ChatMessageRow.conversation_id == conversation_id)
                .order_by(ChatMessageRow.sequence)
            )
            created_at = int(conversation.created_at.replace(tzinfo=timezone.utc).timestamp() * 1000)
            return created_at, [
                {
                    "id": row.id,
                    "role": row.role,
                    "text": row.content,
                    "time": int(row.created_at.replace(tzinfo=timezone.utc).timestamp() * 1000),
                    "provider": conversation.connection_id,
                    "model": conversation.model,
                }
                for row in rows
            ]

    def workspace_sessions(self, workspace_id: str) -> list[tuple[str, str]]:
        with Session(self._engine) as session:
            rows = session.exec(
                select(ConversationRow)
                .where(ConversationRow.workspace_label == workspace_id)
                .order_by(ConversationRow.created_at, ConversationRow.id)
            )
            return [(row.id, row.created_at.replace(tzinfo=timezone.utc).isoformat()) for row in rows]

    def session_summaries(self, workspace_id: str) -> list[tuple[str, int, int, str | None, str | None, str | None]]:
        last_message = (
            select(func.max(ChatMessageRow.created_at))
            .where(ChatMessageRow.conversation_id == ConversationRow.id)
            .correlate(ConversationRow)
            .scalar_subquery()
        )
        message_count = (
            select(func.count(ChatMessageRow.id))
            .where(ChatMessageRow.conversation_id == ConversationRow.id)
            .correlate(ConversationRow)
            .scalar_subquery()
        )
        first_user_message = (
            select(ChatMessageRow.content)
            .where(ChatMessageRow.conversation_id == ConversationRow.id, ChatMessageRow.role == "USER")
            .order_by(ChatMessageRow.sequence)
            .limit(1)
            .correlate(ConversationRow)
            .scalar_subquery()
        )
        with Session(self._engine) as session:
            rows = session.exec(
                select(ConversationRow, last_message, message_count, first_user_message)
                .where(ConversationRow.workspace_label == workspace_id)
                .order_by(ConversationRow.created_at.desc(), ConversationRow.id)
            )
            return [
                (
                    row.id,
                    int((last or row.created_at).replace(tzinfo=timezone.utc).timestamp() * 1000),
                    count,
                    row.connection_id,
                    row.model,
                    first,
                )
                for row, last, count, first in rows
            ]

    def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        with Session(self._engine) as session:
            store = MessageStore(session)
            row = store.get_conversation(conversation_id)
            return store.to_conversation(row) if row else None

    def put_working_memory(self, conversation_id: str, body: dict[str, Any]) -> dict[str, Any]:
        with Session(self._engine) as session:
            updated = MessageStore(session).put_working_memory(conversation_id, body)
            if updated is None:
                raise LookupError(ChatErrorCode.UNKNOWN_CONVERSATION)
            session.commit()
            return updated

    def graph(self, conversation_id: str, leaf_id: str | None = None) -> dict[str, Any] | None:
        with Session(self._engine) as session:
            store = MessageStore(session)
            if store.get_conversation(conversation_id) is None:
                return None
            return store.graph(conversation_id, leaf_id)

    def model_history(self, conversation_id: str) -> dict[str, int] | None:
        with Session(self._engine) as session:
            return MessageStore(session).model_history(conversation_id)

    def clear_model_history(self, conversation_id: str) -> bool:
        with Session(self._engine) as session:
            cleared = MessageStore(session).clear_model_history(conversation_id)
            session.commit()
            return cleared

    def summary_context(self, conversation_id: str) -> tuple[dict[str, int], str | None, list[dict[str, Any]]] | None:
        with Session(self._engine) as session:
            store = MessageStore(session)
            usage = store.model_history(conversation_id)
            row = store.get_conversation(conversation_id)
            if usage is None or row is None:
                return None
            floor = row.model_history_floor
            model = row.model
            visible = [
                node
                for node in store.graph(conversation_id)["path"]
                if int(node["sequence"]) > floor
            ]
            return usage, model, visible

    def turn_context(self, conversation_id: str) -> tuple[list[dict[str, Any]], str | None, str | None] | None:
        with Session(self._engine) as session:
            store = MessageStore(session)
            conversation = store.get_conversation(conversation_id)
            if conversation is None:
                return None
            history_nodes = store.graph(conversation_id)["path"]
            connection_id = conversation.connection_id
            model = conversation.model
            return history_nodes, connection_id, model

    def persist_pair(
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
