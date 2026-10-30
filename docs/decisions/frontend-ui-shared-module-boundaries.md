# 前端 UI / 共享模块边界与 Agent 落点规范

状态：**有效决策**（约束 Agent 与人工增量；不等于下列目标包均已落地）  
适用范围：`frontend/` 工作区  
关联：[`module-layout.md`](../module-layout.md)、[`frontend/AGENTS.md`](../../frontend/AGENTS.md)、[`agent-development-guide.md`](../agent-development-guide.md)、v1.6 §2B/§3A 插件与原型规划

## 1. 目标

随着页面与能力增多，禁止在 `features/*` 内复制按钮、弹窗、焦点陷阱、布局壳等基础实现，也禁止无规划地新增平行包或「顺手」堆共享工具。  
约定：**基础组件先入 `@eap/ui`；可复用组合件先判层再落点；跨域基础设施用独立模块（或受控子树）统一规划。**

## 2. 分层（由内到外）

| 层 | 允许内容 | 禁止内容 |
|---|---|---|
| **L0 Token / 主题** `@eap/style` | 颜色、字号、间距、主题切换 API | Vue 组件、业务文案 |
| **L1 基础组件** `@eap/ui` | 无领域依赖的展示与交互原语（Button、Dialog、ConfirmBox、Badge、Feedback、Panel、EmptyState、Input/Switch 等） | 调用 `@eap/runtime-client`、读写任务/会话/插件状态、页面路由编排 |
| **L2 共享基础设施**（见 §3 模块表） | 与领域无关的 hooks、effects、layout 壳、toggle 控制、plugin 契约运行时 | 单一业务 feature 专用逻辑；绕过 `@eap/ui` 再造一套按钮/弹层 |
| **L3 可复用组合件** | 由 L1/L2 组装、被 ≥2 个 feature 或插件槽复用的产品块（如 ConnectionDialog 壳策略、看板列骨架） | 仅单页使用却提前抽包；在组合件内复制 L1 样式壳 |
| **L4 Feature** `apps/web/src/features/<area>` | 领域页面、局部状态、该域专用组合 | 新的平行 `Modal.vue` / `PrimaryButton.vue`；跨 feature 相对路径偷共享 |
| **L5 App 壳** `App.vue` / 导航 | 导航与工作台装配 | 领域 API 编排、可复用 UI 实现 |

**默认落点**：找不到合适层时，**先加 `@eap/ui` 原语或留在当前 feature**；只有满足 §4 抽包条件才新建 `packages/*`。

## 3. 规划中的统一模块位置

下列名称是**规划落点**。未建包前，允许在 `@eap/ui` 或 `apps/web/src/lib` 以**同名目录**暂存，但必须在本文件「暂存登记」中注明，并在第二次跨 feature 复用前完成抽包或迁入正式包。

| 模块 / 包名（规划） | 职责 | 典型内容 | 依赖方向 |
|---|---|---|---|
| `@eap/style` | Design token 与主题 | light/dark、`applyTheme` | 无前端业务包 |
| `@eap/ui` | **全部**基础组件与其 BEM 样式 | Button、Dialog、ConfirmBox、Badge、Feedback、Panel、EmptyState、StatusCard、MetricCard；后续 Input、Select、Switch、Tabs、Tooltip… | 仅 `@eap/style` |
| `@eap/hooks` | 无 UI 强绑定的 Vue composable | `useFocusTrap`、`useEscClose`、`useMediaQuery`、本地偏好键读写（无业务实体） | Vue；**不**依赖 runtime-client |
| `@eap/effects` | 动效 / 过渡 / 可访问性反馈原语 | 统一 transition 名、reduced-motion 包装、加载 shimmer 类 | 优先纯 CSS/小工具；可被 `@eap/ui` 引用 |
| `@eap/layout` | 壳层布局原语（非业务页） | SplitPane、Dock/Rail 槽位、WorkbenchFrame、滚动区约定 | `@eap/ui` + hooks；不含 Chat/Board 业务 |
| `@eap/toggle` *或* 并入 `@eap/ui` | 开关类控制 | Switch、Segmented、ThemeToggle（纯展示） | 默认**先做进 `@eap/ui`**；仅当体积/依赖独立时再拆 `@eap/toggle` |
| `@eap/plugin-sdk` / `@eap/plugin-runtime` | 工作台插件契约与可信运行时 | Manifest、贡献点、启停、槽位 | 见 v1.6 §2B；**不等于** Skill/MCP |
| `@eap/plugin-table` | 纯表格插件（vxe-table + `@vxe-ui/core`） | `Table`；分页用 `@eap/ui` Button | 不 `app.use` vxe-pc-ui，不把表格实现放进 `@eap/ui`。vxe-pc-ui 只作类型依赖 |
| `@eap/runtime-client` | HTTP 与 DTO | API 客户端 | 被 feature / 可选 L3 使用；**不被** `@eap/ui` 依赖 |
| `@eap/prototype-*` | Grapes / Schema / 预览 | 见 v1.6 §3A | 懒加载；不进全站主包 |

### 3.1 `apps/web` 内允许的共享位置

```text
apps/web/src
  features/<area>/     单域页面与局部逻辑（默认）
  components/          仅应用壳专用、且暂未满足抽包条件的组合（须短注释说明为何未进 packages）
  lib/                 非 Vue 展示组件的工具：i18n 文案、脱敏、serviceConfig、纯函数
```

禁止：`features/A` 通过 `../B/...` 引用另一 feature 的 `.vue` 当作共享库。应上提到 L1–L3 或 `components/` 并登记。

### 3.2 暂存登记（当前）

| 内容 | 暂存位置 | 目标模块 | 触发抽包条件 |
|---|---|---|---|
| Dialog / Button / Input / Select / Textarea / Checkbox / Switch / FileInput / Slider / Scrollbar / InfiniteScroll / Tabs / Popover | `packages/ui`（已落地） | `@eap/ui` | — |
| `useFocusTrap` / `useEscClose` | `packages/ui/src/hooks`（Dialog 与 ConfirmBox 共用） | `@eap/hooks` | feature 需要同一陷阱时抽包；在此之前不得另写一份 |
| ConnectionDialog | `apps/web/src/components/ConnectionDialog.vue`（薄包装 Dialog） | 保持薄包装；壳能力只在 Dialog | 出现第三处平行弹层实现时必须删平行实现 |
| SessionPanel / WorkspaceWelcome / RepositoryBrowser | `apps/web/src/components/`（聊天装配与会话轨共用；领域状态仍在 `features/shell`） | SessionPanel 的 Dock/Rail 契约 → `@eap/layout`；目录树保持应用组合件 | 第二工作台复用同一 Dock/Rail 契约时抽 layout 包 |
| 工作台 Dock/Rail 样式 | `features/chat` 与 `work-pages.css` | `@eap/layout` | 同上 |
| PluginSlot | `features/plugins`；聊天页由 `App.vue` 以 `chatView` 注入，避免插件 feature 引用聊天 `.vue` | `@eap/plugin-sdk` + runtime | 用户批准插件迁移切片后 |
| 场景页引用 shell 原型组件 | `features/ScenarioWorkspace.vue` → `features/shell/LayoutDraft.vue`、`GrapesEditorScaffold.vue` | 仍属原型 feature；下一次改原型壳时再上提 | 第二处复用同一编辑器壳时迁 `components/` 或 `@eap/prototype-*` |

## 4. 何时新建 `packages/*`

**同时**满足再提 PR/切片创建新包，并**先改本文件与 `pnpm-workspace.yaml`**：

1. ≥2 个 app 或 ≥2 个 feature **已**需要同一实现；或存在循环依赖风险必须切断；  
2. 依赖边界清晰（例如 hooks 不应拖进 GrapesJS）；  
3. 有公开 `package.json` 入口与 `check:boundaries` 可检路径；  
4. 不与现有 `@eap/ui` / `@eap/style` 职责重叠。

**不要**：为「目录好看」一次性搬迁全部页面；不要同时引入第二套组件库替代 `@eap/ui`（Reka/shadcn 仅可作实现参考，见 v1.6）。

## 5. Agent 工作流（强制）

新增或修改前端 UI 时，按顺序执行并在交付说明中勾选：

1. **搜**  
   - `packages/ui/src`、`packages/*/src`、`apps/web/src/components`、`apps/web/src/lib`  
   - 是否已有 Dialog/Button/ConfirmBox/同类 hook  
2. **判层**（§2）：原语 → `@eap/ui`；无领域 composable → hooks（或暂存登记）；壳布局 → layout；业务页 → feature  
3. **写原语（若缺）**  
   - 目录：`packages/ui/src/<name>/`（`Name.vue` + `name.css`）  
   - 导出：`src/index.ts`  
   - 样式汇总：`src/styles.css`  
   - 类名：`eap-<block>` / `__` / `--`  
   - 单测或现有消费者测试至少覆盖开关路径  
4. **写组合**  
   - 单 feature：落 `features/<area>`，用 `@eap/ui` 组装  
   - 多 feature：落 `components/` 或目标 L2/L3 包，**禁止**复制 L1  
5. **文档**  
   - 新包或新模块类别：更新本文件 §3 与 [`module-layout.md`](../module-layout.md)  
   - 暂存：写入 §3.2  
6. **验证**  
   - `pnpm --dir frontend check:boundaries`、相关 `typecheck` / 单测  
   - 交付中区分：已验证 / 跳过 / 未验证  

### 5.1 明确拒绝的做法

- 在 feature 内再写一套 `role=dialog` Teleport / 原生 `showModal` 顶层弹层，导致 ConfirmBox 无法叠层  
- 新增 `packages/components`、`packages/shared-ui` 等与 `@eap/ui` 平行的含糊包名  
- 把领域 `useBoardTasks` 之类放进 `@eap/hooks` 或 `@eap/ui`  
- 未更新本规范就批量搬家或引入完整第三方 UI 套件  

## 6. `@eap/ui` 当前清单与扩展原则

**已导出（实现事实以 `packages/ui/src/index.ts` 为准）**：Button（含 size）、Badge、Tag、Feedback、Panel、MetricCard、EmptyState、StatusCard、ConfirmBox、Dialog、Input、Select、Textarea、Checkbox、Switch、FileInput、Slider、Scrollbar、InfiniteScroll、Tabs、Popover。`useFocusTrap` / `useEscClose` 从同一入口导出，仍是 `@eap/hooks` 的暂存实现。

**目录约定（防止平行实现）**：

- L1 原语只允许 `frontend/packages/ui/src/<kebab>/`，内含 `Name.vue` 与 `name.css`，并由 `src/index.ts`、`src/styles.css` 导出。禁止在 `features/` 或 `components/` 再写一份同职责控件。
- 无界面的 composable 暂存在 `packages/ui/src/hooks/`。抽成 `@eap/hooks` 的条件仍是 §4（已有第二处 feature 需要同一实现），不是「控件目录还没补齐」。
- 跨 feature 组合件落 `apps/web/src/components/`，并在 §3.2 登记。`@eap/plugin-sdk` 仍等用户批准的插件迁移切片（§7）。表格已单独落在 `@eap/plugin-table`，不因此提前建工作台插件 SDK。
- 下表未落地的名称只是保留目录。出现真实调用之前不要建空组件，也不要在页面里先写原生替代品。

| 名称 | 固定目录 | 状态 |
|---|---|---|
| Button、Badge、Tag、Feedback、Panel、MetricCard、EmptyState、StatusCard、ConfirmBox、Dialog、Input、Select、Textarea、Checkbox、Switch、FileInput、Slider、Scrollbar、InfiniteScroll、Tabs、Popover | 见 `index.ts` | 已落地。Scrollbar 是滚动条；InfiniteScroll 包住它，靠近起点或终点时发出 `load`。对话列表向上展开更早的消息 |
| Alert | 不另建；使用 `Feedback` | 已有等价物 |
| MessageBox / Popconfirm | 不另建；破坏性确认用 `ConfirmBox`，就地说明用 `Popover` | 已有等价物 |
| Card | 不另建；使用 `Panel` / `MetricCard` / `StatusCard` | 已有等价物 |
| Radio | `packages/ui/src/radio/` | 保留；出现互斥选项组再写 |
| Tooltip | `packages/ui/src/tooltip/` | 保留；点击菜单继续用 `Popover` |
| Cascader、DatePicker、Transfer、TreeSelect、Rate | `cascader/`、`date-picker/`、`transfer/`、`tree-select/`、`rate/` | 保留 |
| Collapse、Descriptions、Image、Skeleton | `collapse/`、`descriptions/`、`image/`、`skeleton/` | 保留 |
| Table | `@eap/plugin-table` | 已落地。按 vxe-table v4「仅表格」安装：`vxe-table` ~4.23.12 与 `@vxe-ui/core` ~4.5.4，应用只 `use(tablePlugin)`。vxe-pc-ui ~4.20.33 仅类型提示（文档写 4.20.34，当前源上最新是 4.20.33），页面不得导入它。单元格里的按钮、徽标继续用 `@eap/ui` 插槽。超过 20 行时用自带分页，不使用 vxe 的分页组件 |
| Pagination、VirtualizedTable | `pagination/`、`virtualized-table/` | 保留。服务端分页契约出现后再做独立分页；虚拟滚动仍用表格插件的能力，不另建组件 |
| Timeline、Tour、Tree、VirtualizedTree、Statistic、Segmented | `timeline/`、`tour/`、`tree/`、`virtualized-tree/`、`statistic/`、`segmented/` | 保留；Segmented 与 Switch 同属开关类，默认留在 `@eap/ui`，不拆 `@eap/toggle` |
| Affix、Anchor、Backtop、Steps、Drawer、Loading | `affix/`、`anchor/`、`backtop/`、`steps/`、`drawer/`、`loading/` | 保留；Drawer 不得另做一套顶层弹层，叠层仍遵守 Dialog / ConfirmBox |
| Message、Notification | `message/`、`notification/` | 保留；页内状态继续用 `Feedback` |
| Divider、Progress、Splitter | `divider/`、`progress/`、`splitter/` | 保留；Splitter 若变成工作台分栏壳，再按 §4 进入 `@eap/layout` |

**主题变量**：组件与控制台皮肤只覆盖 `@eap/style` 的 `--eap-*`（颜色、字号、间距、圆角、层叠、阴影）。短名 `--bg`、`--accent` 等是别名。类名前缀固定为 `eap-`，由 stylelint 检查，不做 Element Plus 那种编译期 namespace。不引入 Sass：同一语义色用 `color-mix()` 从一枚 `--eap-color-*` 推出浅底和描边。

**扩展原则**：先补交互所需最小原语（输入、开关、选项卡、工具提示等），再考虑复合控件；复合控件若仍无领域依赖可留在 `@eap/ui`，一旦绑定 runtime/插件则降为 L3 并迁出。

**叠层约定**：内容模态用 `Dialog`（约 z-index 50）；破坏性确认用 `ConfirmBox`（高于 Dialog）。禁止混用原生 top-layer `<dialog>.showModal()` 与 ConfirmBox 而不做叠层验证。

## 7. 与插件 / 原型规划的关系

- **Plugin**：UI 工作台插件走 `@eap/plugin-sdk` / runtime；Skill、MCP、CLI 不是 UI 插件包。  
- **Prototype**：Grapes 与 Schema 在 `@eap/prototype-*`；预览应注册/复用 `@eap/ui` 适配器，禁止把设计器 HTML 当生产源码。  
- 上述包**目标结构**，实施以用户批准切片为准，本文件只锁定**落点规则**以免无序膨胀。

## 8. 运行时观测：`vite-plugin-vue-mcp`（辅助，非落点源）

仓库已依赖 `vite-plugin-vue-mcp`（`apps/web`），在 `vite.config.ts` 中**默认关闭**：仅 `vp dev` 且环境变量 `EAP_VUE_MCP=true` 时挂载，监听 `127.0.0.1`，`updateCursorMcpJson: false`（不自动改 Cursor MCP 配置）。端点：`http://127.0.0.1:<vite-port>/__mcp/sse`。须先打开浏览器中的应用页面，工具才有运行时数据。详见 [chat-engineering-task-slice](chat-engineering-task-slice.md) 中的启用说明。

### 8.1 能支撑什么

| 能力 | 对 UI / 共享模块工作的价值 |
|---|---|
| `get-component-tree` | 确认页面实际挂载的是 `Dialog` / `Button` / `ConfirmBox` 等 `@eap/ui` 实例，而非 feature 内平行壳 |
| `highlight-component` | 交互验收时定位弹层、按钮、布局槽是否在预期节点 |
| `get-component-state` / `edit-component-state` | 查 props/本地状态（如 Dialog `busy`、看板草稿），辅助复现叠层/脏数据问题 |
| `get-router-info` / Pinia 工具 | **当前产品收益有限**（未全面采用 Vue Router / Pinia 时几乎无数据） |

适合作为 §5 第 6 步的**可选运行时证据**：迁移 Dialog 后，在已启用 Vue MCP 的 dev 会话中打开看板/连接弹窗，用组件树证明壳来自共享组件。

### 8.2 不能替代什么

- **不能**规定 hooks / effects / layout / plugin 包边界或阻止新建平行 `Modal.vue`（那是静态规范 + `check:boundaries` + 本文件）。  
- **不能**在未跑 dev、未开浏览器时当「组件目录真相」；源码清单仍以 `packages/ui/src/index.ts` 为准。  
- **不能**单独冒充业务验收（HTTP/持久化/任务状态仍要测）。  
- 自定义 `mcpServerSetup` 可扩展「列出 `@eap/ui` 导出」类工具，属增强切片，**未实现前不得当作已有能力**。

### 8.3 Agent 使用约定

1. 需要运行时组件树时：确认用户已 `EAP_VUE_MCP=true` 启动 web，且浏览器已加载目标页；再连 `/__mcp/sse`。  
2. 交付中标注：Vue MCP 证据 / 未启用跳过 / 连接失败未验证。  
3. 与 cursor-ide-browser 可并用：浏览器负责点击路径，Vue MCP 负责组件身份与状态；二者都不能改写本文件的落点规则。

## 9. 验收（规范本身）

| 检查项 | 通过标准 |
|---|---|
| Agent 增量含新按钮/弹层 | 来自 `@eap/ui` 或本文件登记的暂存，无平行壳 |
| 新增共享目录/包 | §3 有行；`module-layout` / `frontend/AGENTS.md` 有入口 |
| boundaries | `check:boundaries` 无越包相对导入 |
| 文档诚实性 | 未宣称未建包「已完成」 |
| Vue MCP（可选） | 启用时组件树可见共享原语；未启用不得伪造成功 |

修订本决策时保留本文件为唯一落点规范；勿再平行新增「又一份组件目录说明」而不互相链接。
