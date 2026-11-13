# 设计到源码交付切片索引

本页仅导航已留存的限定交付范围、合同和证据，不维护第二份进度台账。工作项当前状态与剩余关口统一见[规划状态 PB-01](../planning-status.md#pb-01-design-delivery)；[主方案](../EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md#section-0b-7)定义规范，[路线图](../roadmap.md#推进顺序与门禁)定义推进顺序。详细命令、测试数量、失败与重跑均保留在下列阶段记录，不再复制到各入口。

| 限定切片 | 范围与证据阅读边界 | 合同 / 详细证据 |
|---|---|---|
| 交互原型与版本任务 | 表单、选择、勾选、弹窗及声明式提交/重置/开关；草稿重开、不可变发布、版本关联任务 | [交互合同](../decisions/builder-prototype-delivery-contract.md#interactive-design)；[原型验证](validation-history.md#interactive-design-validation)、[复核与草稿保护](validation-history.md#developed-content-review-validation) |
| 表单/弹窗跨路由源码 | 隔离两路由六文件；确定性候选与真实供应商候选分列，前三次实网失败及修复后通过均保留 | [交付合同](../decisions/builder-prototype-delivery-contract.md)；[交互源码证据](validation-history.md#interactive-source-delivery-validation) |
| 多行字段语义 | textarea属性、换行、空白必填、提交/重置、草稿与版本；此语义切片未调用真实模型 | [语义合同](../decisions/builder-prototype-delivery-contract.md)；[多行字段证据](validation-history.md#textarea-semantic-design) |
| 独立任务表单与AI描述优化 | 已确认设计的真实两文件输出；首次失败与新基线显式重放分别保留，重放不计为新模型生成；本地提交不创建看板任务 | [交付合同](../decisions/builder-prototype-delivery-contract.md)；[表单与AI证据](validation-history.md#textarea-source-ai-optimization) |
| 正式看板创建与AI目标优化 | 复用正式创建及请求身份；明确采用、实库读回、丢响应后同身份去重；创建不启动Run | [创建合同](../decisions/board-task-ai-creation.md)；[创建证据](validation-history.md#board-task-ai-creation) |
| 正式已有任务目标编辑优化 | 复用原草稿/revision保存；采用仅改草稿，明确保存才写库，保留真实409及冲突核对 | [编辑合同](../decisions/board-task-ai-creation.md#existing-task-goal-optimization)；[编辑证据](validation-history.md#board-task-ai-editing) |
| 可筛选任务列表与只读详情 | 交互确认、结构化语义/属性/预览、保存发布实库读回；真实两文件源码、逐记录筛选/详情与技术决定；首轮标签及原型标题定位失败保留 | [任务列表合同](../decisions/task-list-design-delivery.md)；[任务列表证据](validation-history.md#task-list-design-delivery) |
| 任务详情编辑与双字段AI | 已确认设计的目标/验收标准编辑、必填/长度边界、明确采用、本地保存/取消及草稿退出保护；真实发布与同版本关联任务的隔离源码交付 | [详情编辑合同](../decisions/task-detail-edit-design-delivery.md)；[详情编辑证据](validation-history.md#task-detail-edit-design-delivery) |
| 列表本地新增与保真复验 | 独立creatable语义、复用双字段AI和本地记录；源码五阶段一致性与生成页交互结论分别记录 | [新增合同](../decisions/task-list-create-design-delivery.md)；[并行批次证据](validation-history.md#task-list-create-design-delivery) |

技术 ACCEPT 只表示对应隔离交付的技术决定，用户交互确认与最终产品接受分别记录。真实供应商优化与取消/ABA/关闭的显式 Mock 迟到响应注入分列；不将故障注入计作真实供应商效果，也不以成功覆盖早期失败、旧候选或重放记录。

这些证据不代表常驻服务已升级或日常数据库已初始化新 V1；详情编辑源码仅在隔离工作区应用。详情切片的脱敏残片准入拦截与后续代码答案完整性修复分别见[修复批次](../decisions/dsh-ai-team-batch.md)和[真实复验](validation-history.md#task-list-create-design-delivery)；保真验证与生成页完整交付分别核对。更多组件、自身业务页、原生缩放和用户产品接受的当前关口只在台账维护。
