# 已归档验收脚本索引（B2）

日期：2026-11-23。历史门控 Acceptance / `*-live.mjs` 已从源码树移除；证据仍以当时 `docs/records/validation-history.md`、`docs/records/design-delivery-index.md`、`docs/planning-status.md` 为准。需要复跑时从 Git 历史检出对应路径，**不要**把归档脚本加回默认测试树。

## 仍保留（风险 / 现行门控）

| Java | Browser（若有） | 门控 |
|---|---|---|
| `ToolUnknownReviewAcceptanceTest` | `tool-unknown-review-live.mjs` | `EAP_RUN_TOOL_UNKNOWN_REVIEW` 等 |
| `MissionGitAcceptanceTest` | — | `EAP_RUN_MISSION_GIT_ACCEPTANCE` |
| `SingleContractAcceptanceTest` | — | `EAP_RUN_SINGLE_CONTRACTS` |
| `BoardRuntimeAcceptanceTest` | `board-runtime-live.mjs` | `EAP_RUN_BOARD_RUNTIME` |
| `PrototypeDeliveryAcceptanceTest` | — | `EAP_RUN_CLI_INTEGRATION` |
| `EngineeringAgentAcceptanceTest` | `engineering-agent-live.mjs` | `EAP_ENGINEERING_AGENT_CHROMIUM` |
| `PackagedHostAcceptanceTest` | — | `EAP_PACKAGED_HOST` |
| `DesignerLifecycleAcceptanceTest` | `designer-lifecycle-live.mjs` | `EAP_RUN_DESIGNER_LIFECYCLE` |

另保留与 Persistence/恢复相关的 `board-code-recovery-live.mjs`、`source-write-review-live.mjs`（非本表 Acceptance 驱动）。

## 本轮移出（历史设计交付 / 批跑）

Java：`TaskListCreate*AcceptanceTest`、`TaskListSourceDeliveryAcceptanceTest`、`TaskDetailEdit*AcceptanceTest`、`TextareaSourceDeliveryAcceptanceTest`、`PrototypeTaskListAcceptanceTest`、`PrototypeInteractionAcceptanceTest`、`BoardTaskAi*AcceptanceTest`、`SelfPageDeliveryAcceptanceTest`、`SourceIntegrityLiveAcceptanceTest`、`ModelHistoryAcceptanceTest`、`PlanningModeAcceptanceTest`、`ScenarioSkillAcceptanceTest`、`SkillDirectoryAcceptanceTest`、`TaskPlanningAcceptanceTest`。

Browser：对应 `task-list-*`、`task-detail-*`、`textarea-*`、`prototype-interaction-*`、`board-task-ai-*`、`self-page-*`、`source-integrity-*`、`model-history-*`、`planning-mode-*`、`scenario-skill-*`、`skill-directory-*`、`task-planning-*`，以及批跑型 `frontend-batch-*`、`settings-batch-*`、`connection-draft-live`、`conversation-optimization-live`、`component-page-*`、`prebound-*`、`product-workspaces-*`、`prototype-publication-recovery-*`、`route-resource-*`、`knowledge-update-live`、`status-i18n-live`、`full-current-contract-live`。
