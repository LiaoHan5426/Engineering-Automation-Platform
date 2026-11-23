# Agent guidance

Deterministic-first, LLM-last. Prefer Git / SVN / ripgrep / shell / Maven; call an external coding agent only when those cannot finish the task. External agent output is observation, not truth—verify via VCS diff, build, and scoped tests before accepting completion.

Layout: `backend/` Java/Maven reactor (`eap-api`, `eap-engine`, `eap-ai`, `eap-web`, `eap-spring`, host `eap-applications/eap-full-application`); `frontend/` Vue monorepo (Vite+, `apps/*`, `packages/*`); `py-backend/` FastAPI + SQLite colocated Chat host (thin MVP; venv = `py-backend/.venv`; Chat production path for this track — see `docs/decisions/py-backend-thin-mvp.md`; Java Chat not dual-run); `scripts/` optional Python (bootstrap/tools, not Agent host). Do not put backend build files at repo root.

<a id="development-evolution"></a>

## 开发演进（硬约束）

- 开发阶段**不默认兼容**旧数据/接口/逻辑/配置；仅在需求明确要求时做兼容。
- 授权范围内允许破坏性重构；修根因，不为历史包袱叠补丁。
- **同一业务职责：一个权威状态源、一套契约、一条生产路径。** 替换时同步迁移调用方/校验/测试/文档，清除旧入口与无依据回退；禁止默认同职双轨。
- 保留多路径仅当职责不同且边界清晰（真后端 vs 显式 Mock、草稿 vs 发布版、协议适配等）。
- 不覆盖未提交工作、不绕过授权/审批/审计、不擅自清库。

## Working contract（短表）

- 先 `git status`，保留本地改动；以当前用户指令为范围，以代码与可复现测试为事实。
- **切片粒度**：做一个**有单一验收出口的连贯切片**（同一用户目标尽量一次做完）。禁止为仪式再切碎。原型先可点交互并获交互接受；架构先证据与分期计划；缺陷先复现再修因。
- 状态与错误码归所属领域枚举；前端 union 从该定义派生。非法 wire 值严格拒绝，不得落成业务 UNKNOWN。合同见 `docs/decisions/domain-status-and-backend-i18n.md`；变更后跑 `rtk proxy python scripts/verify-domain-contracts.py`。
- 用户可见平台错误须有稳定机器码；禁止解析文案做业务分支。Locale 不改变持久状态、授权、UNKNOWN 互锁或执行证据。
- Mock 仅 `frontend/apps/backend-mock`，同 HTTP/SSE 合同；生产源码不依赖 Mock。传输 `@eap/request`，业务合同 `@eap/runtime-client`。
- **测试与验证**：按风险保留——授权、审批、UNKNOWN、取消、去重、恢复、草稿保护。验证强度与交付节奏见 [§3.6](docs/architecture-method.md#sec-3-6-verify)；资产收敛见 [test-asset-convergence](docs/decisions/test-asset-convergence.md)。不默认全跑；不削弱断言换绿灯。
- 模块细则：`backend/AGENTS.md` / `frontend/AGENTS.md`；命令与验收入口：`docs/agent-development-guide.md`。
- 不覆盖用户改动、不越权写仓、不擅自 push/merge。交付报告 passed / failed / skipped / **unverified**；UTF-8 无 BOM。
