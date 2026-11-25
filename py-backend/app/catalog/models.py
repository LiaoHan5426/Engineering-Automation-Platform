from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.persistence.models import utc_now


class KnowledgeBaseRow(SQLModel, table=True):
    __tablename__ = "knowledge_base"

    id: str = Field(primary_key=True)
    name: str
    description: str = Field(default="")
    created_at: datetime = Field(default_factory=utc_now)


class KnowledgeDocumentRow(SQLModel, table=True):
    __tablename__ = "knowledge_document"

    id: str = Field(primary_key=True)
    base_id: str = Field(index=True)
    title: str
    content: str = Field(default="")
    content_hash: str = Field(default="")
    created_at: datetime = Field(default_factory=utc_now)


class RulePackRow(SQLModel, table=True):
    __tablename__ = "rule_pack"

    id: str = Field(primary_key=True)
    name: str
    description: str = Field(default="")
    manifest: str = Field(default="")
    rule_count: int = Field(default=0)
    shipped: bool = Field(default=False)
    enabled: bool = Field(default=True)
    revision: int = Field(default=1)
    updated_at: datetime = Field(default_factory=utc_now)


class SkillRow(SQLModel, table=True):
    __tablename__ = "skill"

    id: str = Field(primary_key=True)
    version: str = Field(primary_key=True)
    description: str = Field(default="")
    instructions: str = Field(default="")
    raw_skill_md: str = Field(default="")
    digest: str
    source_label: str = Field(default="")
    resources_json: str = Field(default="[]")
    required_json: str = Field(default="[]")
    enabled: bool = Field(default=False)
    state_revision: int = Field(default=1)
    created_at: datetime = Field(default_factory=utc_now)


class ExpertRow(SQLModel, table=True):
    __tablename__ = "expert"

    id: str = Field(primary_key=True)
    name: str
    manifest: str
    enabled: bool = Field(default=False)
    builtin: bool = Field(default=False)
    revision: int = Field(default=1)
    updated_at: datetime = Field(default_factory=utc_now)


class DatabaseProfileRow(SQLModel, table=True):
    __tablename__ = "database_profile"

    id: str = Field(primary_key=True)
    label: str
    engine: str
    environment: str
    metadata_json: str = Field(default="{}")
    updated_at: datetime = Field(default_factory=utc_now)


class McpServerRow(SQLModel, table=True):
    __tablename__ = "mcp_server"

    id: str = Field(primary_key=True)
    name: str
    transport: str
    endpoint: str
    tools_json: str = Field(default="[]")
    trusted: bool = Field(default=False)
    enabled: bool = Field(default=False)
    updated_at: datetime = Field(default_factory=utc_now)


class ScenarioRow(SQLModel, table=True):
    __tablename__ = "scenario"

    id: str = Field(primary_key=True)
    revision: int = Field(default=1)
    definition_json: str
    updated_at: datetime = Field(default_factory=utc_now)
