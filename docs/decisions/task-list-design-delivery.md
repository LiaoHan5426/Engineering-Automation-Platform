# 可筛选任务列表与详情的设计交付

状态：2026-11-13，1440/390px效果稿及11组浏览器检查通过，用户已通过等待交互回复选择“确认，按当前效果实施”；正式语义、实际发布和限定真实源码交付技术验收通过，用户产品接受独立。

效果稿：[可点击预览](../../backend/target/task-list-design-preview-20261113/preview.html)、[桌面列表](../../backend/target/task-list-design-preview-20261113/list-1440.png)、[窄屏列表](../../backend/target/task-list-design-preview-20261113/list-390.png)、[窄屏详情](../../backend/target/task-list-design-preview-20261113/detail-390.png)、[验证记录](../../backend/target/task-list-design-preview-20261113/validation.json)。记录明确 sample=true、productionWrites=false，HTTP、console error及pageerror均为零，仅证明本地效果稿。

## 业务切片

沿主方案 PB-01 和路线图的设计到源码主线，交付一个包含关键词与状态筛选、匹配数量、空结果、清空筛选和只读详情的完整列表样例。桌面展示列表，窄屏展示可读条目；详情可关闭、Escape 退出并返回原操作焦点。

正式看板已经支持查询和优先级筛选，本片针对设计器语义与生成页面的映射，不重新实现看板管理功能。样例数据只用于本地交互，不创建、修改、删除任务，不启动 Run，不加入导出或 AI 优化操作。

## 已核对的缺口

实施前普通 `list` 仅渲染字符串条目；本片新增独立 `task-list` 语义补齐结构化记录、筛选与只读详情，保留普通列表职责。编辑保存、不可变发布及生成材料使用同一合同。

## 确认后的实现边界

- 先复用已有列表、字段及 Dialog 组件，定义有界示例记录与声明式筛选/详情关系；不允许任意脚本、查询表达式或远端数据地址。wire 属性及前后端严格校验统一见下文合同。
- 保留普通字符串列表的当前职责；结构化交互采用明确语义，非法记录、重复身份、未知映射与无效引用应阻断发布及交付。
- 状态展示复用既有看板领域含义，样例不是新的任务状态机。筛选、选中项及弹窗只属于当前预览，不改写设计或不可变版本。
- 属性编辑、Grapes 工程、语义 Schema、保存重开、不可变发布、预览和生成材料同步演进。基础交互复用公共 UI；不另建执行器、任务创建入口或业务 API。
- 获得效果确认后再实现；定向检查通过后，使用既有任务/版本/基线/候选/明确应用/独立验证路径验证真实源码效果。真实模型、确定性测试、模拟交互、技术 ACCEPT 和用户产品接受分别留证。

## 本片语义合同

采用独立 `task-list` kind，保留普通 `list` 的字符串内容职责。`children` 必须为空；`props.items` 必填，为0～30条记录。记录只接受 `id/name/status/priority/summary/goal/acceptanceCriteria` 七个字符串字段，不接受额外字段或脚本。

`id` 满足 `[A-Za-z][A-Za-z0-9_-]{0,79}` 且列表内唯一；`name` 非空白且最多120字符；`summary` 最多240字符；`goal` 与 `acceptanceCriteria` 非空白且各最多2000字符。`status` 复用看板 planned/ready/running/acceptance/done，`priority` 复用 none/p0/p1/p2；不建立新的任务状态集合。Grapes 编辑属性为 `data-items` JSON，保存工程与语义同时保留原记录；非法数据保留供修改并阻断发布，不替换成默认样例。

筛选按名称去除首尾空白后忽略大小写包含匹配，与状态相等匹配取交集；空筛选显示全部。详情对应当前明确选择的记录，只读且关闭后保留筛选。预览身份切换或停用清理临时状态；不增加动作类型或业务请求。

## 验证安排

效果稿先覆盖 1440/390px、关键词与状态组合、空结果及清空、正确行详情、关闭和焦点恢复，并明确标注示例数据与本地模拟。确认使用等待交互回复方式。

正式语义切片已通过前端4文件16项、后端3类14项定向测试，类型、模块边界及生产构建通过。实际编辑器及发布验收 `PrototypeTaskListAcceptanceTest` 1项通过（44.68s，零失败/错误/跳过）：编辑记录后保存重开，1440/390px筛选/空结果/重置/详情/焦点及末行可达通过；数据库完整envelope与实际发布请求一致，仅1个不可变版本、1个关联待规划任务，候选/Run/执行均为0。

[实际浏览器记录](../../backend/target/task-list-design-20261113/backend/eap-applications/eap-full-application/target/task-list-design-16319307743237759317/validation.json)及[数据库原文读回](../../backend/target/task-list-design-20261113/backend/eap-applications/eap-full-application/target/task-list-design-16319307743237759317/readback.json)保留独立证据。首轮真实浏览器暴露包裹label包含option文本导致状态Select可访问名称不精确；为控件补充明确本地化aria-label并保留回归后复验通过，原失败日志独立保留。

前端16项、后端14项、类型/边界/构建、实际编辑保存重开/不可变发布及实库原文核对通过；真实模型两文件候选经页面明确应用、独立typecheck/test/build及内容哈希、1440/390px逐六条记录筛选/详情/焦点/滚动、原型对照与技术ACCEPT刷新读回通过。[源码整链记录](../../backend/target/task-list-source-20261113/backend/eap-applications/eap-full-application/target/task-list-source-5273733127732985604/validation.json)、[独立检查及哈希](../../backend/target/task-list-source-20261113/backend/eap-applications/eap-full-application/target/task-list-source-5273733127732985604/verification.json)、[交付决定](../../backend/target/task-list-source-20261113/backend/eap-applications/eap-full-application/target/task-list-source-5273733127732985604/delivery.json)对应同一实际发布版本与关联任务。生成源文件仅位于隔离workspace，正式看板管理页不改版；未变化的既有看板AI编辑及创建沿用原证据。首次真实生成已通过源码交互及独立检查，最后对照因测试把页面名当作内容标题而失败；修正为按保存语义label定位并核对全部行；第二轮真实生成因包裹Select标签混入option文本再次检出失败，因此正式生成材料补充精确可访问名称约束，再完整复验通过。各轮均不使用捕获重放或结果回填，失败与通过记录分别保留。
