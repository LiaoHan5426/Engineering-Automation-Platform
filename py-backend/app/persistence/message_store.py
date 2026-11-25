from __future__ import annotations

import json
import uuid
from typing import Any

from sqlmodel import Session, select

from app.persistence.models import ChatMessageRow, ConversationRow
from app.services.working_memory import apply_edit, snapshot_from_json


class MessageStore:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_conversation(
        self,
        *,
        connection_id: str | None,
        model: str | None,
        workspace_label: str = "ws-local",
    ) -> dict[str, Any]:
        conversation_id = f"conv-{uuid.uuid4().hex[:12]}"
        row = ConversationRow(
            id=conversation_id,
            workspace_label=workspace_label,
            memory="server-owned graph (thin MVP)",
            connection_id=connection_id,
            model=model,
        )
        self._session.add(row)
        self._session.flush()
        return self.to_conversation(row)

    def get_conversation(self, conversation_id: str) -> ConversationRow | None:
        return self._session.get(ConversationRow, conversation_id)

    def model_history(self, conversation_id: str) -> dict[str, int] | None:
        row = self.get_conversation(conversation_id)
        if row is None:
            return None
        floor = row.model_history_floor
        messages = list(
            self._session.exec(
                select(ChatMessageRow).where(ChatMessageRow.conversation_id == conversation_id)
            ).all()
        )
        visible = [item for item in messages if item.sequence > floor]
        return {"messages": len(visible), "chars": sum(len(item.content) for item in visible)}

    def clear_model_history(self, conversation_id: str) -> bool:
        row = self.get_conversation(conversation_id)
        if row is None:
            return False
        messages = list(
            self._session.exec(
                select(ChatMessageRow).where(ChatMessageRow.conversation_id == conversation_id)
            ).all()
        )
        row.model_history_floor = max((item.sequence for item in messages), default=0)
        self._session.add(row)
        return True

    def to_conversation(self, row: ConversationRow) -> dict[str, Any]:
        return {
            "conversationId": row.id,
            "workspaceLabel": row.workspace_label,
            "memory": row.memory,
            "connectionId": row.connection_id,
            "model": row.model,
            "workingMemory": snapshot_from_json(row.working_memory_json),
        }

    def put_working_memory(self, conversation_id: str, body: dict[str, Any]) -> dict[str, Any] | None:
        row = self.get_conversation(conversation_id)
        if row is None:
            return None
        current = snapshot_from_json(row.working_memory_json)
        updated = apply_edit(current, body)
        row.working_memory_json = json.dumps(updated, ensure_ascii=False)
        self._session.add(row)
        return updated

    def tip(self, conversation_id: str) -> ChatMessageRow | None:
        rows = self._session.exec(
            select(ChatMessageRow)
            .where(ChatMessageRow.conversation_id == conversation_id)
            .order_by(ChatMessageRow.sequence.desc())
        ).all()
        return rows[0] if rows else None

    def next_sequence(self, conversation_id: str) -> int:
        tip = self.tip(conversation_id)
        return (tip.sequence + 1) if tip else 1

    def append(
        self,
        conversation_id: str,
        *,
        role: str,
        content: str,
        parent_id: str | None,
        execution_id: str | None = None,
    ) -> ChatMessageRow:
        sequence = self.next_sequence(conversation_id)
        row = ChatMessageRow(
            id=f"msg-{uuid.uuid4().hex[:12]}",
            conversation_id=conversation_id,
            role=role,
            content=content,
            parent_id=parent_id,
            sibling_index=0,
            version=1,
            sequence=sequence,
            execution_id=execution_id,
        )
        self._session.add(row)
        self._session.flush()
        return row

    def graph(self, conversation_id: str, leaf_id: str | None = None) -> dict[str, Any]:
        rows = list(
            self._session.exec(
                select(ChatMessageRow)
                .where(ChatMessageRow.conversation_id == conversation_id)
                .order_by(ChatMessageRow.sequence.asc())
            ).all()
        )
        nodes = [self._to_node(row) for row in rows]
        by_id = {node["id"]: node for node in nodes}
        if leaf_id and leaf_id in by_id:
            path: list[dict[str, Any]] = []
            current: dict[str, Any] | None = by_id[leaf_id]
            while current is not None:
                path.append(current)
                parent = current["parentId"]
                current = by_id.get(parent) if parent else None
            path.reverse()
        else:
            path = nodes
        return {
            "conversationId": conversation_id,
            "path": path,
            "all": nodes,
        }

    @staticmethod
    def _to_node(row: ChatMessageRow) -> dict[str, Any]:
        return {
            "id": row.id,
            "parentId": row.parent_id,
            "role": row.role,
            "version": row.version,
            "text": row.content,
            "thinking": None,
            "citations": None,
            "executionId": row.execution_id,
            "sequence": row.sequence,
        }
