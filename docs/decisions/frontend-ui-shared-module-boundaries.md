# 前端 UI / 共享模块边界与 Agent 落点规范

状态：**有效决策**（约束 Agent 与人工增量；不等于下列目标包均已落地）  
适用范围：`frontend/` 工作区  
关联：[`module-layout.md`](../module-layout.md)、[`frontend/AGENTS.md`](../../frontend/AGENTS.md)、[`agent-development-guide.md`](../agent-development-guide.md)、v1.6 §2B/§3A 插件与原型规划

## 1. 目标

随着页面与能力增多，禁止在 `features/*` 内复制按钮、弹窗、焦点陷阱、布局壳等基础实现，也禁止无规划地新增平行包或「顺手」堆共享工具。  
约定：**基础组件和无领域依赖的复合 UI 先入 `@eap/ui`；领域组合件先判层再落点；跨域基础设施用独立模块（或受控子树）统一规划。**

2026-10-31 修订：用户明确需要将源码复制到其他仓库，允许先实现已规划的完整基础定义，不再要求先出现本仓库第二消费者。组件复杂度不是迁出 `@eap/ui` 的依据；Pagination、Descriptions 等通用组合仍在 UI 包。禁止空壳及无验证的完成声明。审计、分阶段实施与证据见 [本轮记录](frontend-ui-consolidation-2026-10-31.md)。

## 2. 分层（由内到外）

| 层 | 允许内容 | 禁止内容 |
|---|---|---|
| **L0 Token / 主题** `@eap/style` | 颜色、字号、间距、主题切换 API | Vue 组件、业务文案 |
| **L1 基础/通用复合 UI** `@eap/ui` | 无领域依赖的展示与交互原语及组合（Button、Dialog、Collapse、Pagination、Descriptions 等） | 调用 `@eap/runtime-client`、读写任务/会话/插件状态、页面路由编排 |
| **L2 共享基础设施**（见 §3 模块表） | 与领域无关的 hooks、effects、layout 壳、toggle 控制、plugin 契约运行时 | 单一业务 feature 专用逻辑；绕过 `@eap/ui` 再造一套按钮/弹层 |
| **L3 可复用组合件** | 由 L1/L2 组装、被 ≥2 个 feature 或插件槽复用的产品块（如 ConnectionDialog 壳策略、看板列骨架） | 仅单页使用却提前抽包；在组合件内复制 L1 样式壳 |
| **L4 Feature** `apps/web/src/features/<area>` | 领域页面、局部状态、该域专用组合 | 新的平行 `Modal.vue` / `PrimaryButton.vue`；跨 feature 相对路径偷共享 |
| **L5 App 壳** `App.vue` / 导航 | 导航与工作台装配 | 领域 API 编排、可复用 UI 实现 |

**默认落点**：找不到合适层时，**先加 `@eap/ui` 原语或留在当前 feature**；只有满足 §4 抽包条件才新建 `packages/*`。

## 3. 规划中的统一模块位置

下列名称是**规划落点**。未建包前，允许在 `@eap/ui` 或 `apps/web/src/lib` 以**同名目录**暂存，但必须在本文件「暂存登记」中注明。再次复用时复核依赖；通用 UI/layout 可以继续在 UI 受控子树维护，独立依赖或生命周期明确时才抽包。

| 模块 / 包名（规划） | 职责 | 典型内容 | 依赖方向 |
|---|---|---|---|
| `@eap/style` | Design token 与主题 | light/dark、`applyTheme` | 无前端业务包 |
| `@eap/ui` | **全部**基础/无领域复合 UI 与 BEM 样式 | 实现以 §6 与 index.ts 为准 | Vue + `@eap/style`；按需声明内部交互依赖 |
| `@eap/hooks` | 无 UI 强绑定的 Vue composable | `useFocusTrap`、`useEscClose`、`useMediaQuery`、本地偏好键读写（无业务实体） | Vue；**不**依赖 runtime-client |
| `@eap/effects` | 动效 / 过渡 / 可访问性反馈原语 | 统一 transition 名、reduced-motion 包装、加载 shimmer 类 | 优先纯 CSS/小工具；可被 `@eap/ui` 引用 |
| `@eap/layout` | 壳层布局原语（非业务页） | SplitPane、Dock/Rail 槽位、WorkbenchFrame、滚动区约定 | `@eap/ui` + hooks；不含 Chat/Board 业务 |
| `@eap/toggle` *或* 并入 `@eap/ui` | 开关类控制 | Switch、Segmented、ThemeToggle（纯展示） | 默认**先做进 `@eap/ui`**；仅当体积/依赖独立时再拆 `@eap/toggle` |
| `@eap/plugin-sdk` / `@eap/plugin-runtime` | 工作台插件契约与可信运行时 | Manifest、贡献点、启停、槽位 | 见 v1.6 §2B；**不等于** Skill/MCP |
| `@eap/plugin-table` | 纯表格插件（vxe-table + `@vxe-ui/core`） | `Table`；分页用 `@eap/ui` Pagination | 不 `app.use` vxe-pc-ui，不把表格实现放进 `@eap/ui`。vxe-pc-ui 只作类型依赖 |
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
| SessionPanel / WorkspaceWelcome / RepositoryBrowser | `apps/web/src/components/`（聊天装配与会话轨共用；领域状态仍在 `features/shell`） | SessionPanel 的 Dock/Rail 契约 → `@eap/layout`；仓库 API 与懒加载留应用，通用 Tree 已在 UI 包；文件浮层组装 Drawer | 第二工作台复用同一 Dock/Rail 契约时抽 layout 包 |
| WorkbenchFrame / Rail 网格 | `packages/ui/src/layout`（已定义并接入 Chat） | 暂存 `@eap/ui`；独立生命周期出现后再评估 `@eap/layout` | SessionPanel 的领域数据与 terminal 展示仍属应用组合 |
| Tree / Tooltip / Segmented / DatePicker / Drawer / Splitter | `packages/ui/src` 对应目录（已定义；交互依赖只在包内） | `@eap/ui`；Splitter 与 Frame 分别处理调整行为和结构 | 不因组件复杂而拆平行包 |
| 外观偏好 / 设置页 | `apps/web/src/features/settings/appearance.ts`、`AppearanceSettings.vue` | 当前 web 应用策略；调用 style API，组装公共 UI | 第二宿主需要同一存储契约时再提炼通用 hooks；不把 localStorage/系统监听塞入 L0 |
| ActionCard / DropdownMenu / SvgActionPath | `packages/ui/src/action-card`、`dropdown-menu`、`svg-action-path` | 已落地 `@eap/ui`；共享主/次操作隔离、菜单键盘/定位、SVG 操作无障碍 | 领域回调、图数据仍在应用 |
| 浮层定位 / 关闭 / 焦点 | `packages/ui/src/popover`、`dropdown-menu`，内部 Reka | 已从 DesktopNavigation、ChatWorkspace、TaskComposer 移出通用行为；删除私有 popupPlacement | 保持公共契约，无领域数据，不新建平行包 |
| PluginSlot | `features/plugins`；聊天页由 `App.vue` 以 `chatView` 注入，避免插件 feature 引用聊天 `.vue` | `@eap/plugin-sdk` + runtime | 用户批准插件迁移切片后 |
| 场景页引用 shell 原型组件 | `features/ScenarioWorkspace.vue` → `features/shell/LayoutDraft.vue`、`GrapesEditorScaffold.vue` | 仍属原型 feature；下一次改原型壳时再上提 | 第二处复用同一编辑器壳时迁 `components/` 或 `@eap/prototype-*` |

## 4. 何时新建 `packages/*`

**同时**满足再提 PR/切片创建新包，并**先改本文件与 `pnpm-workspace.yaml`**：

1. ≥2 个 app/feature 已需要同一实现，或用户明确有跨仓库源码复用目标，或存在循环依赖风险必须切断；
2. 依赖边界清晰（例如 hooks 不应拖进 GrapesJS）；  
3. 有公开 `package.json` 入口与 `check:boundaries` 可检路径；  
4. 不与现有 `@eap/ui` / `@eap/style` 职责重叠。

**不要**：为「目录好看」一次性搬迁全部页面。Reka 可作 UI 内部依赖，shadcn-vue 可将所需源码纳入 `@eap/ui` 并适配；应用仍只使用 EAP 公共入口。

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

**已导出（实现事实以 `packages/ui/src/index.ts` 为准，共 38 个组件）**：Button（含公共语义变体和 size/active）、Badge、Tag、Feedback、Panel、MetricCard、EmptyState、StatusCard、ConfirmBox、Dialog、Input、Select、Textarea、Checkbox、Switch、FileInput、Slider、Scrollbar、InfiniteScroll、Tabs、Popover、Collapse、Pagination、Radio、Divider、Progress、Skeleton、Descriptions、WorkbenchFrame、DatePicker、Tree、Tooltip、Segmented、Splitter、Drawer、ActionCard、DropdownMenu、SvgActionPath。TreeNode / MenuAction 为类型导出；`useFocusTrap` / `useEscClose` 从同一入口导出，仍是 `@eap/hooks` 的暂存实现。

**目录约定（防止平行实现）**：

- L1 原语只允许 `frontend/packages/ui/src/<kebab>/`，内含 `Name.vue` 与 `name.css`，并由 `src/index.ts`、`src/styles.css` 导出。禁止在 `features/` 或 `components/` 再写一份同职责控件。
- 无界面的 composable 暂存在 `packages/ui/src/hooks/`。抽成 `@eap/hooks` 的条件仍是 §4（已有第二处 feature 需要同一实现），不是「控件目录还没补齐」。
- 跨 feature 组合件落 `apps/web/src/components/`，并在 §3.2 登记。`@eap/plugin-sdk` 仍等用户批准的插件迁移切片（§7）。表格已单独落在 `@eap/plugin-table`，不因此提前建工作台插件 SDK。
- 已确认的通用能力允许先完成 props/events/slots、样式和验证，用于跨仓库复制；不再以当前消费者数量阻止定义。下表其余候选按具体交互契约分批实现，不能创建空壳。页面需要时先补共享组件，禁止先写原生替代品。

| 名称 | 固定目录 | 状态 |
|---|---|---|
| Button、Badge、Tag、Feedback、Panel、MetricCard、EmptyState、StatusCard、ConfirmBox、Dialog、Input、Select、Textarea、Checkbox、Switch、FileInput、Slider、Scrollbar、InfiniteScroll、Tabs、Popover | 见 `index.ts` | 已落地。Scrollbar 是滚动条；InfiniteScroll 包住它，靠近起点或终点时发出 `load`。对话列表向上展开更早的消息 |
| Alert | 不另建；使用 `Feedback` | 已有等价物 |
| MessageBox / Popconfirm | 不另建；破坏性确认用 `ConfirmBox`，就地说明用 `Popover` | 已有等价物 |
| Card | 不另建；使用 `Panel` / `MetricCard` / `StatusCard` | 已有等价物 |
| ActionCard | `action-card/` | 已定义并接入场景卡；主操作为原生按钮，actions 槽为其兄弟节点；支持键盘，避免在按钮内嵌按钮；单一操作卡可直接用 Button card |
| DropdownMenu | `dropdown-menu/` | 已定义并接入分组/会话/聊天更多菜单；操作清单 + select(id)，内部 Reka 处理定位、键盘、关闭与返回触发点 |
| SvgActionPath | `svg-action-path/` | 已定义并接入 WorkflowCanvas 连线；点击/Enter/Space/可选 Delete，disabled 和无障碍名称；不持有图领域状态 |
| Popover（增强） | `popover/` | anchor 模式统一避让、外部关闭/Escape 与焦点恢复；用于工作空间选择和 composer 混合内容；无 anchor 的静态壳不声称菜单行为 |
| Radio | `packages/ui/src/radio/` | 已定义；原生同名互斥组、string/number model、disabled；label 由消费者关联 |
| Tooltip | `packages/ui/src/tooltip/` | 已定义；shadcn-vue 源码适配 + Reka，hover/focus/Escape、portal；用于外观设置说明；操作菜单用 DropdownMenu，混合内容用 Popover |
| DatePicker | `date-picker/` | 已定义；单日期 YYYY-MM-DD/空值，复用 Input + 浏览器日期选择器；min/max/disabled/required，无时区转换 |
| Cascader、Transfer、TreeSelect、Rate | `cascader/`、`transfer/`、`tree-select/`、`rate/` | 候选，待明确交互契约 |
| Collapse、Descriptions、Skeleton | `collapse/`、`descriptions/`、`skeleton/` | 已定义；Collapse 接入 18 处折叠区；Skeleton 尊重 reduced-motion |
| Image | `image/` | 待确定加载/错误处理契约 |
| Table | `@eap/plugin-table` | 已落地。按 vxe-table v4「仅表格」安装：`vxe-table` ~4.23.12 与 `@vxe-ui/core` ~4.5.4，应用只 `use(tablePlugin)`。vxe-pc-ui ~4.20.33 仅类型提示（文档写 4.20.34，当前源上最新是 4.20.33），页面不得导入它。单元格里的按钮、徽标继续用 `@eap/ui` 插槽。超过 20 行时用自带分页，不使用 vxe 的分页组件 |
| Pagination | `pagination/` | 已定义并被 Table 使用；受控页码、total/pageSize、禁用和文案；网络请求与数据切片归消费者 |
| VirtualizedTable | `@eap/plugin-table` | 复用插件虚拟滚动，不另建表格引擎 |
| Tree | `tree/` | 已定义并接入 RepositoryBrowser；id 选择/展开、禁用、键盘导航；manualExpand 将异步展开与加载交给应用；非虚拟树 |
| Segmented | `segmented/` | 已定义并接入主题/密度；有值单选、禁用、箭头导航；留在 UI，不拆 toggle 包 |
| Timeline、Tour、VirtualizedTree、Statistic | `timeline/`、`tour/`、`virtualized-tree/`、`statistic/` | 候选，待明确契约 |
| Drawer | `drawer/` | 已定义并接入 Chat 文件浮层；薄包装 Dialog，复用焦点/Escape/busy/叠层，支持侧向与 portal；不再复制私有顶层弹层 |
| Affix、Anchor、Backtop、Steps、Loading | `affix/`、`anchor/`、`backtop/`、`steps/`、`loading/` | 候选，待明确契约 |
| Message、Notification | `message/`、`notification/` | 保留；页内状态继续用 `Feedback` |
| Divider、Progress | `divider/`、`progress/` | 已定义；分隔方向、确定/不确定进度及无障碍标签 |
| WorkbenchFrame | `layout/` | 已定义并接入 Chat；default/rail/overlay 槽、railSide、响应式与 Token 尺寸 |
| Splitter | `splitter/` | 已定义并接入外观布局预览；水平/垂直、百分比 model、min/max、禁用、键盘/鼠标调整；持久化由宿主处理；Frame 仍只提供结构 |

**源码复制**：见 [`packages/ui/README.md`](../../frontend/packages/ui/README.md)。必须带齐相对依赖、hooks、CSS 与 Token，目标库重建公开导出和验证；不复制应用业务状态。第三方源码保留版本、许可证与改动说明。

**shadcn-vue 状态**：已按需纳入 TooltipContent，固定上游提交 `4d6963aa8a482be7609cb05d3f8b7fe42082b634`，保留 SOURCE.md/MIT LICENSE 并适配 EAP API/Token；`reka-ui@2.11.0` 只声明在 UI 包。不是全部组件迁移。Tailwind 4 使用标准 CSS，不引入 Sass；不运行 CLI init 覆盖现有主题。参考与审计证据见 [本轮记录](frontend-ui-consolidation-2026-10-31.md)。

**主题变量**：组件直接读取 `--eap-*`；短名在主题、自定义 Token 作用域重新绑定。`applyAppearance` 设置 theme/skin/density 与 sidebarWidth/railWidth/contentMaxWidth，`applyTokens` 设置局部 Token。控制台皮肤已从 body 迁至 `@eap/style/skins/console.css`，不会覆盖 dark。Dialog/ConfirmBox/Popover/Drawer/Tooltip/DropdownMenu 的 `teleportTo` 可指定子树 portal host；局部主题或模态中的浮层需选对宿主。`tailwind.css` 是可选 Tailwind 4 映射，标准 CSS 消费者无需 Tailwind。宿主 CSS 中的固定颜色已改用语义 Token，终端/代码使用 `--eap-code-*`；浅深色按钮前景使用 `--eap-color-on-primary`。Grapes/Schema 数据和布局草案颜色选项属于设计内容，保留其颜色值。

**页面样式边界**：应用不得再用 Button custom。已提供 primary/secondary/ghost/danger/link/navigation/activity/chip/icon/card/backdrop；共享组件负责颜色、边框、圆角与交互状态，页面负责位置、尺寸、内容排版和领域状态。扩展视觉需求先补公共变体；不能换个页面 class 继续复制按钮行为。`div/section/label` 等结构元素无需强制包成组件。

**检查覆盖**：`check:boundaries` 解析 Vue 模板，检查具名原生控件、静态/字面量绑定的交互 role、原生 click 操作、Button custom、字面量动态原生控件及第三方 UI 导入；检查应用 CSS/SFC style 的硬编码 hex/rgb/white/black。设计器脚本中的 HTML/CSS 数据不做替换。静态检查不是完整可访问性或所有动态渲染证明，新增交互仍须做行为/浏览器验证。

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
| boundaries | 无越包私有导入；应用模板无原生基础控件或平行 Dialog；应用无直引第三方 UI；UI 无领域包依赖 |
| 文档诚实性 | 未宣称未建包「已完成」 |
| Vue MCP（可选） | 启用时组件树可见共享原语；未启用不得伪造成功 |

修订本决策时保留本文件为唯一落点规范；勿再平行新增「又一份组件目录说明」而不互相链接。
