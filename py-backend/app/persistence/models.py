from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ConversationRow(SQLModel, table=True):
    __tablename__ = "conversation"

    id: str = Field(primary_key=True)
    workspace_label: str = Field(default="ws-local")
    memory: str = Field(default="")
    connection_id: str | None = Field(default=None)
    model: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class ChatMessageRow(SQLModel, table=True):
    """Linear chain in MVP; parent_id / sibling_index reserved for CT-02 branching."""

    __tablename__ = "chat_message"

    id: str = Field(primary_key=True)
    conversation_id: str = Field(index=True)
    role: str
    content: str
    parent_id: str | None = Field(default=None, index=True)
    sibling_index: int = Field(default=0)
    version: int = Field(default=1)
    sequence: int = Field(default=0)
    execution_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class ChatExecutionRow(SQLModel, table=True):
    """Reserved for CT-01 persistence; hot path may still use in-memory journal."""

    __tablename__ = "chat_execution"

    id: str = Field(primary_key=True)
    conversation_id: str = Field(index=True)
    status: str = Field(default="CREATED")
    complete: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ChatExecutionEventRow(SQLModel, table=True):
    __tablename__ = "chat_execution_event"

    id: str = Field(primary_key=True)
    execution_id: str = Field(index=True)
    sequence: int
    event_type: str
    status: str = Field(default="")
    text: str = Field(default="")
    code: str = Field(default="")
    payload_json: str = Field(default="")
    occurred_at: datetime = Field(default_factory=utc_now)


class PluginInstallRow(SQLModel, table=True):
    """Server-authoritative install/enable for DSH-shaped packages."""

    __tablename__ = "plugin_install"

    name: str = Field(primary_key=True)
    version: str
    enabled: bool = Field(default=False)
    install_path: str
    client_entry: str = Field(default="")
    package_json: str = Field(default="")
    installed_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
