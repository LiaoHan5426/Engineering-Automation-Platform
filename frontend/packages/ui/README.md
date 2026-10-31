# EAP UI：使用、定制与源码复制

所有页面从 `@eap/ui` 导入基础及无领域复合组件。Table 从 `@eap/plugin-table` 导入，底层 vxe 仅在该包内部使用。UI 不依赖 API、路由、i18n 实例或领域状态。

```ts
import '@eap/style/index.css' // themes + base；不要求 Tailwind 或 Sass
import '@eap/ui/styles.css'
import { Button, Collapse, Pagination } from '@eap/ui'
import { applyAppearance, applyTokens } from '@eap/style'

applyAppearance({
  theme: 'dark', skin: 'console', density: 'compact',
  layout: { sidebarWidth: 280, railWidth: 400, contentMaxWidth: 1440 },
})
applyTokens({ '--eap-color-primary': '#59bfa5' })
```

配置 API 不自动持久化、不监听系统主题；由宿主决定保存与初始化。EAP web 在 `features/settings/appearance.ts` 实现版本化偏好、系统主题和跨标签页同步，`#appearance` 提供设置页；这些应用策略不属于复制 UI 的必选依赖。每个 DOM 子树可指定第二参数；局部覆盖以 `null` 清除。启用 Teleport 时默认目标为 body；局部主题弹窗需在该主题子树创建 portal host，并向 Dialog/ConfirmBox/Popover/Drawer/Tooltip/DropdownMenu 传 `teleportTo`。宿主避免给 portal 的祖先添加 transform/overflow 裁剪。

Tailwind 4 宿主在 CSS 顶层按序使用裸字符串 `@import "tailwindcss"; @import "@eap/style/tailwind.css";`（实际分行），另加载 themes/base。映射从 EAP Token 生成 background/foreground/primary 等语义 utility，不维护第二套主题。已按需纳入 shadcn-vue TooltipContent 源码并适配 EAP Token/API；来源固定到提交 `4d6963aa8a482be7609cb05d3f8b7fe42082b634`，见 [来源与变更](src/tooltip/SOURCE.md) 和 [MIT 许可证](src/tooltip/LICENSE)。Tree、Segmented、Splitter 的交互使用包内 `reka-ui@2.11.0`，应用仍仅导入 `@eap/ui`。未执行 shadcn CLI init，也不要求 Sass、Tailwind 或 `cn` 工具才能复制这些组件。

## 新增定义与依赖闭包

| 导出 | 可复制目录 / 额外依赖 | 契约 |
|---|---|---|
| Button | `button/` | 默认 type=button；variant/size/disabled/active；click 和原生 attrs；普通操作 primary/secondary/ghost/danger，文字操作 link，导航 navigation/activity，选项 chip，图标 icon，可点击表面 card，遮罩 backdrop；应用禁止 custom |
| Collapse | `collapse/` | summary prop/slot、default 内容、open / update:open / toggle；不传 open 时由原生 details 控制 |
| Pagination | `pagination/` + `button/` | v-model 页码、total、pageSize、disabled、label/previousLabel/nextLabel；越界纠正，不发请求 |
| Radio | `radio/` | v-model string/number、value、name（必填）、disabled；宿主提供 label；同组共用 name |
| Descriptions | `descriptions/` | items: key/label/value；按 key 自定义值插槽；dl/dt/dd 语义 |
| Skeleton | `skeleton/` | animated；装饰性隐藏于辅助技术，加载状态由宿主提供；宽高可覆盖，尊重 reduced-motion |
| Progress | `progress/` | 必填 label；value/max；无 value 为不确定进度，数值夹在 0..max |
| Divider | `divider/` | orientation、decorative；separator 语义 |
| WorkbenchFrame | `layout/` | rail、railSide；default 主区、rail 和 overlay 槽；尺寸用 layout Token。窄屏为单列，消费者负责 rail 的浮层/隐藏行为；不含拖拽、持久化、领域面板 |
| DatePicker | `date-picker/` + `field/` | 必填 label；v-model 为 YYYY-MM-DD 或空字符串；浏览器日期选择器、min/max/disabled/required；不做时区转换或日期区间选择 |
| Tree / TreeNode | `tree/` + `reka-ui@2.11.0` | items 的 id 唯一；v-model 选中 id、v-model:expanded id 数组；select(node)、toggle(node,nextOpen)；children 为空数组仍是可加载分支，缺失为叶子；manualExpand 将展开交给宿主；内置键盘导航，异步加载/请求/过滤归宿主 |
| Tooltip | `tooltip/`（含 SOURCE.md、LICENSE）+ `reka-ui@2.11.0` | text、side、delay、teleportTo；default 槽须为单个可聚焦触发元素；hover/focus 打开、Escape 关闭；操作菜单用 DropdownMenu，混合内容用 Popover |
| Segmented | `segmented/` + `reka-ui@2.11.0` | 必填 label/options/v-model string；单选 ToggleGroup、水平/垂直方向、箭头导航、禁用；重复点击保持已选值；option 支持 description/testId；宿主确保 model 对应有效 option |
| Splitter | `splitter/` + `reka-ui@2.11.0` | 必填 label；v-model 为 start 面板百分比，默认 50；min/max 默认 15/85，要求 0≤min≤max≤100；水平/垂直、disabled、start/end 槽；支持鼠标与键盘调整；容器尺寸和持久化由宿主提供 |
| Drawer | `drawer/` + Dialog 依赖闭包 | title、side=start/end、busy、showHeader、closeLabel、teleportTo；default/footer 槽和 close 事件；复用 Dialog 焦点/叠层；showHeader=false 时宿主提供可见关闭控件 |
| ActionCard | `action-card/` + `button/` | label 必填、disabled/selected；activate 事件；default 只放展示内容，actions 槽放独立操作；主操作是覆盖卡片的原生按钮，操作槽与其为兄弟节点，避免嵌套按钮和重复触发 |
| DropdownMenu / MenuAction | `dropdown-menu/` + `reka-ui@2.11.0` | label/items，v-model:open、select(id)、align/teleportTo；default 槽单个可聚焦触发组件；items 含 id/label/disabled/destructive/description/testId；共享箭头/Home/End/输入匹配、碰撞定位、外部点击/Escape 关闭与焦点恢复；原生禁用语义 |
| SvgActionPath | `svg-action-path/` | 放在 svg 内；d/label 必填、disabled、deleteKey；activate(MouseEvent/KeyboardEvent)；click/Enter/Space，以及启用时 Delete；不会自己修改领域图数据 |
| Popover | `popover/` + `reka-ui@2.11.0` | label、anchor、side/align、returnFocusTo、teleport/teleportTo、close 事件；传 anchor 后为非模态混合内容浮层，统一避让、外部关闭与焦点恢复；无 anchor 时仅为静态 region 壳，不能冒充菜单键盘行为 |

既有 Dialog/ConfirmBox 还依赖 `button/`、`hooks/useFocusTrap.ts`；ConfirmBox 依赖 `feedback/`。其他组件的依赖以其相对 import 为准；InfiniteScroll 需 Scrollbar。所有组件还需 style 主题 Token；复制时带上 `packages/style/src` 或由宿主完整实现对应 `--eap-*`。

## 复制步骤

1. 选定组件目录及所有相对 import 的组件、hooks、CSS；保留 SFC 的 style src 相对路径。通用组件不复制 App/feature 或 runtime-client。
2. 目标库声明兼容的 Vue 3（当前使用 3.5）、TypeScript 和 Vue SFC 构建能力；Token 可直接复制 style 包的标准 CSS。复制依赖 Reka 的组件时同时声明并安装已验证的 `reka-ui@2.11.0`；升级后复验交互。迁入的第三方实现按各自许可保留 LICENSE/来源。
3. 在目标库入口重新导出组件；如使用总 CSS 入口，只汇总已复制的 CSS。源仓库同时提供 SFC style src 和总入口，由打包器去重。
4. 按 README 契约验证 model、事件、disabled、键盘/焦点、深浅主题、子树主题、Teleport 与窄屏；不能只复制 `.vue` 后以编译通过冒充完整迁移。

未实现的 Cascader/Transfer/TreeSelect/VirtualizedTree 等仍在架构表登记候选，待具体契约确定；不能导出无行为的占位组件。新增通用复合能力在本包统一定义，领域组合在应用层组装本包组件。Tree 当前为非虚拟树，DatePicker 当前为单日期；这些明确边界不等于整套 UI 控件库全部完成。

应用模板不得使用 Button custom；该入口仅为旧源码消费者保留兼容。应用使用上述公共变体，页面样式只安排位置/宽高/内容排版，不重新定义按钮的颜色、边框、圆角、禁用、hover 和 focus。新视觉需求先扩充共享组件契约；通用交互不得以原生元素加 role/click 绕过公共组件。

宿主 CSS 必须使用主题语义 Token，包括代码/终端的 `--eap-code-*` 和图表强调色。设计器模型中的颜色值属于用户设计数据，不能批量改成宿主主题。应用级偏好、仓库请求、会话行为继续由应用负责；复制 UI 时不包含这些策略。
