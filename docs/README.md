# EAP 文档入口

文档描述分为当前实现、目标设计和历史验收。代码与可重复测试是实现事实；目标方案和过去的测试数字不代表当前验收通过。

## 建议阅读顺序

| 目的 | 文档 |
|---|---|
| 看当前进度和后续关口 | [roadmap](roadmap.md) |
| 理解平台架构和 Spring AI 边界 | [architecture](architecture.md) |
| 配置环境、迁移旧模型属性 | [environment](environment.md) |
| 开发规范与验收要求 | [开发与验收指南](agent-development-guide.md) |
| 找包、模块和验证入口 | [module-layout](module-layout.md) |
| 查 HTTP 接口与专家执行流程 | [backend-architecture](backend-architecture.md) |
| 使用专家、知识库和规则 | [expert-knowledge-rules](expert-knowledge-rules.md)、[runtime-workflow](runtime-workflow.md) |
| 理解确定性分析与模型增强流程 | [pipeline](pipeline.md) |
| 查看个人本机运行边界 | [running-context](running-context.md) |

## 产品原型与目标设计

- [v1.6 Spring AI 产品与技术架构调整方案](EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)：保留的原始目标方案；其中历史实现描述以当前代码和 roadmap 为准。
- [前端原型及交互合同](frontend-prototype.md)：已合并旧知识库IA、层级导航、会话交互说明。仅保留一份 [控制台HTML原型](prototype/console.html)，其中演示行为不等于后端实现。
- [Electron 设计](desktop-spec.md)：目标方案，桌面壳尚未交付。
- [MCP 管理设计](mcp-management-design.md)：登记/授权与真实协议调用必须分开。
- [扩展边界决策](decisions/extension-boundaries.md)、[CLI/Codex 分阶段设计](decisions/p1-cli-codex-design.md)：有效决策，不因整理文档而变更。
- [S1 Spring AI Chat 接入设计](decisions/s1-chat-spring-ai-design.md)：v1.6 最小 API、UI、服务端授权和离线验收方案；尚未实施。

## 验收结论

- [Spring AI 集成](audits/spring-ai-integration-report.md)、[统一化与清理](audits/spring-ai-consolidation-report.md)。
- [扩展能力审计](audits/extension-capability-audit.md)、[P0基线](audits/p0-validation-report.md)。
- [P1-A](audits/p1-a-implementation-report.md)、[P1-B](audits/p1-b-implementation-report.md)、[P1-C当前实现](audits/p1-c-implementation-report.md)。
- [Codex执行证据](audits/p1-c-execution-evidence-closure-report.md)、[真实委派结论](audits/p1-c-real-delegation-20261023-report.md)、[Windows沙箱历史结论](audits/p1-c-windows-sandbox-compatibility-diagnosis.md)。

## 文档维护

根目录保留长期使用说明与唯一进度入口；decisions 保存有效架构决策；audits 只保留最终验收/故障结论与清理清单；prototype 保留仍被引用的交互原型。相同主题优先更新现有文档，避免逐轮增加评审或排查报告。脚本放在项目 scripts，临时输出放在构建目录，不把私有工具绝对路径当作仓库验收命令。

本次合并、删除理由和引用重定向见 [现有整理清单](audits/codex-test-cleanup-manifest.json) 的 docsCleanup 字段。
