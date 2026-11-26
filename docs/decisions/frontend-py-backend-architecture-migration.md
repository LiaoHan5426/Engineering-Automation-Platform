# 前端基础包与 py-backend 分层迁移

状态：架构提案。基于 2026-11-26 工作区，含正在开发的 Notify Bus 和壳层布局调整。

## 前端

| 归属 | 职责 | 首批调用方 |
| --- | --- | --- |
| `@eap/layout` | 工作台布局、左右区域、滚动归属、窄屏覆盖及关联的关闭与焦点交互。通过 Vue slots 暴露区域。 | Web 工作台壳与工作文档、场景设计、交互模式页面 |
| `@eap/i18n` | 为每个 Vue app 创建翻译实例，提供按命名空间注册词典及切换 locale 的入口。 | Web 启动入口与各业务词典 |
| `@eap/message` | Message 短时反馈、Notify 可关闭通知、应用级展示 Host，提供 Vue 组件和对应指令。 | Web NotifyHost 与首个本地操作反馈场景 |

### 布局与插件挂载

当前 `App.vue` 同时管理路由内容、右栏折叠、窄屏遮挡和 Cordis 容器。`styles/work/layout-outlets.css` 与 `work-document.css` 都根据同一个挂载节点计算列布局。迁移后由布局包统一分配区域和列宽，页面提供内容与区域配置。Web 壳负责把插件席位映射到布局区域，并在首次加载插件前声明席位。席位注册表继续归 `@eap/plugin-runtime`。Web 适配器提供既有 `#eap-cordis-sidebar-right` 节点及状态同步，路由切换期间节点保持稳定。验收覆盖真实路由、插件启停、折叠、窄屏遮挡、Escape 和关闭后焦点恢复。

### 国际化

当前 `apps/web/src/lib/i18n.ts` 在两个 locale 块中分别组装同一批词典，还负责接入运行时请求语言。由各模块导出自己的词典，应用将命名空间和各 locale 的词典一次性注册进实例。动态插件通过宿主注入的同一注册入口贡献独立命名空间。注册冲突显式报错，缺失翻译使用应用配置的回退 locale。原有 key、zh-CN/en-US 和请求语言联动纳入迁移验收。请求语言适配留在应用入口。Electron 壳使用 Web 渲染入口，按渲染实例挂载基础设施。

### 消息反馈

当前 `notifyBus.ts` 同时处理协议去重、焦点抑制和会话徽标，`NotifyHost.vue` 负责展示。保留域事件总线及其游标、去重、徽标和 surface 规则。Web 适配器将选中的展示事件交给共享消息 Host。建议首版 API 为 `<Message>`、`<Notify>`、`v-message`、`v-notify`，组件由可见性状态驱动，指令绑定显式触发事件，卸载时清理监听。四个入口复用同一套展示队列与关闭逻辑，并支持鼠标和键盘操作。通知底层控件复用 `@eap/ui`。本地反馈直接进入展示队列，服务端推送沿现有 NotifyEvent 通道进入同一出口。会话徽标、领域横幅和对话框的产品规则继续归 Web。

## py-backend

现有 `api`、`domain` 和 `persistence` 已有分层雏形。越层集中在 ChatService 直接操作 SQLModel、调用 LLM、构造 SSE 和发布终态通知，以及 Git API 把数据库 engine 传进服务。插件路由当前也协调安装失败通知。优先调整依赖和调用入口，再按职责移动文件。

| 层 | 职责 |
| --- | --- |
| 接口 `api/` | FastAPI HTTP/SSE/WS、输入校验、错误码映射和 wire 编码，调用应用用例。 |
| 应用 `application/` | 按 conversation、catalog、execution、plugins、notifications 组织用例。管理编排和事务边界，通过实际需要的接口访问外部能力。 |
| 领域 `domain/` | 状态、错误码与转移规则。Conversation turn、执行互锁、插件安装状态等规则由所属领域维护。 |
| 基础设施 `infrastructure/` | SQLModel/SQLite、LLM、Git/文件系统、插件安装与 Host bridge 的外部适配，以及通知传输所需的并发实现。 |
| 组装入口 `main.py` | 绑定实现、路由与生命周期，统一初始化和关闭。 |

依赖方向为 API → 应用 → 领域。基础设施实现应用所需的接口，由组装入口注入。接口层将结构化 turn 事件编码成原有 SSE 帧。插件安装用例负责失败通知触发，API 负责映射失败响应。保持现有 HTTP/SSE/WS 合同、SQLite 存储和会话幂等键，继续以 py-backend 作为 Chat 与插件安装权威，工作区由 `workspace_root` 和 Host `session.cwd` 确定。

## 实施顺序与验收

1. **布局切片**。先用工作台真实路由做可点击验证，确认正常与窄屏布局。一次迁移共用外壳和插件挂载适配，删除已替代的按页面列宽规则。验收看路由切换和插件交互。
2. **i18n 切片**。迁移双语现有词典，验证命名空间注册、动态注册、回退和切换语言后的请求 header，并移除原集中组装表。
3. **消息切片**。接上当前 Notify Bus 和一个本地实际操作，验证组件、指令、键盘及服务端事件去重，迁移已有展示 Host。
4. **Python 分层切片**。先沿 Git 执行链移除路由对 engine 的依赖，确立组装和应用边界。再完整迁移 Chat turn 的持久化、执行状态、模型输出、SSE 与终态通知，最后迁移插件安装和 Host 路由。每条链完成后清除旧入口。
5. **联验**。运行前端边界检查、类型检查和受影响测试。Python 优先覆盖 Git/history、open/send/graph、SSE、Notify、插件安装及 Host 错误。检查取消、重复发送、UNKNOWN 恢复、草稿保护和插件授权。涉及域合同时运行域合同校验。

现有工作区同时修改了壳层、Notify Bus、Chat 和插件入口。实施时以这些内容的实际合并状态为基线，按调用链迁移并保留已有改动。

## 落地与联验

- Web 已接入布局、国际化和消息基础包。DSH 词典通过宿主翻译实例注册，插件释放时撤销注册。
- py-backend 的 Git、Chat turn、插件安装与 Host 路由已接入应用层。HTTP 层编码 SSE，基础设施持有 SQLite、Git、模型与插件外部适配。
- 隔离环境验证了实际 py-backend 的插件启停和 Host 网关，以及浏览器通过 WebSocket 接收安装失败通知。右栏的窄屏焦点、Escape 和路由切换使用模拟席位验证。
- DSH 客户端宿主已接入右栏标签注册表与控制器。现有 Vue 布局负责停靠和窄屏交互，DSH 插件负责渲染其标签页。可选服务使用延迟注入。文件查询与预览走 py-backend 的工作区授权和 DSH 文件响应合同。
