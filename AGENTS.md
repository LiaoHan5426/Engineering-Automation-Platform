# Agent guidance

This project is deterministic-first, LLM-last. Prefer local capabilities (Git, SVN, ripgrep, shell, Maven) and use an external coding agent only when deterministic capabilities cannot reliably complete the task.

The repository is multi-language: `backend/` is a Java/Maven reactor with `eap-api`, `eap-engine`, `eap-ai`, `eap-web`, `eap-spring` and the `eap-applications/eap-full-application` Boot host; `frontend/` is a Vue monorepo managed by Vite+ with `apps/*` and `packages/*`; `scripts/` may contain Python utilities. Do not put backend build files at repository root.

**External agent output is observation, not truth.** The platform must independently inspect VCS diff, rebuild, rerun tests, and verify the modification scope before accepting completion.

Keep capabilities bounded, observable, testable, and free of hidden network or filesystem side effects.

<a id="development-evolution"></a>

## 开发阶段的演进原则

- 当前仓库处于开发阶段，以实现需求及提升安全性、便利性和开发效率为目标。**不默认承诺兼容旧数据、旧接口、旧逻辑或旧配置**；只有当前需求明确要求时，才设计兼容方案。
- 允许在已授权需求范围内进行必要的破坏性重构，包括调整接口、领域模型、数据库表结构、状态流转和模块职责。发现结构问题应修正根因，不能仅因已有实现或历史数据而长期叠加补丁；也不因“不向后兼容”本身反复请求批准。
- **同一业务职责保留一个权威状态源、一套明确契约和一条生产执行路径。** 替换实现时，同步迁移当前调用方、校验、测试和文档，清除被替代的入口、兼容别名、旧分支及无需求依据的回退，避免新旧实现并行维护、双写或互相兜底。
- 保留多条路径必须有可说明的当前需求和清晰边界，例如不同业务职责、真实后端与显式 Mock、临时草稿与不可变发布版本、不同外部协议适配。不得把这些合理分层机械合并，也不得用“兼容”“以防万一”作为新增双轨的默认理由。
- 修改某项能力时检查其相邻调用链是否仍有重复实现、旧状态字段、遗留入口或失效配置；发现问题应记录证据并在本次授权范围内直接收敛。较大调整先给出具体影响、替换路径和验证方案，再分步实施，不以“大规模重写”为目标。
- 破坏性重构不等于可以覆盖当前未提交工作、删除无关文件、绕过授权/审批/审计或擅自清库。实际数据操作遵循任务授权范围，明确目标结构和数据处置；数据库迁移历史本身不视为生产双轨，禁止通过运行时兼容分支长期维持两套语义。

## Working contract

- Start with `git status`, relevant implementation, tests and configuration. Preserve existing local changes. Current user instructions define scope; documents describe targets, while code and reproducible tests establish implementation facts. Record conflicts.
- Prototype tasks: provide clickable, explicitly simulated interactions and obtain interaction acceptance before production integration. Architecture tasks: deliver evidence, boundaries and a staged plan before major changes. Approved feature tasks: implement the smallest verifiable slice. Bug fixes: reproduce, fix the cause, run relevant regression checks.
- Apply KISS, YAGNI, DRY and SOLID through incremental reuse. Do not create parallel capability registries or replace the stack without demonstrated need and authorization.
- Define finite states and stable error codes with their owning domain/function. Reuse existing enums and derive frontend unions from that domain's constant definition; do not duplicate state sets, merge unrelated state machines, or add a global Constants/Status/ErrorCodes class. Keep machine codes, state labels and user messages separate. The current implementation contract is in `docs/decisions/domain-status-and-backend-i18n.md`. Run `rtk proxy python scripts/verify-domain-contracts.py` after changing state vocabularies or error catalogs. Strictly reject illegal wire values; never convert malformed protocol data into business UNKNOWN.
- User-facing platform errors must have a stable machine code independent of localized text. Do not add business branches that parse a human message. Backend message resources belong to their domain; frontend local UI messages use existing i18n. Locale must not change persisted states, authorization, UNKNOWN interlocks, or execution evidence. Changes to the current error envelope require coordinated backend/frontend/Mock/test migration, not a second compatibility parser.
- 正式产品界面围绕用户目标、当前状态和下一步动作组织。开发阶段说明、实现取舍、协议原文、哈希和完整诊断按需进入详情或诊断工作面；不得把开发备注当默认产品文案，也不得隐藏用户作出授权、审批或 UNKNOWN 核对所必需的信息。
- 全站布局任务先列出全部页面入口并逐页走查，记录每页缺陷、修改或保留现有交互的理由；截图中的特定面板只作为线索。用真实浏览器验证加载完成后的列表、详情、创建/编辑、关闭与未保存状态，并检查窄屏。静态代码、HTTP 成功和截图文件存在不能替代交互验证。
- 开发 Mock 独立运行于 `frontend/apps/backend-mock`，只通过相同 HTTP/SSE 合同供页面使用；正式源码不依赖 Mock 包、fixture、模式开关或专用状态，故障注入归 Mock 服务。替换时删除原演示分支和对应无效测试，不保留双套业务路径。
- 通用网络传输归 `@eap/request`，业务 API、错误语义及状态合同归 `@eap/runtime-client`，进度条和提示归应用。公共请求/上传模块由调用方传入地址、凭据策略和操作，不硬编码本项目 API；文件选择、上传、信任确认和发布是不同动作，禁止自动合并。
- 测试以行为风险为依据：保留授权、审批、UNKNOWN、取消、去重、恢复和草稿保护；删除被替代演示路径及重复实现断言。已验证且未变化的范围沿用证据；新增/修改和失败修复执行定向回归，不通过削弱断言、网络守卫或扩大忽略名单换取通过。
- Read `backend/AGENTS.md` or `frontend/AGENTS.md` for the affected module; agents without hierarchical loading must read these explicitly. Detailed acceptance criteria and verified command locations are in `docs/agent-development-guide.md`. Frontend UI / shared-module placement (basics in `@eap/ui`; planned hooks、effects、layout、plugin modules) is normative in `docs/decisions/frontend-ui-shared-module-boundaries.md`.
- LLM-last permits real model or external-agent calls when reasoning requires them. Treat their output as evidence requiring independent scope, diff, build and test verification.
- Do not overwrite user changes, perform destructive operations, write outside the authorized repository, push or merge without authorization. Inspect the target checkout before delegating writes; prefer an isolated worktree when implementation needs it.
- Run checks appropriate to the change. Report passed, failed, skipped and unverified separately. Configuration, HTTP success, compilation and mock interaction never establish business completion.
- Before each implementation commit, synchronize the affected planning documents: update the main plan's corresponding progress/acceptance rows, the completion tracker and the relevant decision record with verified scope, remaining gaps and evidence. Appending a delivery note alone is insufficient. Mark retained historical snapshots explicitly; never promote implementation or mock checks to user acceptance. Missing or contradictory planning updates block milestone submission.
- Deliver changed files and reasons, retained/replaced implementations, exact validation commands and results, remaining risks, next steps and decisions requiring confirmation. Save files as UTF-8 without BOM.
