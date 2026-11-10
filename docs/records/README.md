# 完整记录总览

当前怎么做看[路线图](../roadmap.md)、[规划状态](../planning-status.md)和[有效产品合同](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)。这里保存决策演进、已执行验证及失败/未完成证据，不将历史过程状态当成当前验收。

| 主题 | 内容与边界 |
|---|---|
| [任务、源码与交付](delivery-history.md) | 准备、Run、原型、审阅、验证、人工决定、生成基线、持久应用、POST_HOC/PREBOUND；10份阶段记录完整合并 |
| [前端工作台与共享UI](frontend-history.md) | 验收清单、组件/主题、录屏对照、图标首片，[PL-01项目观测/在途停用与恢复](frontend-history.md#board-runtime-lifecycle)，以及[专家导航/详情与三栏工作台演进](frontend-history.md#expert-workspace-evolution) |
| [专家知识与Skill](resource-history.md) | 知识授权和Skill文本导入/使用；2份记录完整合并 |
| [架构与实现审查](architecture-history.md) | 已开发内容纠偏、安全加固和历史五模块拆分；不代表当前模块结构 |
| [后端模块组合与SQL Agent](backend-composition-history.md) | 32模块迁移、十四轮边界调整、恢复/审批、真实Responses、复杂SQL和缩放；工具UNKNOWN人工处置、[当前进程线索](backend-composition-history.md#tool-process-review)、[已观察子进程身份持久/核对](backend-composition-history.md#tool-descendant-evidence)、[受控UNKNOWN完整核对](backend-composition-history.md#tool-unknown-controlled-acceptance)、[真实Git异常核对](backend-composition-history.md#real-git-unknown-review)、[真实git-diff异常恢复](backend-composition-history.md#real-git-diff-unknown-review)、[取消/超时/结果返回中断矩阵](backend-composition-history.md#git-interruption-unknown-review)、[取消响应丢失/权限/IO核对恢复](backend-composition-history.md#git-cancel-permission-io-review)及[数据库写入/授权恢复整组交付](backend-composition-history.md#git-database-authorization-recovery)；原决定中的完整逐轮证据 |
| [CLI与外部Agent](external-execution-history.md) | P1-A/B/C、真实委派和Windows失败诊断；6份记录完整合并，不授权重试 |
| [历史路线与台账](roadmap-history.md) | 历次整理前路线图和台账全文，含2c7e87b文档同步前快照；旧“下一步”不覆盖当前计划 |
| [产品方案历史](product-plan-history.md) | 主方案迁出的进度流水及被覆盖目标，保留完整记录与引用 |

## 维护规则

- 先更新主题总览的当前结论，再把确有必要的证据补到对应主题；日期写在章节中，不再创建日期文件。
- 现行规则在主方案/架构/边界文档；已被覆盖方案只在历史记录中保留，并标明覆盖关系。
- 每条原记录有来源路径、稳定锚点和完整正文，标题/相对链接已适配。旧文件退出维护，仓库内链接指向新章节；外部旧链接可通过Git历史查原版本。
- 不将测试数量下降本身当优化成果；测试删除必须说明过时原因及保留的等价行为覆盖。
- 本轮整理与后续验证记录写入[开发与验收指南](../agent-development-guide.md)，不再新增一份日期交付报告。
