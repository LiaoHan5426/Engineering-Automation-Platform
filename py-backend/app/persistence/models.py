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
    model_history_floor: int = Field(default=0)
    working_memory_json: str = Field(default="")
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
    install_spec: str = Field(default="")
    installed_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class BoardTaskRow(SQLModel, table=True):
    __tablename__ = "board_task"

    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    title: str
    column: str
    notes: str = Field(default="")
    session_id: str = Field(default="")
    revision: int = Field(default=1)
    events_json: str = Field(default='["created"]')
    priority: str = Field(default="none")
    goal: str = Field(default="")
    acceptance_criteria: str = Field(default="")
    execution_active: bool = Field(default=False)
    prototype_version_id: str | None = Field(default=None)
    preparation_issues_json: str = Field(default="[]")
    allowed_columns_json: str = Field(default="[]")
    create_request_id: str | None = Field(default=None, index=True)
    create_fingerprint: str = Field(default="")
    created_at: datetime = Field(default_factory=utc_now)


class GitExecutionRow(SQLModel, table=True):
    """One finished argv git observation. Not a second chat execution."""

    __tablename__ = "git_execution"

    id: str = Field(primary_key=True)
    request_id: str = Field(index=True)
    operation: str = Field(index=True)
    status: str
    workspace_path: str = Field(default="")
    executable: str = Field(default="")
    command_json: str = Field(default="[]")
    exit_code: int | None = Field(default=None)
    stdout: str = Field(default="")
    stderr: str = Field(default="")
    truncated: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = Field(default=None)
