from __future__ import annotations

import hashlib
import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlmodel import Session, or_, select

from app.agent.turn import TurnBrief, TurnSource
from app.agent.workspace_instructions import load_project_instructions
from app.catalog.models import (
    DatabaseProfileRow,
    ExpertRow,
    KnowledgeBaseRow,
    KnowledgeDocumentRow,
    McpServerRow,
    RulePackRow,
    ScenarioRow,
    SkillRow,
)
from app.persistence.db import session_scope

_SECRET_KEYS = frozenset(
    {"password", "passwd", "secret", "token", "apikey", "api_key", "connectionstring"}
)
_SCENARIO_STATUSES = frozenset({"partial", "missing", "disabled"})
_SCENARIO_MODES = frozenset({"code", "work"})
_DEPENDENCY_STATES = frozenset({"installed", "missing", "unconfigured", "denied"})
_BUILTIN_TOOLS = {
    "git_status": "工作区 git status（argv，只读）。",
    "sidebar_open": "打开已安装插件贡献的侧栏（Host 桥，服务端）。",
}


def trusted_tools() -> dict[str, Any]:
    """Registered argv tools. This GET does not probe versions."""
    git = shutil.which("git")
    item = {
        "id": "git_status",
        "programId": "git",
        "operationId": "git-status",
        "title": "git status",
        "kind": "builtin",
        "scope": "platform",
        "readOnly": True,
        "enabled": True,
        "invocation": "argv",
        "summary": "工作区 git status --porcelain=v1，只读。",
        "bindingStatus": "ready" if git else "missing_binary",
        "bindingSource": "path",
        "binary": "git",
        "resolvedPath": git,
        "versionStatus": "unknown",
    }
    return {
        "items": [item],
        "programs": [],
        "source": "py-backend",
        "probeCache": {"cached": 0, "known": 0, "failed": 0},
    }


def data_layout(settings) -> dict[str, Any]:
    pairs = [
        ("db", settings.db_path, "SQLite 对话与目录"),
        ("config", settings.config_dir, "模型连接等本机配置"),
        ("plugins", settings.plugins_root, "已安装插件"),
        ("logs", settings.eap_home / "logs", "本机日志"),
        ("tasks", settings.eap_home / "tasks", "任务目录"),
        ("workspace", settings.workspace_root, "工具与 git 的工作区根"),
    ]
    entries = []
    by_kind = {"file": 0, "directory": 0, "missing": 0, "other": 0}
    for logical, path, note in pairs:
        resolved = path.resolve()
        if resolved.is_dir():
            kind = "directory"
            exists = True
        elif resolved.is_file():
            kind = "file"
            exists = True
        elif not resolved.exists():
            kind = "missing"
            exists = False
        else:
            kind = "other"
            exists = True
        by_kind[kind] += 1
        entry: dict[str, Any] = {
            "logical": logical,
            "resolved": str(resolved),
            "exists": exists,
            "note": note,
            "kind": kind,
        }
        if kind == "file":
            entry["byteSize"] = resolved.stat().st_size
        entries.append(entry)
    present = sum(1 for entry in entries if entry["exists"])
    missing = len(entries) - present
    return {
        "entries": entries,
        "physicalMigration": False,
        "inventory": {
            "present": present,
            "missing": missing,
            "total": len(entries),
            "byKind": by_kind,
        },
        "migrationReadiness": {
            "status": "not_requested",
            "physicalMigration": False,
            "approved": False,
            "note": "本机目录只做观察，不执行搬迁。",
            "candidates": [],
            "candidateCounts": {"present": 0, "absent": 0, "total": 0},
        },
    }


class CatalogError(Exception):
    def __init__(self, code: str, detail: str, status: int = 400) -> None:
        self.code = code
        self.detail = detail
        self.status = status
        super().__init__(detail)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _loads(raw: str, fallback: Any) -> Any:
    try:
        return json.loads(raw) if raw else fallback
    except json.JSONDecodeError:
        return fallback


def _rule_count(manifest: str) -> int:
    parsed = _loads(manifest, None)
    if isinstance(parsed, dict) and isinstance(parsed.get("rules"), list):
        return len(parsed["rules"])
    return 0


def parse_skill_md(raw: str) -> tuple[str, str, str]:
    text = raw.strip()
    if not text:
        raise CatalogError("INVALID_SKILL", "skill markdown is empty")
    name = ""
    description = ""
    body = text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end < 0:
            raise CatalogError("INVALID_SKILL", "skill front matter is not closed")
        front = text[3:end]
        body = text[end + 4 :].strip()
        for line in front.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip().strip("\"'")
            if key in {"name", "id"} and value:
                name = value
            elif key == "description":
                description = value
    if not name:
        for line in body.splitlines():
            if line.startswith("# "):
                name = line[2:].strip()
                break
    if not name or not body:
        raise CatalogError("INVALID_SKILL", "skill needs a name and a body")
    slug = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")
    return slug or name, description, body


class CatalogService:
    def __init__(self, engine, *, builtin_tools: dict[str, str] | None = None) -> None:
        self._engine = engine
        self._builtin = dict(builtin_tools or _BUILTIN_TOOLS)

    def capabilities(self) -> dict[str, Any]:
        items = [self._capability_item(name, summary) for name, summary in self._builtin.items()]
        names = [item["name"] for item in items]
        kinds = [
            {
                "id": "builtin",
                "label": "内置命令",
                "description": "进程内注册、argv 执行的只读命令。",
                "count": len(items),
                "scope": "platform",
                "scopeLabel": "平台",
                "expertScoped": False,
                "management": items[0]["management"] if items else _management(),
                "manageable": False,
                "visible": bool(items),
                "availability": {"available": len(items), "total": len(items)},
            }
        ]
        mcp = self.mcp_servers()["items"]
        return {
            "items": items,
            "kinds": kinds,
            "capabilities": names,
            "globallyUsable": names,
            "disabledPlatform": [],
            "expertScoped": [],
            "platformScoped": names,
            "expertScopedVocabulary": [],
            "mcpServers": mcp,
            "settings": {},
            "disabledCapabilities": [],
            "declared": names,
            "unregistered": [],
            "undeclared": [],
        }

    def stats(self, window_days: int) -> dict[str, Any]:
        if window_days < 1 or window_days > 366:
            raise CatalogError("INVALID_WINDOW", "windowDays must be 1..366")
        return {
            "windowDays": window_days,
            "tasksTotal": 0,
            "tasksInWindow": 0,
            "observationsInWindow": 0,
            "byStatus": {},
            "byDecision": {},
            "model": {"recordedRuns": 0, "calls": 0, "share": None},
            "deterministicShare": None,
            "source": "py-backend",
            "note": "尚无任务表记录；没有运行记录时不把占比写成 0。",
        }

    def list_knowledge(self) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            bases = session.exec(select(KnowledgeBaseRow)).all()
            items = []
            for base in bases:
                docs = session.exec(
                    select(KnowledgeDocumentRow).where(KnowledgeDocumentRow.base_id == base.id)
                ).all()
                items.append(
                    {
                        "id": base.id,
                        "name": base.name,
                        "description": base.description,
                        "documents": len(docs),
                    }
                )
            return {"items": items}

    def create_knowledge_base(self, name: str, description: str) -> dict[str, Any]:
        _require_text(name, "INVALID_KNOWLEDGE", "name is required")
        row = KnowledgeBaseRow(id=str(uuid.uuid4()), name=name.strip(), description=description or "")
        with session_scope(self._engine) as session:
            session.add(row)
        return {"id": row.id, "name": row.name, "description": row.description, "documents": 0}

    def rename_knowledge_base(self, base_id: str, name: str, description: str) -> dict[str, Any]:
        _require_text(name, "INVALID_KNOWLEDGE", "name is required")
        with session_scope(self._engine) as session:
            row = session.get(KnowledgeBaseRow, base_id)
            if row is None:
                raise CatalogError("UNKNOWN_KNOWLEDGE_BASE", "knowledge base not found", 404)
            row.name = name.strip()
            row.description = description or ""
            session.add(row)
            count = len(
                session.exec(
                    select(KnowledgeDocumentRow).where(KnowledgeDocumentRow.base_id == base_id)
                ).all()
            )
            return {
                "id": row.id,
                "name": row.name,
                "description": row.description,
                "documents": count,
            }

    def delete_knowledge_base(self, base_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(KnowledgeBaseRow, base_id)
            if row is None:
                raise CatalogError("UNKNOWN_KNOWLEDGE_BASE", "knowledge base not found", 404)
            docs = session.exec(
                select(KnowledgeDocumentRow).where(KnowledgeDocumentRow.base_id == base_id)
            ).all()
            for doc in docs:
                session.delete(doc)
            session.delete(row)
        return {"id": base_id, "status": "DELETED"}

    def list_documents(self, base_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            self._require_base(session, base_id)
            docs = session.exec(
                select(KnowledgeDocumentRow).where(KnowledgeDocumentRow.base_id == base_id)
            ).all()
            return {
                "items": [
                    {"id": doc.id, "title": doc.title, "content": doc.content} for doc in docs
                ]
            }

    def add_document(self, base_id: str, title: str, content: str) -> dict[str, Any]:
        _require_text(title, "INVALID_KNOWLEDGE", "title is required")
        with session_scope(self._engine) as session:
            self._require_base(session, base_id)
            doc = KnowledgeDocumentRow(
                id=str(uuid.uuid4()),
                base_id=base_id,
                title=title.strip(),
                content=content or "",
                content_hash=_hash(content or ""),
            )
            session.add(doc)
            return {"id": doc.id, "title": doc.title, "content": doc.content, "hash": doc.content_hash}

    def update_document(
        self, base_id: str, document_id: str, title: str, content: str, expected_hash: str
    ) -> dict[str, Any]:
        _require_text(title, "INVALID_KNOWLEDGE", "title is required")
        with session_scope(self._engine) as session:
            doc = session.get(KnowledgeDocumentRow, document_id)
            if doc is None or doc.base_id != base_id:
                raise CatalogError("UNKNOWN_DOCUMENT", "document not found", 404)
            if expected_hash and expected_hash != doc.content_hash:
                raise CatalogError("DOCUMENT_CONFLICT", "document hash does not match", 409)
            doc.title = title.strip()
            doc.content = content or ""
            doc.content_hash = _hash(doc.content)
            session.add(doc)
            return {"id": doc.id, "title": doc.title, "content": doc.content, "hash": doc.content_hash}

    def delete_document(self, base_id: str, document_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            doc = session.get(KnowledgeDocumentRow, document_id)
            if doc is None or doc.base_id != base_id:
                raise CatalogError("UNKNOWN_DOCUMENT", "document not found", 404)
            session.delete(doc)
        return {"id": document_id, "status": "DELETED"}

    def search_knowledge(self, query: str, base_id: str | None) -> dict[str, Any]:
        raw = (query or "").strip().replace("%", "").replace("_", "")
        tokens = [token for token in re.split(r"\W+", raw) if len(token) >= 3][:8]
        if not tokens:
            return {"items": []}
        with session_scope(self._engine) as session:
            clauses = []
            for token in tokens:
                clauses.append(KnowledgeDocumentRow.title.contains(token))
                clauses.append(KnowledgeDocumentRow.content.contains(token))
            docs = session.exec(select(KnowledgeDocumentRow).where(or_(*clauses))).all()
            ranked: list[tuple[int, KnowledgeDocumentRow]] = []
            for doc in docs:
                if base_id and doc.base_id != base_id:
                    continue
                haystack = f"{doc.title}\n{doc.content}".lower()
                score = sum(1 for token in tokens if token.lower() in haystack)
                ranked.append((score, doc))
            ranked.sort(key=lambda item: item[0], reverse=True)
            items = [
                {
                    "baseId": doc.base_id,
                    "documentId": doc.id,
                    "title": doc.title,
                    "excerpt": doc.content[:500],
                }
                for _, doc in ranked[:5]
            ]
            return {"items": items, "query": raw}

    def list_rule_packs(self) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            rows = session.exec(select(RulePackRow)).all()
            return {"items": [self._rule_summary(row) for row in rows]}

    def get_rule_pack(self, pack_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(RulePackRow, pack_id)
            if row is None:
                raise CatalogError("UNKNOWN_RULE_PACK", "rule pack not found", 404)
            return {
                "manifest": row.manifest,
                "shipped": row.shipped,
                "editable": not row.shipped,
                "requirements": {"declared": [], "derived": []},
            }

    def create_rule_pack(self, name: str, manifest: str) -> dict[str, Any]:
        _require_text(name, "INVALID_RULE_PACK", "name is required")
        _require_text(manifest, "INVALID_RULE_PACK", "manifest is required")
        pack_id = _manifest_id(manifest) or str(uuid.uuid4())
        with session_scope(self._engine) as session:
            if session.get(RulePackRow, pack_id) is not None:
                raise CatalogError("RULE_PACK_EXISTS", "rule pack id already exists", 409)
            row = RulePackRow(
                id=pack_id,
                name=name.strip(),
                manifest=manifest,
                rule_count=_rule_count(manifest),
            )
            session.add(row)
            return {"id": row.id, "revision": row.revision, "enabled": row.enabled}

    def update_rule_pack(self, pack_id: str, name: str, manifest: str) -> dict[str, Any]:
        _require_text(name, "INVALID_RULE_PACK", "name is required")
        _require_text(manifest, "INVALID_RULE_PACK", "manifest is required")
        declared = _manifest_id(manifest)
        if declared and declared != pack_id:
            raise CatalogError("INVALID_RULE_PACK", "manifest id does not match the path")
        with session_scope(self._engine) as session:
            row = session.get(RulePackRow, pack_id)
            if row is None:
                raise CatalogError("UNKNOWN_RULE_PACK", "rule pack not found", 404)
            if row.shipped:
                raise CatalogError("RULE_PACK_READ_ONLY", "shipped rule pack cannot be edited", 409)
            row.name = name.strip()
            row.manifest = manifest
            row.rule_count = _rule_count(manifest)
            row.revision += 1
            row.updated_at = _now()
            session.add(row)
            return {"id": row.id, "revision": row.revision, "enabled": row.enabled}

    def set_rule_activation(self, pack_id: str, enabled: bool) -> dict[str, Any]:
        if not isinstance(enabled, bool):
            raise CatalogError("INVALID_RULE_PACK", "enabled must be boolean")
        with session_scope(self._engine) as session:
            row = session.get(RulePackRow, pack_id)
            if row is None:
                raise CatalogError("UNKNOWN_RULE_PACK", "rule pack not found", 404)
            row.enabled = enabled
            row.revision += 1
            row.updated_at = _now()
            session.add(row)
            return {"id": row.id, "revision": row.revision, "enabled": row.enabled}

    def delete_rule_pack(self, pack_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(RulePackRow, pack_id)
            if row is None:
                raise CatalogError("UNKNOWN_RULE_PACK", "rule pack not found", 404)
            if row.shipped:
                raise CatalogError("RULE_PACK_READ_ONLY", "shipped rule pack cannot be deleted", 409)
            experts = session.exec(select(ExpertRow).where(ExpertRow.enabled == True)).all()  # noqa: E712
            blockers = [expert.id for expert in experts if pack_id in expert.manifest]
            if blockers:
                raise CatalogError(
                    "RULE_PACK_IN_USE",
                    "enabled experts still reference this pack",
                    409,
                )
            session.delete(row)
        return {"id": pack_id, "status": "DELETED"}

    def validate_rule_pack(self, manifest: str) -> dict[str, Any]:
        if not isinstance(manifest, str) or not manifest.strip():
            return {"valid": False, "errors": ["manifest is required"]}
        return {"valid": True, "errors": [], "requirements": {"declared": [], "derived": []}}

    def list_databases(self) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            rows = session.exec(select(DatabaseProfileRow)).all()
            return {
                "items": [
                    {
                        "id": row.id,
                        "label": row.label,
                        "engine": row.engine,
                        "environment": row.environment,
                        "credentialsExposed": False,
                    }
                    for row in rows
                ],
                "policy": "只登记结构说明，不保存数据库口令。",
            }

    def get_database(self, profile_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(DatabaseProfileRow, profile_id)
            if row is None:
                raise CatalogError("UNKNOWN_DATABASE", "database profile not found", 404)
            return {
                "id": row.id,
                "label": row.label,
                "engine": row.engine,
                "environment": row.environment,
                "metadata": _loads(row.metadata_json, {}),
            }

    def save_database(
        self, profile_id: str | None, label: str, engine: str, environment: str, metadata: Any
    ) -> dict[str, Any]:
        _require_text(label, "INVALID_DATABASE", "label is required")
        _require_text(engine, "INVALID_DATABASE", "engine is required")
        _require_text(environment, "INVALID_DATABASE", "environment is required")
        if not isinstance(metadata, dict):
            raise CatalogError("INVALID_DATABASE", "metadata must be an object")
        _reject_secrets(metadata)
        with session_scope(self._engine) as session:
            if profile_id:
                row = session.get(DatabaseProfileRow, profile_id)
                if row is None:
                    raise CatalogError("UNKNOWN_DATABASE", "database profile not found", 404)
            else:
                row = DatabaseProfileRow(
                    id=str(uuid.uuid4()),
                    label=label.strip(),
                    engine=engine.strip(),
                    environment=environment.strip(),
                )
            row.label = label.strip()
            row.engine = engine.strip()
            row.environment = environment.strip()
            row.metadata_json = json.dumps(metadata, ensure_ascii=False)
            row.updated_at = _now()
            session.add(row)
            return {"id": row.id, "label": row.label, "engine": row.engine, "environment": row.environment}

    def delete_database(self, profile_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(DatabaseProfileRow, profile_id)
            if row is None:
                raise CatalogError("UNKNOWN_DATABASE", "database profile not found", 404)
            session.delete(row)
        return {"id": profile_id, "status": "DELETED"}

    def list_experts(self) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            rows = session.exec(select(ExpertRow)).all()
            return {
                "items": [row.manifest for row in rows],
                "states": {
                    row.id: {
                        "enabled": row.enabled,
                        "builtin": row.builtin,
                        "revision": row.revision,
                    }
                    for row in rows
                },
            }

    def expert_catalog(self) -> dict[str, Any]:
        caps = self.capabilities()
        packs = self.list_rule_packs()["items"]
        return {
            "capabilities": caps["capabilities"],
            "capabilityItems": caps["items"],
            "capabilityKinds": caps["kinds"],
            "platformScoped": caps["platformScoped"],
            "disabledPlatform": caps["disabledPlatform"],
            "expertScoped": caps["expertScoped"],
            "expertScopedVocabulary": caps["expertScopedVocabulary"],
            "mcpServers": caps["mcpServers"],
            "rules": [pack["id"] for pack in packs if pack["enabled"]],
            "rulePacks": packs,
        }

    def validate_expert(self, expert_id: str, name: str, manifest: str) -> dict[str, Any]:
        errors = _expert_errors(expert_id, name, manifest)
        return {"valid": not errors, "errors": errors}

    def save_expert(self, expert_id: str, name: str, manifest: str) -> dict[str, Any]:
        errors = _expert_errors(expert_id, name, manifest)
        if errors:
            raise CatalogError("INVALID_EXPERT", "; ".join(errors))
        with session_scope(self._engine) as session:
            row = session.get(ExpertRow, expert_id)
            if row is None:
                row = ExpertRow(id=expert_id, name=name.strip(), manifest=manifest, revision=1)
            else:
                row.name = name.strip()
                row.manifest = manifest
                row.revision += 1
                row.updated_at = _now()
            session.add(row)
            return {"id": row.id, "revision": row.revision, "enabled": row.enabled}

    def set_expert_activation(self, expert_id: str, enabled: bool) -> dict[str, Any]:
        if not isinstance(enabled, bool):
            raise CatalogError("INVALID_EXPERT", "enabled must be boolean")
        with session_scope(self._engine) as session:
            row = session.get(ExpertRow, expert_id)
            if row is None:
                raise CatalogError("UNKNOWN_EXPERT", "expert not found", 404)
            row.enabled = enabled
            row.revision += 1
            row.updated_at = _now()
            session.add(row)
            return {"id": row.id, "enabled": row.enabled, "revision": row.revision}

    def mcp_servers(self) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            rows = session.exec(select(McpServerRow)).all()
            return {"items": [self._mcp_item(row) for row in rows]}

    def save_mcp(self, body: dict[str, Any], *, server_id: str | None = None) -> dict[str, Any]:
        parsed = _mcp_body(body, server_id)
        with session_scope(self._engine) as session:
            row = session.get(McpServerRow, parsed["id"])
            if server_id and row is None:
                raise CatalogError("UNKNOWN_MCP_SERVER", "mcp server not found", 404)
            if row is None:
                row = McpServerRow(id=parsed["id"], name=parsed["name"], transport=parsed["transport"], endpoint=parsed["endpoint"])
            row.name = parsed["name"]
            row.transport = parsed["transport"]
            row.endpoint = parsed["endpoint"]
            row.tools_json = json.dumps(parsed["tools"])
            row.trusted = parsed["trusted"]
            row.enabled = parsed["enabled"]
            row.updated_at = _now()
            session.add(row)
            return self._mcp_item(row)

    def set_mcp_activation(self, server_id: str, enabled: bool, trusted: bool) -> dict[str, Any]:
        if not isinstance(enabled, bool) or not isinstance(trusted, bool):
            raise CatalogError("INVALID_MCP_SERVER", "enabled and trusted must be boolean")
        with session_scope(self._engine) as session:
            row = session.get(McpServerRow, server_id)
            if row is None:
                raise CatalogError("UNKNOWN_MCP_SERVER", "mcp server not found", 404)
            row.enabled = enabled
            row.trusted = trusted
            row.updated_at = _now()
            session.add(row)
            return self._mcp_item(row)

    def delete_mcp(self, server_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(McpServerRow, server_id)
            if row is None:
                raise CatalogError("UNKNOWN_MCP_SERVER", "mcp server not found", 404)
            session.delete(row)
        return {"id": server_id, "status": "DELETED"}

    def probe_mcp(self, server_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(McpServerRow, server_id)
            if row is None:
                raise CatalogError("UNKNOWN_MCP_SERVER", "mcp server not found", 404)
            return {
                "id": row.id,
                "checked": True,
                "transport": row.transport,
                "target": row.endpoint,
                "verified": False,
                "targetResolved": row.endpoint or None,
                "reachable": False,
                "message": "已登记，尚未用 MCP 协议客户端做 tools/list 校验。",
            }

    def list_skills(self) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            rows = session.exec(select(SkillRow)).all()
            return {"items": [self._skill_summary(session, row) for row in rows]}

    def preview_skill(self, body: dict[str, Any]) -> dict[str, Any]:
        return self._skill_snapshot(None, body, persist=False)

    def save_skill(self, body: dict[str, Any]) -> dict[str, Any]:
        if body.get("confirmed") is not True:
            raise CatalogError("INVALID_SKILL", "confirmed must be true")
        skill_input = body.get("input")
        if not isinstance(skill_input, dict):
            raise CatalogError("INVALID_SKILL", "input is required")
        raw = skill_input.get("rawSkillMd")
        if not isinstance(raw, str):
            raise CatalogError("INVALID_SKILL", "rawSkillMd is required")
        digest = _hash(raw)
        expected = body.get("expectedDigest")
        if expected != digest:
            raise CatalogError("SKILL_DIGEST_MISMATCH", "expectedDigest does not match rawSkillMd", 409)
        return self._skill_snapshot(digest, skill_input, persist=True)

    def get_skill(self, skill_id: str, version: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(SkillRow, (skill_id, version))
            if row is None:
                raise CatalogError("UNKNOWN_SKILL", "skill not found", 404)
            return self._skill_snapshot_from_row(session, row)

    def set_skill_activation(
        self, skill_id: str, version: str, enabled: bool, state_revision: int
    ) -> dict[str, Any]:
        if not isinstance(enabled, bool):
            raise CatalogError("INVALID_SKILL", "enabled must be boolean")
        if not isinstance(state_revision, int):
            raise CatalogError("INVALID_SKILL", "stateRevision must be an integer")
        with session_scope(self._engine) as session:
            row = session.get(SkillRow, (skill_id, version))
            if row is None:
                raise CatalogError("UNKNOWN_SKILL", "skill not found", 404)
            if row.state_revision != state_revision:
                raise CatalogError("SKILL_REVISION_CONFLICT", "skill revision does not match", 409)
            row.enabled = enabled
            row.state_revision += 1
            session.add(row)
            return self._skill_snapshot_from_row(session, row)

    def list_scenarios(self) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            rows = session.exec(select(ScenarioRow)).all()
            return {
                "items": [
                    {"id": row.id, "revision": row.revision, "definition": _loads(row.definition_json, {})}
                    for row in rows
                ]
            }

    def get_scenario(self, scenario_id: str) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(ScenarioRow, scenario_id)
            if row is None:
                raise CatalogError("UNKNOWN_SCENARIO", "scenario not found", 404)
            return {
                "id": row.id,
                "revision": row.revision,
                "definition": _loads(row.definition_json, {}),
            }

    def save_scenario(self, scenario_id: str, revision: int, definition: Any) -> dict[str, Any]:
        _validate_scenario(definition)
        if not isinstance(revision, int) or revision < 0:
            raise CatalogError("INVALID_SCENARIO", "revision must be a non-negative integer")
        with session_scope(self._engine) as session:
            row = session.get(ScenarioRow, scenario_id)
            if row is None:
                if revision not in (0, 1):
                    raise CatalogError("SCENARIO_CONFLICT", "scenario revision does not match", 409)
                row = ScenarioRow(
                    id=scenario_id,
                    revision=1,
                    definition_json=json.dumps(definition, ensure_ascii=False),
                )
            else:
                if row.revision != revision:
                    raise CatalogError("SCENARIO_CONFLICT", "scenario revision does not match", 409)
                row.revision += 1
                row.definition_json = json.dumps(definition, ensure_ascii=False)
                row.updated_at = _now()
            session.add(row)
            return {
                "id": row.id,
                "revision": row.revision,
                "definition": definition,
            }

    def delete_scenario(self, scenario_id: str, revision: int) -> dict[str, Any]:
        with session_scope(self._engine) as session:
            row = session.get(ScenarioRow, scenario_id)
            if row is None:
                raise CatalogError("UNKNOWN_SCENARIO", "scenario not found", 404)
            if row.revision != revision:
                raise CatalogError("SCENARIO_CONFLICT", "scenario revision does not match", 409)
            session.delete(row)
        return {"id": scenario_id, "status": "DELETED"}

    def render_turn(
        self,
        message: str,
        tool_events: list[dict[str, Any]],
        attachments: list[dict[str, Any]] | None = None,
        workspace_root: Path | None = None,
        focus: str | None = None,
    ) -> str:
        brief = TurnBrief()
        if workspace_root is not None:
            instructions = load_project_instructions(workspace_root, focus=focus)
            if instructions:
                brief.instructions.append(
                    TurnSource("workspace", "project", "instruction", instructions)
                )
        with session_scope(self._engine) as session:
            for pack in session.exec(select(RulePackRow).where(RulePackRow.enabled == True)).all():  # noqa: E712
                brief.constraints.append(
                    TurnSource("rule", pack.id, "constraint", _clip(pack.manifest, 1200))
                )
            for skill in session.exec(select(SkillRow).where(SkillRow.enabled == True)).all():  # noqa: E712
                brief.instructions.append(
                    TurnSource(
                        "skill",
                        f"{skill.id}@{skill.version}",
                        "instruction",
                        _clip(skill.instructions, 1200),
                    )
                )
            for server in session.exec(select(McpServerRow)).all():
                item = self._mcp_item(server)
                if not item["usable"]:
                    continue
                for tool in item["tools"]:
                    brief.tools.append(
                        TurnSource("mcp", server.id, "tool", f"{server.id}/{tool}")
                    )
        for hit in self.search_knowledge(message, None)["items"]:
            brief.evidence.append(
                TurnSource(
                    "knowledge",
                    hit["documentId"],
                    "evidence",
                    f"{hit['title']}: {hit['excerpt']}",
                )
            )
        for event in tool_events:
            summary = str(event.get("summary") or event.get("code") or "")
            if not summary:
                continue
            brief.evidence.append(
                TurnSource("capability", str(event.get("toolMode") or "tool"), "evidence", summary)
            )
        for item in (attachments or [])[:6]:
            name = item.get("name")
            content = item.get("content")
            if not isinstance(name, str) or not isinstance(content, str) or not name.strip():
                continue
            if "private key-----" in content.lower():
                continue
            brief.evidence.append(
                TurnSource("file", name.strip()[:120], "evidence", _clip(content, 1200))
            )
        return brief.render()

    def _skill_snapshot(self, digest: str | None, skill_input: dict[str, Any], *, persist: bool) -> dict[str, Any]:
        raw = skill_input.get("rawSkillMd")
        version = skill_input.get("version")
        if not isinstance(raw, str) or not isinstance(version, str) or not version.strip():
            raise CatalogError("INVALID_SKILL", "rawSkillMd and version are required")
        resources = skill_input.get("resources") or []
        required = skill_input.get("requiredCapabilities") or []
        if not isinstance(resources, list) or not isinstance(required, list):
            raise CatalogError("INVALID_SKILL", "resources and requiredCapabilities must be arrays")
        skill_id, description, instructions = parse_skill_md(raw)
        computed = digest or _hash(raw)
        source = skill_input.get("sourceLabel") if isinstance(skill_input.get("sourceLabel"), str) else ""
        row = SkillRow(
            id=skill_id,
            version=version.strip(),
            description=description,
            instructions=instructions,
            raw_skill_md=raw,
            digest=computed,
            source_label=source,
            resources_json=json.dumps(resources, ensure_ascii=False),
            required_json=json.dumps(required),
            enabled=False,
        )
        if not persist:
            return self._skill_snapshot_from_row(None, row)
        with session_scope(self._engine) as session:
            existing = session.get(SkillRow, (row.id, row.version))
            if existing is not None:
                raise CatalogError("SKILL_EXISTS", "skill version already exists", 409)
            session.add(row)
            session.flush()
            return self._skill_snapshot_from_row(session, row)

    def _skill_summary(self, session: Session, row: SkillRow) -> dict[str, Any]:
        return {
            "id": row.id,
            "version": row.version,
            "digest": row.digest,
            "stateRevision": row.state_revision,
            "description": row.description,
            "enabled": row.enabled,
            "sourceLabel": row.source_label,
            "createdAt": row.created_at.isoformat(),
            "dependencies": self._dependencies(session, row),
        }

    def _skill_snapshot_from_row(self, session: Session | None, row: SkillRow) -> dict[str, Any]:
        summary = {
            "id": row.id,
            "version": row.version,
            "digest": row.digest,
            "stateRevision": row.state_revision,
            "description": row.description,
            "enabled": row.enabled,
            "sourceLabel": row.source_label,
            "createdAt": row.created_at.isoformat() if row.created_at else None,
            "dependencies": self._dependencies(session, row) if session is not None else [],
        }
        summary.update(
            {
                "rawSkillMd": row.raw_skill_md,
                "resources": _loads(row.resources_json, []),
                "requiredCapabilities": _loads(row.required_json, []),
                "schemaVersion": 1,
                "entry": "SKILL.md",
                "instructions": row.instructions,
                "scope": "operator",
                "trust": None,
            }
        )
        return summary

    def _dependencies(self, session: Session | None, row: SkillRow) -> list[dict[str, str]]:
        required = _loads(row.required_json, [])
        known = set(self._builtin)
        if session is not None:
            for server in session.exec(select(McpServerRow)).all():
                item = self._mcp_item(server)
                if item["usable"]:
                    known.update(item["tools"])
        result = []
        for item in required:
            if not isinstance(item, str):
                continue
            result.append(
                {"id": item, "status": "available" if item in known else "disabled"}
            )
        return result

    def _mcp_item(self, row: McpServerRow) -> dict[str, Any]:
        tools = [tool for tool in _loads(row.tools_json, []) if isinstance(tool, str) and tool]
        problems: list[str] = []
        if not row.enabled:
            problems.append("disabled")
        if not row.trusted:
            problems.append("untrusted")
        if not tools:
            problems.append("no-tools")
        usable = row.enabled and row.trusted and bool(tools)
        return {
            "id": row.id,
            "name": row.name,
            "transport": row.transport,
            "endpoint": row.endpoint,
            "trusted": row.trusted,
            "enabled": row.enabled,
            "usable": usable,
            "tools": tools,
            "capabilities": tools,
            "authorisedExperts": [],
            "enabledExperts": [],
            "problems": problems,
        }

    def _rule_summary(self, row: RulePackRow) -> dict[str, Any]:
        return {
            "id": row.id,
            "name": row.name,
            "description": row.description,
            "version": row.revision,
            "ruleCount": row.rule_count,
            "shipped": row.shipped,
            "editable": not row.shipped,
            "enabled": row.enabled,
            "revision": row.revision,
            "requires": [],
            "requiredFacts": [],
        }

    def _capability_item(self, name: str, summary: str) -> dict[str, Any]:
        management = _management()
        return {
            "name": name,
            "kind": "builtin",
            "kindLabel": "内置命令",
            "management": management,
            "scope": "platform",
            "scopeLabel": "平台",
            "expertScoped": False,
            "registered": True,
            "title": name,
            "summary": summary,
            "inputs": [],
            "grants": [],
            "executor": "argv",
            "facts": [],
            "evidence": [],
            "readOnly": True,
            "enabled": True,
            "disabled": False,
            "notes": "",
            "availability": "available",
            "availabilityLabel": "可用",
            "globallyRunnable": True,
            "builtin": True,
            "authorisedExperts": [],
            "usedBy": [],
            "declaredBy": [],
        }

    def _require_base(self, session: Session, base_id: str) -> KnowledgeBaseRow:
        row = session.get(KnowledgeBaseRow, base_id)
        if row is None:
            raise CatalogError("UNKNOWN_KNOWLEDGE_BASE", "knowledge base not found", 404)
        return row


def _management() -> dict[str, Any]:
    return {
        "id": "builtin",
        "label": "内置",
        "description": "运行时注册，目录页不能新建同名命令。",
        "creation": "随 py-backend 进程启动注册。",
        "manageable": False,
    }


def _require_text(value: object, code: str, detail: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise CatalogError(code, detail)


def _reject_secrets(metadata: dict[str, Any]) -> None:
    for key in metadata:
        if str(key).lower().replace("-", "") in _SECRET_KEYS or str(key).lower() in _SECRET_KEYS:
            raise CatalogError("CREDENTIAL_NOT_ACCEPTED", "database profiles do not store secrets")


def _manifest_id(manifest: str) -> str | None:
    parsed = _loads(manifest, None)
    if isinstance(parsed, dict) and isinstance(parsed.get("id"), str) and parsed["id"].strip():
        return parsed["id"].strip()
    return None


def _expert_errors(expert_id: str, name: str, manifest: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(expert_id, str) or not expert_id.strip():
        errors.append("id is required")
    if not isinstance(name, str) or not name.strip():
        errors.append("name is required")
    if not isinstance(manifest, str) or not manifest.strip():
        errors.append("manifest is required")
        return errors
    parsed = _loads(manifest, None)
    if not isinstance(parsed, dict):
        errors.append("manifest must be a JSON object")
        return errors
    if parsed.get("id") != expert_id:
        errors.append("manifest.id must match id")
    return errors


def _mcp_body(body: dict[str, Any], server_id: str | None) -> dict[str, Any]:
    mcp_id = server_id or body.get("id")
    name = body.get("name")
    transport = body.get("transport")
    endpoint = body.get("endpoint")
    tools = body.get("tools")
    trusted = body.get("trusted")
    enabled = body.get("enabled")
    if not isinstance(mcp_id, str) or not mcp_id.strip():
        raise CatalogError("INVALID_MCP_SERVER", "id is required")
    if not isinstance(name, str) or not name.strip():
        raise CatalogError("INVALID_MCP_SERVER", "name is required")
    if transport not in {"stdio", "http", "sse"}:
        raise CatalogError("INVALID_MCP_SERVER", "transport must be stdio, http, or sse")
    if not isinstance(endpoint, str):
        raise CatalogError("INVALID_MCP_SERVER", "endpoint is required")
    if not isinstance(tools, list) or not all(isinstance(tool, str) and tool for tool in tools):
        raise CatalogError("INVALID_MCP_SERVER", "tools must be an array of non-empty strings")
    if not isinstance(trusted, bool) or not isinstance(enabled, bool):
        raise CatalogError("INVALID_MCP_SERVER", "trusted and enabled must be boolean")
    return {
        "id": mcp_id.strip(),
        "name": name.strip(),
        "transport": transport,
        "endpoint": endpoint,
        "tools": tools,
        "trusted": trusted,
        "enabled": enabled,
    }


def _validate_scenario(definition: Any) -> None:
    if not isinstance(definition, dict):
        raise CatalogError("INVALID_SCENARIO", "definition must be an object")
    if definition.get("status") not in _SCENARIO_STATUSES:
        raise CatalogError("INVALID_SCENARIO", "status is not a scenario status")
    modes = definition.get("modes")
    if not isinstance(modes, list) or any(mode not in _SCENARIO_MODES for mode in modes):
        raise CatalogError("INVALID_SCENARIO", "modes must be code and/or work")
    for key in ("name", "summary", "instructions"):
        if not isinstance(definition.get(key), str):
            raise CatalogError("INVALID_SCENARIO", f"{key} must be a string")
    for key in ("tools", "skills", "mcp"):
        values = definition.get(key)
        if not isinstance(values, list) or not all(isinstance(item, str) for item in values):
            raise CatalogError("INVALID_SCENARIO", f"{key} must be an array of strings")
    dependencies = definition.get("dependencies")
    if not isinstance(dependencies, list):
        raise CatalogError("INVALID_SCENARIO", "dependencies must be an array")
    for item in dependencies:
        if not isinstance(item, dict):
            raise CatalogError("INVALID_SCENARIO", "dependency must be an object")
        if not isinstance(item.get("name"), str) or item.get("state") not in _DEPENDENCY_STATES:
            raise CatalogError("INVALID_SCENARIO", "dependency name/state is invalid")
        if not isinstance(item.get("where"), str):
            raise CatalogError("INVALID_SCENARIO", "dependency where must be a string")


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "…"
