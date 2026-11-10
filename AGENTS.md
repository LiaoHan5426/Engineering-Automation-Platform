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
- Read `backend/AGENTS.md` or `frontend/AGENTS.md` for the affected module; agents without hierarchical loading must read these explicitly. Detailed acceptance criteria and verified command locations are in `docs/agent-development-guide.md`. Frontend UI / shared-module placement (basics in `@eap/ui`; planned hooks、effects、layout、plugin modules) is normative in `docs/decisions/frontend-ui-shared-module-boundaries.md`.
- LLM-last permits real model or external-agent calls when reasoning requires them. Treat their output as evidence requiring independent scope, diff, build and test verification.
- Do not overwrite user changes, perform destructive operations, write outside the authorized repository, push or merge without authorization. Inspect the target checkout before delegating writes; prefer an isolated worktree when implementation needs it.
- Run checks appropriate to the change. Report passed, failed, skipped and unverified separately. Configuration, HTTP success, compilation and mock interaction never establish business completion.
- Before each implementation commit, synchronize the affected planning documents: update the main plan's corresponding progress/acceptance rows, the completion tracker and the relevant decision record with verified scope, remaining gaps and evidence. Appending a delivery note alone is insufficient. Mark retained historical snapshots explicitly; never promote implementation or mock checks to user acceptance. Missing or contradictory planning updates block milestone submission.
- Deliver changed files and reasons, retained/replaced implementations, exact validation commands and results, remaining risks, next steps and decisions requiring confirmation. Save files as UTF-8 without BOM.
