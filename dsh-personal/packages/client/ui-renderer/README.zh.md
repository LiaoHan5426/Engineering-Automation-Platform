---
description: "浏览器 UI 渲染器：普通 Slot 与可复用 Component Factory 的 Vue 绑定、ctx.uiRenderer 与组装后的 dsh Web 应用根。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-renderer

[English](README.md) | 中文

## 概述

`dsh-client-ui-renderer` 挂载组装完成的 dsh Web 客户端 GUI：完整客户端插件名册稳定后，启动内核调用 `ctx.uiRenderer.mount(container)`，它会 hydrate 不依赖框架的启动页，并在下一次绘制前切换到完整的 Vue 应用。业务插件仍是接收类型化 props 的普通 Vue 组件，通过 props 获取会话与 Workspace 数据，永远不需要自行接线订阅——渲染器在 slot outlet 处把运行时的裸 observable source 绑定为 selector 钩子。Web 外壳与启动内核是它仅有的直接消费方，因此只要组合需要 Vue 渲染的 GUI，就需要它。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本包属于基础设施：Web 外壳与启动内核是它仅有的直接消费方。只要组合需要 Vue 渲染的 GUI，就需要它——`dsh-client-web` 加载名册，等待名册稳定且启动审计通过，然后调用 `ctx.uiRenderer.mount(container)`。

### 挂载做什么

`mount(container)` 同步安装已物化模块的样式，在存在启动 DOM 时 hydrate，然后渲染应用。返回的 disposer 先卸载 Vue 再释放样式。每个 renderer 实例持有一个活动挂载；同时第二次挂载会被拒绝，旧 disposer 不会移除后续挂载。插件销毁也会释放活动挂载。渲染器执行唯一的上下文级 `renderSlot('root')`，根占用方拥有产品布局。

### 对业务插件

业务插件注册普通 Slot entry 或可复用 Component Factory；渲染器在渲染位置把运行时的会话与 Workspace observable source 绑定为 selector 钩子。插件通过推导出的 Component props 收到标准 scope props，不管理注册表订阅，也不触碰 Vue 内部机制。每个由 renderer 创建的 Component 都能渲染 Factory occurrence，Factory 也能暴露由调用方选择的局部 Component，而无需在包之间共享实现值。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包实现一条边界：对象层（运行时，不依赖框架）拥有业务状态；这里是 ctx 到 Vue 集成唯一发生的位置——slot 渲染器、`SessionProvider` 与框架 selector 钩子的绑定。

### 激活与挂载

插件注入 `modules`，安装 Slot renderer，并发布 [`UiRenderer`](src/client/renderer.ts) 实例。其 [`DocumentStyles`](src/client/styles/document-styles.ts) 构造器只保留依赖；显式 `mount()` 订阅模块记录变化，并在 Vue 挂载前安装 CSS。后续物化、依赖变化和失效会同步更新资源。元信息及逐文件文本缓存由 renderer 持有，并以模块记录为键，替换后的记录不会复用旧文本。

对于带有 `meta` 的模块，样式来自其可选的 `stylesheets` 字典：以样式在所属包内的路径为键，每份描述提供 `text(context)`。安装的每个 style 元素以 `data-plugin` 携带所属包名，以 `data-path` 携带该路径。已加载依赖的资源先于消费者；同一包内相同路径共用一个 style 节点。组件挂载和卸载不登记样式。失败只影响其自身的样式：模块的 `meta()` 或某份描述的 `text()` 抛错，或某路径已有同一包内另一模块提供的不同 CSS 时，renderer 不安装该样式，通过 `console.error` 报告一次，并照常安装其余样式。路径冲突时保留已安装的文本。失败的生产函数只会在替换后的模块记录上重新运行。实时替换期间，旧样式保留到被替换的插件完成卸载。

### Slot 绑定

`createVueSlotRenderer` 把现有 slot 注册表连接到原生 Vue outlet 与 Factory occurrence。组件在 setup 中绑定一次 renderer 提供的 selector 钩子，在 render 中通过 `.value` 读取只读浅 ref。source 替换会先释放旧订阅，再绑定新 source；已销毁绑定的排队回调不能发布值。相等比较保留所选快照的身份，外部发布首次进入条件分支时，其中的响应式 selector 输入也会被跟踪。Factory Store 保持 lazy，每个 occurrence 保留一个 exclusive handle，且拒绝持久化。Factory 失败经普通监督通道报告，不会 abdicate 共享 definition：definition 与 fallback 局部 Component 的失败归属 definition，调用方所选局部 Component 的失败归属调用方 registration。

客户端入口仍重导出静态 [ui-primitives](../ui-primitives/README.zh.md#observable-selectors) 持有的 `useObservableSelector`。业务插件直接导入静态库，不通过 `dsh.client.external` 请求 renderer 实现。

Contextual hook 在 factory、hook context 和各项框架输入身份保持不变时保留自己的子 scope。新建 options 或输入包装对象不会重启 effect 或替换可写 DOM 目标。factory、context、框架 key 或框架值变化时，先释放旧 scope 再绑定；替换失败也会释放部分创建的 scope，并清空转发的 DOM 目标。factory 或 hook 内部的读取不会成为绑定依赖。

撤销 registration 会立即使 entry 或 Factory owner 失效。在 Vue 提交 outlet 移除前，仍驻留的 occurrence 停止解析 Store 和 injection face；保留的渲染授权仍会拒绝过时调用。

空白的可选 Session scope 首次接纳会话时不 remount；后续上下文 generation 改变或丢失会创建新的 incarnation。SessionProvider 与 HOC 组件接受原生 default slot。每个已挂载应用拥有独立的 Vue ID 前缀，旧 mount disposer 不能移除替代挂载。卸载失败会传到 mount owner，同时仍释放模块样式。

框架字段只通过对象组件和类组件声明的运行时 props 或 emits 传入，包括 mixin 与 `extends` 继承的声明。调用方输入保持原样，包括原生属性、监听器、VNode key 与 ref，并覆盖同名框架字段。函数组件接收完整输入。Factory 所选及 fallback 局部组件遵循同一规则。惰性组件通过显式声明 props 的外层组件暴露框架输入，其异步实现仍延后加载。

### 身份

Vue、Cordis、ui-slots 与 ui-primitives 通过 Web 外壳的静态模块表保持同一浏览器身份；本包则以动态客户端 bundle 的形式加载。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖周边机制与组合模型。

- [ui-slots](../ui-slots/README.zh.md)——本渲染器绑定到 Vue 的 slot 注册表纯核心。
- [web](../web/README.zh.md)——加载名册并调用 `mount` 的外壳。
- [ui-session](../ui-session/README.zh.md)——提供本渲染器所绑定标准会话 source 与钩子的适配器。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——加载链、对象层与分层红线。
- [slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——权威组合模型。
- [Component Factory](../../../.agents/notes/implemented/architecture/2026-09-10-component-factories-and-local-slots.zh.md)——可复用 definitions、局部 Component 选择与 occurrence 生命周期。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端渲染组装层，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明应用首帧何时出现、按区域就绪能走多远；它们是当前包约束。

- **应用首帧会等待整个客户端名册**：启动内核只在 loader 名册稳定且启动审计通过后交出挂载点；按区域就绪仍属暂缓事项。
- **仅支持主文档**：没有 Document Scope 或 Shadow DOM 放置，样式按模块而不是组件粒度保留。
- **slot 渲染没有 Suspense 集成或逐 entry 惰性加载**：完整插件名册稳定后，渲染器才挂载根节点。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
