# S2 最小契约：可信工作台插件

状态：契约已确认。P0/P1 可点击原型已按该契约实施，供人工验收。Handoff、真实 Mission、外部 Agent、Electron 与 GrapesJS 仍后置。日期：2026-10-24。

前置是已收口的 [S1 Chat](s1-chat-spring-ai-design.md)。真实供应商验证仍是可选项，不阻塞这份契约的审阅。

## 当前导航事实

`frontend/apps/web/src/App.vue` 仍用 hash 切换页面。壳拥有固定页；预装插件入口由 `frontend/apps/web/src/features/plugins` 的编译期注册表按启停生成：

| id | 分组 | 页面 |
|---|---|---|
| `sql` | 工作，默认页，壳 | 分析工作台 |
| `chat` | 工作，插件，可启停 | S1 对话页 |
| `builder-alpha`、`builder-beta` | 工作，插件，可启停 | 两个 Builder 实例 |
| `plugins` | 设置，壳 | 插件中心 |
| `experts`、`rules`、`knowledge`、`databases`、`capabilities` | 设置，壳 | 现有管理页 |

`sql` 和设置页继续直接挂在壳上，不进入插件包。Chat 作为预装插件沿用 S1 页面与 `#chat`，不重写其业务实现。S2 原型不得删除既有页面。

## 两个对象

- **插件定义**：编译期受信模块的身份、版本、贡献的导航和命令。预装只有 `chat` 与 `builder`。定义不保存某个仓库或某个原型草稿。
- **实例配置**：`pluginId + instanceId` 下的用户配置。Chat 先只有一个实例，沿用 S1 页面。Builder 可以有多个实例；每个实例单独保存模拟仓库标签、草稿和按钮交互。实例之间不读对方的配置。

启停只改变导航和能否新建操作。禁用 Builder 隐藏其入口，保留已有实例配置和原型草稿。卸载与删除数据不是这一步。

再次启用后，同一实例的草稿、按钮交互和模拟仓库标签必须恢复。禁用 Chat 只影响插件入口；插件配置的保留不改变 S1 对话的进程内存生命周期，后端重启后不能据此恢复会话。

## 注册边界

壳拥有注册表。预装模块在构建期登记，Manifest 不能按字符串 `import()` 任意路径。插件不改全局路由、不访问其他插件的内部状态，也不因为安装就获得仓库写权限或 Mission 执行权。

注册表只生成插件入口；固定页 `sql`、`experts`、`rules`、`knowledge`、`databases`、`capabilities` 仍由壳拥有，插件 hash 不得占用这些 id。Chat 单实例沿用 `#chat`。原型阶段可以仍用现有 hash 壳承载动态入口，不必先引入 Vue Router。

## 原型配置持久化

配置先放在浏览器 localStorage，使用独立于既有 `eap.console.*` 的键命名空间，并按 `pluginId + instanceId` 分开保存。两个 Builder 实例不得共用一个存储键。刷新或重新打开同一浏览器来源后，应能读回原有实例配置与草稿。

界面必须标明这是浏览器本地原型存储，不是服务端 `plugin_config_revision`、审计或可恢复 Mission。原型存储不承担 S1 对话历史恢复。

## 权限申请与授予

Manifest 中的 `permissions` / `requires` 仅表示申请或依赖声明，不构成授权。授予必须有另一条明确记录，默认没有授权；安装、启用插件或绑定模拟仓库标签均不产生授予。

S1 的 `toolMode=git_status` 同样只是申请，实际放行仍须服务端授权根校验与 `CapabilityHandlerRegistry.resolveFor` 等现有权限检查。插件不能绕过这些服务端边界。

原型中的仓库标签、任务卡片和审批均标明“模拟”，不写入 `expert_mcp_grant` 或新的授权表，也不产生真实执行权限。未授予仓库写权限时，Builder 可以编辑草稿，不能执行写入，也不能表示仓库已被改写。

## 原型验收

审阅通过后的最小可点击原型应满足：

- 插件中心列出预装 Chat 与 Builder，启停后导航出现或消失。
- 禁用后再次启用 Builder，同一实例的草稿、按钮交互和模拟仓库标签仍在。
- 两个 Builder 实例各自绑定不同的模拟仓库；绑定处标明“模拟”。
- 两个实例配置分别保存；刷新或重新打开同一浏览器来源后恢复，互不串数据。
- 不调用模型也能手工编辑、让按钮产生可见交互、保存后重新打开，并用真实 Vue 组件预览。
- 可以演示任务卡片和一次模拟审批，界面标明模拟。这不表示后端已有自主执行、重启恢复或调度器。
- 分析工作台和设置页保持可用；Chat 启用时 S1 对话页保持可用，禁用时只隐藏插件入口，不承诺重启恢复对话。

本轮范围对应 §0A.4 的 S2 与 §2B.9 的 P0/P1，并停在 P2 之前。首版使用真实 Vue 组件预览，GrapesJS 不在本契约范围内。Handoff、任务互通、后端继续推进任务、完整 Mission 调度、外部 Agent 和 Electron 留在原型验收之后。

P0/P1 可点击原型已按本契约实现。随后的交接记录见 [P2 交接契约](p2-handoff-contract.md)：它写入独立的未执行意图，不读取模拟审批，也不启动 Mission。任务壳由单独动作创建，见 [P2 Mission 契约](p2-mission-contract.md)。
