# 源码交付证据与人工验收切片

状态：实施合同，未交付。承接 v1.6 §0B.7、§0B.11 及 Run 独立验证。

## 实施与审查状态

前后端已实现初版并由父任务重跑：前端 77 文件/316 项通过；后端 426 项，420 通过、6 条件跳过；类型、边界、构建通过。真实浏览器已验证旧源码验证快照提交新修改返回 `BOARD_DELIVERY_SOURCE_STALE`，无交付记录、草稿保留；四视口无页面横向溢出。这不是成功交付/用户接受证据。

独立审查发现的四项缺陷已补 RED→GREEN：① Windows CRLF 检出采用安全的有限 Git EOL 语义判定，原始源码哈希仍保留；② 基线/工作区复用同一路径与扩展排除规则；③ 父级仅同步无本地修改的草稿 revision，脏草稿保留；④ GET 同 requestId 不当作成功，仅原请求 POST 被服务端接受后核对回读，明确内容冲突保留原载荷。类型、边界、构建及全量复跑通过：前端 78 文件/354 项；后端 452 项、446 通过、6 条件跳过。最终复核与真实成功链路仍待收口。

真实成功联调需要一个明确且小于 8 文件的基线：当前实现本身超过范围，不能扩大交付上限或用不完整选择绕过保护。实现代码经独立复核后先形成本地检查点，再在该基线上建立明确标记的临时 HTML 交互样例，用真实 Run/三项验证/源码采集/脚本化测试决定走通链路。仅测试样例允许代理执行 ACCEPT/REJECT，说明必须写明不是用户产品验收。最终联调与文档完成后再推送；application.yml 不进入任何提交，临时样例不进入产品提交。

再次复核发现两个边界未闭合：前端冲突测试采用非真实错误码、Git autocrlf 显式空字符串与无值布尔混淆。前者父任务已将提交/决定及本地日志校验统一为后端真实 `BOARD_DELIVERY_REQUEST_CONFLICT`，先复现 3 项失败，再修复至相关 53 项通过、类型通过；后者正在补真实 Git 回归。此前全量通过不覆盖这两个未测边界，阶段继续保持未交付。

## 范围与归属

复用 Task/Run、PostgreSQL/Flyway、GitCapability、ProcessExecutor、源码快照及验证记录。先支持 `EXTERNAL_MANUAL` 来源：人工/外部已完成的前端源码修改，由 EAP 采集、独立验证、审阅和接受。不得称 git-status Run 实施了修改；不意味着平台自动代码生成已完成。不新增执行调度器，不改变五入口。

每个 Run 最多一份不可变交付证据和一次接受/拒绝决定。只有完整交付、同源验证 PASSED、任务与原型版本未变化、当前源码未过期且无活跃/未知执行，才能提交验收。接受才到 done，拒绝回 ready；普通任务 update 不开放任意状态转换。预览/勾选是操作者陈述而非自动测试事实；不伪造用户最终接受。

## 接口约定

前缀 `/api/board/tasks/{taskId}/runs/{executionId}/delivery`。

- GET `?projectId=` → `Page { record: Delivery|null, prepareAllowed:boolean, reason:string }`，不执行进程或重采集。
- POST → 请求 `{ projectId, revision, workspacePath, requestId, paths:string[], note:string }`。服务端采集基线/差异/哈希；不接受可信结果/内容/hash。幂等重试使用原 requestId 与原内容；不同内容冲突。保存证据并进入 acceptance，增加任务 revision。
- POST `/decision` → `{ projectId, revision, requestId, deliveryId, decision:'ACCEPT'|'REJECT', criteriaConfirmed:boolean, previewConfirmed:boolean, comment:string }`。接受须两项人工声明都为 true，拒绝必须有理由；事务保存决定和列变化，重复身份只读原结果。
- `Delivery { id, source:'EXTERNAL_MANUAL', requestId, taskRevision, submittedRevision, workspacePath, baseCommit, verificationId, sourceHash, prototypeVersionId:string|null, goal, acceptanceCriteria, note, files:File[], createdAt, decision:Decision|null }`
- `File { path, beforeHash, afterHash, before:string, after:string }`，前端逐文件对比。不生成装饰性增删行数。
- `Decision { id, requestId, decision:'ACCEPT'|'REJECT', criteriaConfirmed, previewConfirmed, comment, operator:'local-operator', createdAt }`。

DTO 以实际 Java record 为准，同步 runtime-client 与 mock。Mock 无真实执行/验证时返回明确不可用，不构造成功交付。

## 边界

- 首版限 1–8 个 frontend 内常规 UTF-8 文本源码（vue/ts/tsx/js/jsx/mjs/cjs/css/html）；路径必须逐字合法、存在于有界源码清单，不允许链接、凭据、包管理配置、删除、重命名、二进制或子模块。大小写别名和路径归一化不能绕过限制。
- 基线固定为验证计划的 Git HEAD；不接受任意客户端 revision。保存原始字节哈希及文本比较；新增文件 beforeHash 为 absent。通过安全 Git argv 读取基线 blob，禁用 helper、限制输出、脱敏导致正文不完整则阻止交付。
- 允许文件须覆盖 frontend 范围内待交付变化；不得把未选择的源码修改静默算进交付。其他范围/排除项不冒充验证覆盖。
- 采集前后重验全 frontend 源码清单与验证记录一致，HEAD 不变；接受前再次核对。旧审阅 snapshot 的 hash 不是源码清单 hash，不能混用。
- Task→workspace 锁序保持一致。所有读取进程的未知清理必须有持久阻塞，不得随 HTTP 回滚丢失；不能为了本片绕开已有预检查保护。
- 源码变化后拒绝仍允许回 ready，接受必须失败。任务处于 acceptance 时禁止普通编辑/原型换版；证据和历史决定保留。
- 不读取用户 application.yml 或凭据，不改变绑定根，不代替用户真实人工验收。不自动推送用户交付源码；本仓库阶段提交推送遵循用户单独授权。

## 前端工作面

Run 操作区增加独立“源码交付与验收”对话框，L4 领域组合复用 @eap/ui Dialog/ConfirmBox/Button/Input/Textarea/Checkbox/Collapse/Select。准备、提交确认、逐文件对比、独立验证 ID、范围边界、接受/拒绝分开。不在任务准备面堆叠所有证据。禁用不满足条件的动作；响应丢失先重读，切任务/Run 丢弃迟到响应。

## 验证关口

先 RED→GREEN：空/越界/假结果/不完整差异、已验证源码变化、任务/原型变化、跨项目/Run、重复请求、并发决定、未知执行阻塞、拒绝回 ready、不能从只读 Run 直接完成。隔离 Git 真实采集 + 真实 PostgreSQL 事务验证；前端状态回放与真实服务浏览器。完整自动原型到源码仍需后续受控写入关口，不能在此宣布全规划完成。
