# 任务列表本地新增的设计交付

状态：2026-11-13，下一批第二项，本地模拟效果已完成，父代理独立复跑20组Chrome交互检查通过，HTTP、控制台及页面错误均为0；用户已交互确认当前效果，正式实现及父独立39项前端、13项后端定向检查通过；真实编辑发布与一次双字段优化验收1项通过（73.55秒），真实源码候选明确应用与独立type/test/build通过；最终生成页Tab焦点离开编辑弹窗，源码整链失败，未形成delivery或ACCEPT。同批第一项为[源码保真修复](dsh-ai-team-batch.md)的真实模型复验；两项分别记录结果。

## 目标与范围

接续[可筛选任务列表](task-list-design-delivery.md)与[详情编辑](task-detail-edit-design-delivery.md)，补齐受支持设计语义中“本地新增记录→查看→编辑”的闭环。正式看板已有服务端任务创建，本片新增仅属于当前预览内存，刷新恢复设计初值，不调用看板创建、不修改设计工程或不可变发布版本。

当前记录合同为七字段、0–30条；现有 `editable` 只控制已存在记录的目标和验收标准编辑。本次明确新增可选严格布尔 `props.creatable` / 编辑器 `data-creatable`，缺省关闭，非布尔值拒绝；仅允许本地新增。其与 `editable` 独立：已存在及新增记录的后续编辑均由 `editable` 控制，不扩大既有开关含义。

## 已确认效果

- 提供明确新增入口，名称必填且最多120字符；目标、验收标准分别非空白且最多2000字符。身份本地生成并唯一，初始状态planned、优先级none、摘要空字符串；不新增领域状态。
- 底部紫色AI优化、白色取消、绿色保存；复用已确认双字段AI合同，建议明确采用后只更新草稿，保存才新增记录，名称不由AI覆盖。效果稿使用明确标注的本地模拟，不调用HTTP或真实模型。
- 取消、关闭与Escape保护未保存草稿；请求取消、字段变更含同值还原、关闭重开均清除旧建议。保存去重，满30条时阻断新增；新增后可找到对应记录。
- 覆盖空态、筛选、跨记录隔离、焦点约束及恢复、1440/390和短窗末端可达性；保存后详情与编辑读取同一份本地记录。

效果稿：[可点击预览](../../backend/target/task-list-create-preview-20261113/preview.html)、[1440桌面](../../backend/target/task-list-create-preview-20261113/create-1440.png)、[390窄屏](../../backend/target/task-list-create-preview-20261113/create-390.png)、[双字段建议](../../backend/target/task-list-create-preview-20261113/suggestion-390.png)、[20组验证](../../backend/target/task-list-create-preview-20261113/validation.json)。保存后清空筛选、新增置顶、提示成功并聚焦新行详情入口；刷新恢复6条样例。

## 已验证与剩余关口

正式平台编辑保存、重开、不可变发布及本地新增行为已通过真实验收，含一次真实双字段优化、明确采用/保存、名称同值还原、取消与迟到响应、满30条阻断、刷新恢复；见[交互结果](../../backend/target/task-list-create-acceptance-20261113/backend/eap-applications/eap-full-application/target/task-list-create-15425587773466102855/validation.json)与[发布读回](../../backend/target/task-list-create-acceptance-20261113/backend/eap-applications/eap-full-application/target/task-list-create-15425587773466102855/readback.json)。源码最终候选未通过Tab焦点约束，见[失败结果](../../backend/target/task-list-create-acceptance-20261113/backend/eap-applications/eap-full-application/target/task-list-create-source-live-11951652530043569850/validation.json)和[独立检查通过](../../backend/target/task-list-create-acceptance-20261113/backend/eap-applications/eap-full-application/target/task-list-create-source-live-11951652530043569850/verification.json)。下阶段先收敛生成弹窗的显式Tab/Shift+Tab焦点循环及复用，定向行为检查通过后再跑整链，不将原生dialog自动焦点行为视为完整焦点约束。另有第一/四轮候选的关闭控件失败，分别为按`data-eap-dialog-close`定位超时、按“关闭编辑”按钮名称定位超时；这是先前轮次记录的复列，不能写成第七轮之后的新复验。这些记录不证明焦点问题已修复，也不形成交付通过。准确产物与轮次见[定位复核](../records/validation-history.md#task-list-create-locator-review)。前几轮定位修正和边界见[验证历史](../records/validation-history.md#task-list-create-design-delivery)，保留原候选和失败结果。

本批实现与测试已纳入 `1496335`；[提交前验证](../records/validation-history.md#implementation-commit-validation)与[2026-11-14复核](../records/validation-history.md#development-readiness-review)分别记录离线检查、条件跳过与未执行范围，不改变以上真实模型浏览器失败及用户接受状态。当前修复优先级和关闭条件统一见[问题台账](../planning-status.md#next-work-register)。构建目录产物未入Git，本轮干净检出未重新读取这些历史文件，也未生成新候选。

## 实施关口

先呈现可点击效果稿并通过等待交互回复确认，再同步前后端严格语义、编辑器属性、预览和生成材料。复用公共UI及现有双字段优化接口；取消采用独立DELETE，业务API归runtime-client。正式实现后分别验证设计保存重开/不可变发布、本地记录行为、同版本关联任务的真实源码交付、独立检查和技术ACCEPT。模拟、真实供应商、技术验收与用户产品接受分别记录。
