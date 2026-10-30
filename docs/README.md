# EAP 文档入口

文档描述分为当前实现、目标设计和历史验收。代码与可重复测试是实现事实；目标方案和过去的测试数字不代表当前验收通过。

## 建议阅读顺序

| 目的 | 文档 |
|---|---|
| 看当前进度和后续关口 | [roadmap](roadmap.md) |
| **约束：个人本机 + 本地服务（必读）** | [running-context](running-context.md) |
| 理解平台架构和 Spring AI 边界 | [architecture](architecture.md) |
| 配置环境、迁移旧模型属性 | [environment](environment.md) |
| 开发规范与验收要求 | [开发与验收指南](agent-development-guide.md) |
| 找包、模块和验证入口 | [module-layout](module-layout.md) |
| **前端 UI / hooks·effects·layout·plugin 落点（Agent 强制）** | [frontend-ui-shared-module-boundaries](decisions/frontend-ui-shared-module-boundaries.md) |
| 查 HTTP 接口与专家执行流程 | [backend-architecture](backend-architecture.md) |
| 使用专家、知识库和规则 | [expert-knowledge-rules](expert-knowledge-rules.md)、[runtime-workflow](runtime-workflow.md) |
| 理解确定性分析与模型增强流程 | [pipeline](pipeline.md) |

## 产品原型与目标设计

- [v1.6 Spring AI 产品与技术架构调整方案](EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)：保留的原始目标方案与 §0B 进度；其中历史实现描述以当前代码、roadmap 和 [running-context](running-context.md) 为准。
- [前端原型及交互合同](frontend-prototype.md)：已合并旧知识库 IA、层级导航、会话交互说明，以及 2026-10-26 五入口工作台决策。仅保留一份 [控制台 HTML 原型](prototype/console.html)，演示行为不等于后端实现。
- [Electron 设计](desktop-spec.md)：目标方案，桌面壳尚未交付。
- [MCP 管理设计](mcp-management-design.md)：登记/授权与真实协议调用必须分开。
- [扩展边界决策](decisions/extension-boundaries.md)、[CLI/Codex 分阶段设计](decisions/p1-cli-codex-design.md)、[工具接入与运行边界](decisions/tool-integration-runtime-boundaries.md)：有效决策；工作区/配置口径以 [running-context](running-context.md) 为准。
- [S1 Spring AI Chat 接入设计](decisions/s1-chat-spring-ai-design.md)：v1.6 最小 API/UI 方案；**实现与限制以 roadmap 与 chat-engineering-task-slice 为准**（勿把本 README 旧「尚未实施」句当作现状）。

## 验收结论

- [Spring AI 集成](audits/spring-ai-integration-report.md)、[统一化与清理](audits/spring-ai-consolidation-report.md)。
- [扩展能力审计](audits/extension-capability-audit.md)、[P0 基线](audits/p0-validation-report.md)。
- [P1-A](audits/p1-a-implementation-report.md)、[P1-B](audits/p1-b-implementation-report.md)、[P1-C 当前实现](audits/p1-c-implementation-report.md)。
- [Codex 执行证据](audits/p1-c-execution-evidence-closure-report.md)、[真实委派结论](audits/p1-c-real-delegation-20261023-report.md)、[Windows 沙箱历史结论](audits/p1-c-windows-sandbox-compatibility-diagnosis.md)。

## 文档维护

根目录保留长期使用说明与唯一进度入口；**约束性定位以 `running-context.md` 为唯一事实源**；decisions 保存有效架构决策（已并入正文的决策仅保留短重定向）；audits 只保留最终验收/故障结论；prototype 保留仍被引用的交互原型。相同主题优先更新现有文档，避免逐轮增加评审或排查报告。

### 2026-10-27 合并说明

| 原文件 | 现位置 |
|---|---|
| `decisions/local-service-and-installer.md` | 并入 [running-context.md](running-context.md)；原路径仅重定向 |
| `decisions/desktop-workspace-initial-adjustment.md` | 并入 [frontend-prototype.md](frontend-prototype.md#vue-工作台五入口2026-10-26已并入原-desktop-workspace-决策)；原路径仅重定向 |

脚本放在项目 `scripts/`，临时输出放在构建目录，不把私有工具绝对路径当作仓库验收命令。
