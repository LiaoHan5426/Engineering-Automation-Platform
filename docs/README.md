# EAP 文档入口

文档按“当前合同 → 当前进度 → 完整记录”分层。代码与可重复测试是实现事实；目标方案、历史数字和Mock不代表当前验收。

## 建议阅读顺序

| 目的 | 文档 |
|---|---|
| 看当前进度和后续关口 | [路线图](roadmap.md)、[完整规划状态](planning-status.md)、[缺陷/风险/优化及关闭条件](planning-status.md#next-work-register) |
| 查阶段实施与验证的完整记录 | [主题记录总览](records/README.md) |
| **约束：个人本机 + 本地服务（必读）** | [running-context](running-context.md) |
| 理解平台架构和 Spring AI 边界 | [architecture](architecture.md) |
| 配置环境、初始化当前数据库基线 | [environment](environment.md) |
| 开发规范与验收要求 | [开发与验收指南](agent-development-guide.md) |
| 找包、模块和验证入口 | [module-layout](module-layout.md)、[后端模块组合与实施](decisions/backend-module-composition.md#implementation) |
| 当前实现基线与最近验证 | [当前基线与完成口径](planning-status.md#validation-baseline)；完整命令、失败与分阶段结果见[阶段验证记录](records/validation-history.md) |
| 专家管理、任务详情与三栏编辑 | [专家工作区合同](decisions/expert-workspace-navigation.md)，含原型设计器共享边界 |
| **前端 UI / hooks·effects·layout·plugin 落点（Agent 强制）** | [frontend-ui-shared-module-boundaries](decisions/frontend-ui-shared-module-boundaries.md) |
| 查 HTTP 接口与专家执行流程 | [backend-architecture](backend-architecture.md) |
| 知识库能否本地执行、何时需要模型 | [知识与本地执行边界](decisions/knowledge-local-execution.md) |
| 使用专家、知识库和规则 | [expert-knowledge-rules](expert-knowledge-rules.md)、[runtime-workflow](runtime-workflow.md) |
| 理解确定性分析与模型增强流程 | [pipeline](pipeline.md) |

## 产品原型与目标设计

- [v1.6 当前产品与技术合同](EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)：现行五入口、交互、执行边界与验收；完整历史已分离至[方案历史](records/product-plan-history.md)。
- [前端原型及交互合同](frontend-prototype.md)：已合并旧知识库 IA、层级导航、会话交互说明，以及 2026-10-26 五入口工作台决策。仅保留一份 [控制台 HTML 原型](prototype/console.html)，演示行为不等于后端实现。
- [Electron 设计](desktop-spec.md)：已有安全preload壳，sidecar、一体安装与发行尚未完成。
- [MCP 管理设计](mcp-management-design.md)：登记/授权与真实协议调用必须分开。
- [扩展边界决策](decisions/extension-boundaries.md)、[CLI/Codex 分阶段设计](decisions/p1-cli-codex-design.md)、[工具接入与运行边界](decisions/tool-integration-runtime-boundaries.md)：有效决策；工作区/配置口径以 [running-context](running-context.md) 为准。
- [S1 Spring AI Chat 接入设计](decisions/s1-chat-spring-ai-design.md)：v1.6 最小 API/UI 方案；当前实现与限制见[规划台账](planning-status.md)和[工程任务切片](decisions/chat-engineering-task-slice.md)。

## 验收证据入口（按阶段区分）

- [当前验证与待验项](planning-status.md#validation-baseline)：列明当前限定能力与剩余关口；[阶段验证记录](records/validation-history.md)按日期区分全量、定向、Fake与真实供应商结果。[开发准备复核](records/validation-history.md#development-readiness-review)单列本轮工具链安装与确定性检查；真实模型/浏览器/实库业务验收未重跑。
- [近期工程与资源证据](records/validation-history.md#engineering-agent-validation)：源码Agent、规划回写、应用后任务交接、Skill目录/场景引用、知识更新、历史摘要及Work文档；真实供应商跨路由交付见[独立记录](records/validation-history.md#real-route-model-validation)。
- [工作台交互记录](records/frontend-history.md#expert-workspace-evolution)：三栏编辑及审批UI技术检查，fixture写入与真实本地编辑分别标注；新工作台原生缩放和用户接受仍待。
- [SQL Agent真实Responses整链](records/backend-composition-history.md#responses-tools-acceptance)：两轮取证/候选、页面审批、独立读回及重启终态；[复杂SQL限定样例](records/backend-composition-history.md#complex-sql-acceptance)不代表完整SQL效果或用户接受。

以下为专项或早期阶段结论，使用时核对其日期、实现范围和当前台账：

- [Spring AI 集成](audits/spring-ai-integration-report.md)、[统一化与清理](audits/spring-ai-consolidation-report.md)。
- [扩展能力审计](audits/extension-capability-audit.md)、[P0 基线](audits/p0-validation-report.md)。
- [P1-A](records/external-execution-history.md#p1-a-implementation-report)、[P1-B](records/external-execution-history.md#p1-b-implementation-report)、[P1-C 阶段实现](records/external-execution-history.md#p1-c-implementation-report)。
- [Codex 执行证据](records/external-execution-history.md#p1-c-execution-evidence-closure-report)、[真实委派结论](records/external-execution-history.md#p1-c-real-delegation-20261023-report)、[Windows 沙箱历史结论](records/external-execution-history.md#p1-c-windows-sandbox-compatibility-diagnosis)。

## 文档维护

根目录保留长期使用说明和当前进度；**约束性定位以 `running-context.md` 为唯一事实源**。decisions 保存有效决策，records 按主题维护完整阶段记录，audits 保留未被主题总览取代的专项结论。当前完整状态统一维护在planning-status，roadmap只列主线摘要及推进顺序，主方案保留规范及验收行；逐次验证流水统一归records/validation-history，其他主题记录保留其独有分析；其他文档引用验收基线，不复制“最新测试数”。日期写进章节，不再新建日期报告；合并时更新链接及稳定锚点，保留失败、跳过、授权和未完成证据。历史指令不重新生效。测试删改必须记录过时原因与覆盖去向，不以数量减少为质量指标。

### 2026-10-27 合并说明

| 原文件 | 现位置 |
|---|---|
| `decisions/local-service-and-installer.md` | 并入 [running-context.md](running-context.md)；原路径仅重定向 |
| `decisions/desktop-workspace-initial-adjustment.md` | 并入 [frontend-prototype.md](frontend-prototype.md#vue-工作台五入口2026-10-26已并入原-desktop-workspace-决策)；原路径仅重定向 |

脚本放在项目 `scripts/`，临时输出放在构建目录，不把私有工具绝对路径当作仓库验收命令。
