# 前端组件收敛审计与实施记录（2026-10-31）

用户本轮授权：按现有规划审查并完善组件定义、页面接入、主题/layout 与可复制复用。本文记录本轮证据与实施次序；长期落点规则仍以 [共享模块边界](frontend-ui-shared-module-boundaries.md) 为唯一规范。

## 首轮审计事实（实施前）

- `@eap/ui` 已有 21 个展示组件，但 App、导航、会话、管理与原型页面仍直接实现按钮、折叠区域。`check:boundaries` 原来仅检查包依赖，未检查 Vue 模板，因此规则无法阻止复发。
- `@eap/style` 有 light/dark，但 `work-pages.css` 在 body 固定覆盖浅色皮肤；短 Token 别名只在根解析，子树换肤不可靠；布局尺寸散落在页面 CSS。
- 未安装 shadcn-vue/Reka UI，也无 components.json。旧 v1.6 将它们列作候选参考，不是已接入承诺。
- Tailwind 4 官方明确不以 Sass/Less/Stylus 预处理工作流为目标；当前无直接 Sass 依赖，lockfile 中 Vite 的可选 peer 不等于已使用 Sass。
- 原“出现真实调用之前不要建”与用户明确的跨仓库复制需求冲突：已规划的通用基础能力可以先提供完整、可验证定义，不能只留空壳；不要求先出现第二个本仓库消费者。

## 本轮实施次序与边界

1. 更新 v1.6、边界与模块文档：通用复合 UI 也归 `@eap/ui`；领域组合仍在应用，布局暂存也必须登记。
2. 保留现有 API；Button 提供受控的自定义外观入口，页面统一调用共享 Button；Collapse 收敛原生 details/summary；Pagination 从 Table 中提取。为复制用途补 Radio、Divider、Progress、Skeleton、Descriptions，并登记公开契约。所有定义可运行，不建无实现占位组件。
3. 统一 Token、浅/深色控制台皮肤、密度和布局尺寸，提供无 Tailwind 的 CSS 入口与可选 Tailwind 4 映射。布局结构组件落在 `@eap/ui/layout`，不引入领域或新插件 SDK。
4. 模板静态检查禁止应用直接使用基础原生控件、第三方 UI 与私有源导入。Grapes 编辑器 HTML 字符串是设计数据，不能当 Vue 模板误替换；实际 Vue 预览必须使用 `@eap/ui`。
5. 执行类型、边界、相关行为回归、构建与运行页面检查；不重启用户的前后端，不调用付费模型。

## shadcn-vue 决策

采用“源码纳入 `@eap/ui` 后适配并对外导出”的接入方式，按具体缺口引入；页面保持唯一 EAP 入口。首轮没有复制第三方实现；同日续作已纳入固定提交的 TooltipContent 源码并适配，来源和 MIT 许可在 `packages/ui/src/tooltip`，运行依赖固定为 `reka-ui@2.11.0`。不执行 CLI init 覆盖已有 Token/API。无需为 shadcn 引入 Sass。

官方依据：[Tailwind 兼容性](https://tailwindcss.com/docs/compatibility)、[shadcn-vue 源码分发模式](https://www.shadcn-vue.com/docs/introduction)、[安装配置](https://www.shadcn-vue.com/docs/components-json)。

## 验证基线

- 开始时仅 `backend/eap-runtime/src/main/resources/application.yml` 有用户本地改动，保持原样。
- `rtk proxy pnpm --dir frontend test run`：220 项，217 通过、3 失败。`console.test.ts` 两项依赖过时 rail/class 字符串；`builderView.test.ts` 一项期待已移除的“浏览器本地原型存储”文案。后续结果另行记录，不冒充基线全绿。

## 首轮完成与验证证据

- [x] 搜索原语与现有实现 → 按领域依赖判层 → 写入 `@eap/ui` / `@eap/style` → 更新规范、暂存登记和复制指南 → 运行边界与行为回归。
- 19 个 Vue 文件的 127 个原生按钮、18 个 details 区域已迁为公共组件；Grapes 的 HTML 字符串保持设计数据，Vue 预览按钮使用公共组件。应用模板检查为零违规。
- 新增 Collapse、Pagination、Radio、Divider、Progress、Skeleton、Descriptions、WorkbenchFrame，共 8 个可运行定义；UI 共 29 个组件导出。Pagination 已用于 Table，Frame 已用于 Chat；其余基础定义允许外部仓库复用。
- Button 增加 custom 外观并保留原生事件/禁用/提交契约；默认按钮继续使用现有样式变体。移除页面直接控件；业务 API/会话状态仍保留在原 feature。
- style 增加可选 console 皮肤、layout/density、Tailwind 4 映射、`applyAppearance`/`applyTokens`。共享组件直接读取 canonical Token；局部别名重新绑定；Dialog/ConfirmBox/Popover 增加 portal 目标配置。收敛主工作台、侧栏、摘要、弹层与差异展示的硬编码表面色；终端和原型内容等独立颜色不冒充全部主题化。
- 原 3 个失败断言按现有产品契约修正：class 按 token 匹配；插件说明取当前 i18n 文案，不恢复过时产品说明。

| 命令 / 检查 | 最终结果 |
|---|---|
| `rtk proxy pnpm --dir frontend typecheck` | 通过 |
| `rtk proxy pnpm --dir frontend test run` | 68 文件、228 项全部通过 |
| `rtk proxy pnpm --dir frontend check:boundaries` | 通过，包含实际 Vue 模板解析，忽略脚本内设计 HTML |
| `rtk proxy pnpm --dir frontend exec stylelint "packages/ui/src/**/*.{css,vue}" "packages/style/src/**/*.css"` | 通过；不是整个旧应用 CSS 的全量 lint 声明 |
| `rtk proxy pnpm --dir frontend build` | 通过；仍有 >500 kB chunk 提醒 |
| `git diff --check` | 通过 |
| `node frontend/node_modules/.cache/eap-ui-browser/check.cjs` | 使用临时 Playwright + 已安装 Chromium，访问用户现有 5173 服务；无 pageerror |

浏览器验证：1440px 下浅/深色工作台与侧栏均随 Token 改变；railWidth=420 后实测网格 `702px 420px`；子树主色覆盖实测 `rgb(102, 51, 153)`；390px 窄屏及场景/专家/设置导航无页面横向溢出。检查了 light/dark/narrow 截图，修正了侧栏/摘要固定浅底及自定义 rail 变窄时 composer 不换行。临时浏览器依赖仅放在 node_modules 缓存，不写入工程依赖/lockfile；浏览器关闭后不保留主题测试状态。

首轮遗留：主题偏好持久化/设置页、DatePicker/Tree 等基础定义、shadcn 实际源码接入，已由下述续作推进。WorkbenchFrame 仍只负责结构，调整行为独立为 Splitter。Computer Use helper 管道不可用，使用独立无头浏览器；未伪造用户桌面点击验收或 Vue MCP 证据。未跑后端测试、未调用真实模型。用户原有 backend application.yml 改动未修改；没有重启服务或提交/push。

## 同日续作：完成内容与当前证据

继续关闭上一轮明确留下的使用闭环：增加外观设置与版本化本地偏好，补 DatePicker、Tree、Tooltip、Splitter、Segmented、Drawer 定义；保留公共 API 与应用领域编排，不新增平行 UI 包。shadcn-vue 首个真实源码接入为 TooltipContent，来源固定到 `4d6963aa8a482be7609cb05d3f8b7fe42082b634`，详见组件目录 SOURCE.md / LICENSE。其余交互通过 UI 内部 `reka-ui@2.11.0` 实现。

- [x] 搜索原语 → 判层 → 公共定义写入 UI → 消费者迁移 → 暂存/清单/复制文档更新 → 边界与行为验证。
- 新增 6 个公开组件，累计 35 个；DatePicker 使用浏览器单日期控件，值为无时区 YYYY-MM-DD；Tree 为支持键盘/选择/展开的非虚拟树，懒加载与请求留宿主；Segmented 保持必选项；Splitter 提供水平/垂直、百分比约束、鼠标/键盘调整；Drawer 复用 Dialog 的焦点、Escape、busy 和 portal。
- RepositoryBrowser 改用共享 Tree，移除重复节点交互；刷新/引用按钮使用标准 Button 变体，源码块改读主题 Token。Chat 源文件浮层改为 Drawer，删除私有遮罩壳。
- `#appearance` 提供主题（浅/深/跟随系统）、配色、密度、导航宽度、会话面板宽度、内容最大宽度与恢复默认；设置预览中的 Splitter 调整 rail Token。应用层 `appearance.ts` 校验版本/枚举/尺寸，启动恢复、保存失败提示、系统监听和跨标签页同步；不让 style 包依赖存储或 Vue。
- 修复真实浏览器发现的 Splitter 初始布局尚未注册时 resize 异常，并增加初始化/受控更新回归。截图发现窄屏隐藏侧栏仍占 204px，移除旧高优先级网格规则；390px 设置内容宽度恢复到至少 290px，并以尺寸断言验证。
- 架构 v1.6、共享边界、模块说明和 UI README 同步当前实现与依赖闭包；其余候选没有伪装成已实现。

| 当前检查 | 结果 |
|---|---|
| `rtk proxy pnpm --dir frontend typecheck` | 通过 |
| `rtk proxy pnpm --dir frontend test run` | 70 文件、238 项通过；新增 10 项覆盖偏好、日期、树、单选、抽屉、分栏初始化 |
| `rtk proxy pnpm --dir frontend check:boundaries` | 通过；应用模板基础控件与第三方 UI 入口零违规 |
| `rtk proxy pnpm --dir frontend exec stylelint "packages/ui/src/**/*.{css,vue}" "packages/style/src/**/*.css"` | 通过，仅声明公共 UI/style 范围 |
| `rtk proxy pnpm --dir frontend build` | 通过；保留 >500 kB chunk 提醒 |
| `git diff --check` | 通过；pnpm-lock 的 LF/CRLF 提醒不影响结果 |
| `node frontend/node_modules/.cache/eap-ui-browser/continuation.cjs` | 通过：深色/密度/配色/宽度保存与刷新、恢复默认、系统主题、跨标签页、Tooltip focus/Escape、Splitter 键盘/鼠标、390px 布局、Drawer/Tree/Escape；零 pageerror |

浏览器使用隔离上下文与现有 5173/8080 服务，检查了桌面深色设置、窄屏和源文件 Drawer 截图；不改用户浏览器偏好，不重启前后端。未运行后端测试或真实模型调用，未声明人工桌面验收。当前仍未实现 Cascader/Transfer/TreeSelect/VirtualizedTree 等未定契约候选；日期区间、自绘日历、主工作台任意拖拽布局也不在本次完成声明内。残留原型/终端独立配色仍按既有范围处理。

## 收敛遗漏的调整计划（用户再次授权）

复核发现：具名原生控件虽已清零，但仍有 article/path 模拟按钮、私有菜单与 122 处 custom Button；模板检查未覆盖 ARIA 模拟控件，页面视觉仍有硬编码。该事实不等于此前组件入口迁移失败，也不能据此声称全部抽取完成。

本切片依次完成：公共按钮变体和 ActionCard/DropdownMenu/SvgActionPath 定义；菜单定位/关闭归共享 Popover 与 DropdownMenu；迁移页面使用，删除重复控件视觉；固定配色集中到 style Token（设计器模型中的用户内容不属于宿主主题）；扩大模板/样式边界检查及行为测试。保留领域状态/API 和后端当前行为，验证后更新完成证据，作为后续规划开发的约束。

### 调整结果与最终验证

- [x] 搜索现有原语 → 判层 → UI/style 实现 → 应用接入 → 暂存/复制指南/规范同步 → 边界、单测、构建和浏览器验证。
- 122 处 custom Button 已归零，改为公共 primary/secondary/ghost/danger/link/navigation/activity/chip/icon/card/backdrop 变体。删除相应页面按钮颜色、圆角、边框、禁用/hover/focus 和重复尺寸规则；页面保留定位、宽高、内容网格及领域展示。custom 仅保留为旧源码消费者兼容入口，应用检查拒绝它。
- 新增 ActionCard、DropdownMenu、SvgActionPath，累计 38 个组件。场景卡主操作是原生按钮，次操作是兄弟节点；工作流连线的 Enter/Space/Delete、disabled 归 SvgActionPath。原来的终端单一标题不再伪装成 tablist/tab。
- 分组/会话/聊天更多菜单改用 DropdownMenu，删除私有定位和外部监听。混合内容 Popover 增加 anchor/side/align/returnFocusTo：工作空间选择与 composer 复用碰撞定位、外部关闭和焦点恢复。删除旧 `features/chat/popupPlacement.ts` 与绑定旧坐标算法的测试；浏览器验证实际上下空间和窄屏边界。composer 分类使用垂直 Segmented。
- 应用 CSS/SFC 样式中的固定 hex/rgb/white/black 已归零；终端和代码表面使用 `--eap-code-*`，图表、警告边框和主色前景均用语义 Token。修复深色选中 Tabs 对比度与活动导航文字布局。设计 HTML/Schema/草案的颜色选项是内容数据，保持原值。
- 边界检查除原生具名控件与第三方入口外，新增交互角色、原生 click 操作、custom 变体、字面量动态控件和宿主固定颜色检查。它是静态防回归门禁，不能代替对所有动态表达式、领域状态和可访问性的人工/运行时检查。

| 最终命令 / 检查 | 结果 |
|---|---|
| `rtk proxy pnpm --dir frontend typecheck` | 通过 |
| `rtk proxy pnpm --dir frontend test run` | 70 文件、241 项通过；包括卡片主/次操作隔离、SVG 键盘/禁用、菜单选择/禁用、扩展边界规则 |
| `rtk proxy pnpm --dir frontend check:boundaries` | 通过，应用原生基础控件、模拟交互角色、custom 变体、宿主固定色零违规 |
| `rtk proxy pnpm --dir frontend exec stylelint "packages/ui/src/**/*.{css,vue}" "packages/style/src/**/*.css"` | 通过；仅声明公共 UI/style 范围 |
| `rtk proxy pnpm --dir frontend build` | 通过；仍有 >500 kB chunk 提醒 |
| `git diff --check` | 通过 |
| `node frontend/node_modules/.cache/eap-ui-browser/consolidation.cjs` | 通过：菜单键盘/禁用/外部关闭/焦点、卡片 Space 激活、composer/SQL 浮层位置、终端文本、5 个深色页面、4 个 390px 页面；零 pageerror |

浏览器沿用用户的 5173/8080 服务，独立上下文；抽检浅色工作台、深色场景/专家/SQL/设置与窄屏菜单截图。没有执行付费模型调用，没有运行后端测试，没有改动已有 backend application.yml，没有重启服务或提交/push。后续前后端业务按规划和真实验收矩阵推进；本次完成范围是上述 UI 收敛，候选组件、Plugin SDK、Electron 与后端功能不能据此标为完成。
