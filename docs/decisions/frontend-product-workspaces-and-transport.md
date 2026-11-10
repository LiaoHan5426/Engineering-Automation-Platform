# 管理工作面、独立 Mock 与通用请求客户端

状态：已按用户目标 4～8 集中实施，实现纳入本批提交；提交/推送沿用已保存验证结果，不重复测试。浏览器、协议和质量检查结果以[当前台账](../planning-status.md#product-workspaces)及[证据](../../frontend/apps/web/__tests__/browser/artifacts/product-workspaces/README.md)为准，用户产品接受独立。

## 产品信息与交互

默认页面展示当前对象、状态和可用操作。完整规则、文档正文、编辑表单、权限/执行诊断通过清晰入口进入详情、Tabs 或公共 Dialog。错误必须在当前弹窗内可见。取消未保存修改需要明确确认，选择保留时停留在原编辑上下文。

| 工作面 | 当前组织 |
|---|---|
| 规则库 | 规则包列表→包详情；规则、SQL 试算、事实词表分 Tabs；紧凑规则摘要→单条规则弹窗；新建/复制独立弹窗；内置只读、草稿校验、未保存确认及后端授权保持 |
| 知识库 | 知识库/文档列表；创建、改名、录入和文档阅读各自弹窗；取消录入与取消改名保护草稿；删除继续显示具体影响及后端拒绝 |
| 数据库资料 | 资料列表→编辑弹窗；基本信息、表结构、索引分 Tabs；放弃修改真正恢复保存快照，关闭脏表单先确认 |
| 技能 | 版本列表；导入与全文阅读弹窗；格式限制按需展开；本地文件选择只填入草稿，服务端校验、可信来源确认和保存保持独立动作；结果未确认时保留原保存请求 |
| 能力目录 | 种类及可用性总览；存储/绑定诊断独立弹窗；Git status/diff 使用独立检查页，UNKNOWN 核对、取消和历史证据继续可达；CLI 程序/操作与 MCP 登记表单为弹窗 |
| 插件中心 | 默认显示启停与运行状态；依赖及运行观测进入详情弹窗，只在明确点击时查询；停用确认继续说明后台工作与未知互锁，重新启用读取原状态 |
| 对话、专家、模型、场景、SQL、看板及设计器 | 保留已有工作面：会话摘要/变更面板、专家子页、模型连接弹窗、场景列表/详情/工作流、SQL 任务工作台、看板任务详情、设计/版本分面。清理当前可见开发备注及失效演示说明，逐页检查实际加载态和窄屏 |

修正相邻调用链三个根因：规则包创建读取 ref 的 `.value`，使复制真正采用原包；数据库放弃操作从 baseline 恢复字段，不能只改脏标记；子页自行保存/读回后，父页只刷新概览，避免重复加载重置正在打开的确认框。

## 唯一传输路径

`@eap/request` 位于 `frontend/packages/request`，只依赖 Axios，不导入 EAP 应用、业务合同、状态和消息。创建客户端可传 baseURL、timeout、动态 headers、并发请求计数与 Axios 配置/拦截器。提供统一错误识别、AbortSignal 取消、JSON 请求、流握手、multipart 上传及下载。地址、认证/刷新策略、响应信封及保存文件位置由调用方决定；不配置业务 URL、不自动重放写请求。

流握手复用同一客户端的 baseURL/default headers/动态 headers/credentials，超时只约束响应头，成功握手后清理计时器。长流生命周期及 SSE 帧/限额由 `@eap/runtime-client` 管理。平台 DTO、Accept-Language、ProblemDetail 和业务状态仍属于 runtime-client；NProgress 由 web/main 装配，不进入通用包。

`@eap/ui` 定义 FileUpload，消费注入的 UploadRequest 类型，支持类型/数量/大小校验、显式上传、进度、取消及销毁后忽略迟到结果。无 request 时仅为本地选择；技能页使用此模式读取文本，不因此上传或发布。UI 不依赖 runtime-client。`vsh` 明确允许无领域依赖的 request 包，并拒绝 request 反向导入业务包及正式源码导入 Mock。

## 独立 Mock 服务

`frontend/apps/backend-mock` 为独立 Node HTTP 进程，绑定 `127.0.0.1:53200`，可用 `EAP_MOCK_PORT` 改端口；只处理 `/api/` 与本机开发控制接口。响应带 `X-EAP-Simulation: true`。它不代理 Java、不调用供应商或真实执行器，数据保存在本进程内存，重启丢失。仅实现明确列出的模拟合同，未实现接口返回错误，不借真实后端兜底。

从仓库根在两个终端分别启动：

```powershell
rtk proxy pnpm --dir frontend dev:mock-server
rtk proxy pnpm --dir frontend dev:mock
```

web 的 `--mode mock` 仅把开发代理指向此服务；正式 `src` 没有环境开关、Mock 组件属性、专用完成状态或故障参数。普通开发默认代理 Java `:8080`，`EAP_API_PROXY` 可显式指定测试后端。生产构建不导入 Mock 模块。

故障注入在 Mock 服务端 `POST /__mock/faults` 配置下一次匹配的请求；调用方提供 method/path/outcome，路径只允许场景保存、固定 Git status/diff 启动及版本探测，不能指定任意上游。示例：

```json
{"method":"POST","path":"/api/cli-programs/git/operations/git-diff/executions","outcome":"unknown"}
```

之后页面通过普通 API 发起检查，收到标准 UNKNOWN。场景保存结果丢失使用 PUT 场景路径及 `save-lost`。该控制面不进入 Java、公共客户端或正式页面。

纯原型 Schema/版本解码合同移入 `@eap/runtime-client/contracts`，web 保留编辑器转换和浏览器存储；Mock 只依赖公开合同。测试可通过 Mock 包公开的 `./backend` export 使用模拟后端，web 仅声明 devDependency，无跨包私有源码导入。

## 测试与证据边界

删除旧 Vite Mock 模式、serviceConfig、前端本地 preview/PrototypeFlow、模拟 OAuth 确认，以及旧布局草稿/本地看板演示与 Mock 专用断言。Mock 协议测试迁入其所属包；授权、UNKNOWN、去重、取消、草稿、重连和迟到响应保护继续保留。

新增行为测试仅覆盖独立服务 HTTP/SSE/UNKNOWN 边界、通用传输的动态 headers/错误/取消/超时/上传/下载、FileUpload 的显式上传和销毁，以及新包依赖规则。单元测试仍仅访问本 worker 自建的 loopback 端口。真实浏览器单独执行，测试自身创建的规则包/资料/知识库按精确 ID 清理；Mock 技能写入仅在独立内存服务中。

本轮没有更改 Java 或数据库结构，不为界面和传输整理新增迁移；既有多文件交付及后端中英文结果沿用。真实后端读写、Mock HTTP 和浏览器交互分别报告，不把模拟技能、页面截图或技术验证称为用户产品接受。
