# 固定源契约审计

状态：实施中的契约决策记录，尚未整体交付。下表是最初固定源审计的历史发现及当时出口，不能当作当前实现状态；实际进度以迁移计划为准。未把包名或注释视为框架无关的证明。

源链接统一固定到 `39163dd30f703a79079e2d2446545cff3c453738`。

| 契约及已见事实 | 必要替换及消费者影响 | 验证出口 |
| --- | --- | --- |
| [ui-slots/renderer.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-slots/src/renderer.ts#L97)：`SlotScopeAdapter.renderArea?(binding: StandardSourceBinding, props: SessionAreaProps): ReactNode`；`RenderOpts.fallback?: ReactNode` | 该文件首行虽称 React-free，实际仍导入 ReactNode。必须定义 Vue 渲染值和作用域/slot 语义，并同步 scope adapter、outlet 及插件组件调用方；改一个 renderer 实现不能消除类型和调用协议差异 | slot/factory 多实例、两会话隔离、缺失作用域、局部失败隔离；先穷举调用方，尚未完成 |
| [ui-renderer/bind.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-renderer/src/client/bind.ts#L20)：`bindSnapshotSelector<T>(w: HostObservable<T>): SnapshotSelectorHook<T>` 通过 `useSyncExternalStoreWithSelector` 生成 hook | 保留源的 subscribe/getSnapshot，不直接把 hook 返回值替换为 Vue ref。先定义 Vue 消费接口，再同步 selector、equality 及组件读取方式；所有现有 hook 消费者均需核查 | 订阅建立期间更新、selector 参数改变、数据源切换、卸载清理、旧回调失效 |
| [ui-renderer/renderer.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-renderer/src/client/renderer.ts#L64)：`mount(container: HTMLElement): () => void`；`if (this.current !== mounted || mounted.releasing) return` | 保留服务形状与旧 disposer 隔离；替换 hydrateRoot/createRoot、React BootHandoff、buildRenderApp。DocumentStyles 资源所有权应保留，不能简单删掉 hydration 路径 | Boot 交接、重复 mount、挂载失败回收、renderer 替换、过期 disposer、模块样式引用 |
| [web/platform.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/web/src/platform.ts#L8)：`PLATFORM_MODULES` 含 react、react/jsx-runtime、react-dom、react-dom/client、@tanstack/react-virtual | 该表由 seed、external 与 Vite alias 共同使用。须协调 shell 与动态插件的共享 Vue 身份及虚拟列表替换；不能只给 Web 添加 plugin-vue | 跨插件共享同一 Vue、产物不执行 React、异步 chunk 和资源加载 |
| [tsdown.client.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/tsdown.client.ts#L148)：`clientBundle(packageDir: string, libEntry: readonly string[], options: ClientBundleOptions = {}): BuildFaceConfig`；client pass 读取 `lib/types/client/index.js`，产物通过 `window.__ModuleLoader__.load({id, factory, meta})` 注册 | 需要 SFC 到 JS/声明/source map 的编译阶段，并保持 closure-factory、CSS 元数据、assets 与 Host/Client 双面构建。普通 Vite SFC 示例不覆盖该插件通路 | 至少一个真实 SFC 插件经 Host 资源服务、Boot、loader 加载，启停/更新后资源清理正确 |

## 当前边界决定

用户已确认按规划全部实施，先前的分阶段授权问题已经解除。保留 SlotCore、SlotRegistry、原生 observable/store、DocumentStyles 和 Host 模块表作为唯一运行权威；Vue 组件与 renderer 在其上迁移。状态 selector 返回只读 shallow ref，调用方在 setup 建立读取，在 render/template 解包；不保留标量 React hook facade。普通/工厂组件接受 Vue callable 或带精确 `$props` 的 constructor，保留五份 props 校验。生产 renderer 已切为原生 Vue；尚未关闭的完整装配、类型和浏览器门禁继续阻止最终交付，不以入口切换冒充全量迁移。

建议第一闭环只覆盖 Vue 状态绑定、renderer、普通 slot/factory 和一个真实 SFC 插件的构建/加载/清理。后续组件与产品功能应以该闭环的实际结果排序。原 React 输入只用于独立基线对照；目标最终不保留 React 运行时包装。Vite+ 作为目标项目的安装、开发、检查和构建入口，其 CLI 和 SFC 插件构建是不同层级。

## 2026-11-16 实施决定与验证边界

- 原生 Vue 3.5.45 与 Vue Virtual 3.13.36 作为 shell/插件共享身份；虚拟列表保留基线 core 3.17.8 的几何合同。平台表、seed、动态工厂及测试装配同步替换，删除被替代的 React renderer 和 scalar hook 实现。
- selector 的外部快照发布与同步依赖选择分开，保留条件依赖追踪；contextual DOM ref 仅向当前存活的可写目标转发，业务只读源继续只读。构造器类型检查捕获真实组件 props 后逐项校验，避免 `$props` 协变放行缺少注入的组件；负类型断言继续保留。
- 表格预览以框架无关 Luckysheet 2.1.13 替换 React UI，本地静态资源由 bundle 持有，按实例 iframe 隔离其全局状态。保留缓存公式值而不重算、格式、合并、分页、复制及只读；真实双实例浏览器证明与原生 lazy bundle/licence smoke 分别记录，不互相替代。
- Vue 提交时序以 nextTick 和实例作用域处理，保留同步业务动作及失效结果保护；通知几何动画的 controller 归组件/stack 所有，不引入模块级状态缓存。完整消费者实际首次加载、卸载、重载的 DOM、服务及 console.error 清洁回归已通过。
- 清理应用直接 React 依赖与实际产物运行闭包。既有 Vue/VitePress 文档工具间接使用 DocSearch React，Zustand vanilla 的可选 React peer 也可能出现在安装图；这些事实必须披露，不能将工作区安装目录有无 React 与 DSH 应用实际执行 React 混为一谈。不为清理锁文件改写状态引擎或替换文档站技术栈。

## 尚未证明

八项产物门禁、Host/Client 聚合检查、真实 Loader 消费者重载以及应用产物输入无 React 审计已经通过；这些不证明完整产品浏览器行为。用户已授权全部阶段，实验 UI 与桌面欢迎入口包括在原生 Vue 迁移范围；桌面 IPC、权限和 Host 领域逻辑保留既有权威，不因 UI 迁移重写。第三方 React UI 的实际消费者必须替换，不能通过排除模块或适配 facade 宣称完成。

完整导入/原生迁移及已验证的生命周期、属性、表格安全和文档工具修复已分阶段推送草稿 PR #8；当前浏览器诊断结果不冒充已关闭的产品验收。file-upload 已按既有 hostPhase 合同修正，实际 Host 无导入失败或服务等待；工厂运行时 props 及属性边界已有回归。会话提交/图片拒绝两例仅等待公开上传就绪，无生产语义修改。

框架 kit 在创建 VNode 前按组件实际声明的 props/emits、mixins/extends 或 class __vccOpts 过滤；调用方显式属性、事件、class/style、key/ref 完整保留并最后覆盖。函数组件仍接完整 kit；工厂和普通 slot 同用实例内缓存，不通过关闭 inheritAttrs 隐藏问题。新增真实 renderer 九项回归覆盖边界和异步外层传参，不以直接组件 fixture 代替装配证明。

表格的 HTML sink 回归已在生成产物前收敛：只对固定 Luckysheet 2.1.13、固定源码 SHA 与精确命中计数执行文本/公式和复制转义变换，版本或内容漂移即构建失败。只读编辑与复制 listener 归当前实例，只处理引擎拥有的复制，保留原生栏内选中文本；不用全局 jQuery 修改，不放宽 CSP，不把 iframe 当安全边界。实际产物受控脚本计数 7→0，六种恶意缓存值、系统剪贴板双 MIME、选区、样式/合并/分页、双实例及卸载验证通过；616 项模块回归与九项构建/config/复制边界用例通过。

目录按钮替换输入框的 null-relatedTarget 焦点事件采用 nextTick 后重查现有 openGeneration/requestSeq/草稿身份和当前焦点；显式外部焦点仍立即取消，不新增状态权威。局部 94 项及实际包类型通过，刷新后装配焦点 13 项通过。无会话 agent preset 在缺源 selector 外组合 no-session 默认，保留缺源不调用 selector 的原生合同；220 项及完整 Vue Client 聚合通过。AppFrame 按现有结构赋稳定同级 key，避免 drawerMask 插入将旧列复用为另一列；136 项及真实五列/sidebar DOM、草稿/关闭态跨视口保留验证通过，不改变 CSS/布局算法。文档全跑 42 项与唯一引用门禁修正后定向检查通过。实际同场景桌面/窄屏 Before/After 已复核，测量的矩形/字体/间距一致；只证明该空工作区及展开侧栏场景。完整 Web replay、自查及 PR/CI 未关闭。Forge 部分未改 Host Git 流程仍五秒超时，一个同例在原版复现；不将其推广为所有超时已证明无关，也不声称全套通过。

## Tab 消费者生命周期收尾

实际 OPC 与 Forge 重开路径出现由 slot 边界捕获的异常，`pageErrors` 为空不能证明装配成功。WorkspacePicker 的非工厂组件须显式声明 locale 参数；Guide 在替换 tab 前捕获原 actions，禁止替换后再次读取已失效的 strict info。文件导航 selector 只选自己的 pane 状态集合，在组件计算中读取当前 tab；测量 key 归已提交 DOM 的 pane 绑定持有，同 pane 复用回调，移动时重绑并忽略旧绑定的迟到 null。Toggle 的提交后注册按原 pane 清理，不在卸载回调重新读取 tab。保留 strict info 的缺失报错和同实例 pane 移动能力，不新增业务状态镜像或全局缺失回退。消费者三包 1237 项及后续 occurrence 身份修复三包 1028 项分别通过，数字不可相加。浏览器复跑进一步证明：动态 resource key 的同步绑定也会在 Vue 移除旧子组件前读取失效 strict info，不能冻结 contentId 或增加缺失默认值来绕过。

原生 observable 适配器保留初次 source 解析立即校验，后续 source、getSnapshot、selector、equality 错误同步发布到只读 ref，并在读取时抛出；成功更新清除错误。使用属于当前 Vue scope 的公开 `effect`、同步 runner 与 onStop 清理，使错误保护覆盖真实依赖读取。仅在 watchEffect 回调或外层 computed getter 内捕获不足：Vue 会先递归刷新依赖的 computed 再进入回调，真实负向用例已证明该路径。合法更新保持同步，selector 条件依赖、相等引用及过期回调保护保留；存活组件仍经 render 边界报告错误，不吞错或延迟 key。七项新增错误/移除/恢复回归、renderer 全部 239 项与 Forge 三套 180 项通过，完整 Vue Client 检查通过；初次及更新中由 selector 自身修改 source 的已有重入限制经固定基线对照一致，不在本次扩大行为。公开 Vue 生命周期依据见 [effect](https://github.com/vuejs/core/blob/main/packages/reactivity/src/effect.ts) 与 [effectScope](https://github.com/vuejs/core/blob/main/packages/reactivity/src/effectScope.ts)。已恢复迁移夹具被改写的原版 projection 断言：source 存在而 snapshot 为 undefined 时仍执行 selector，只有 source 缺失时跳过。该阶段八门产物 70.42 秒、产物后 Host/Vue Client 聚合 49.98 秒通过；原 Forge 重开失败用例与 OPC 三种独立写入器工作簿的原断言均已通过。随后完整 Web replay 已结束，完整统计及本轮修复见下一节；这些阶段结果不替代完整验收。

## 完整回归中的作用域与预览修复

Contextual hook 的子 scope 由 factory、hook context 与各项 framework 输入的身份共同持有；等价 options 或标准输入包装不应释放 scope。绑定依赖仅显式读取这三类输入，不把 factory/hook 内部的响应式读取纳入重建依赖。标准输入按自有可枚举 key 集及逐项 `Object.is` 比较并保存浅快照；有意义的变化先清除转发目标再释放旧 scope。失败重绑也释放部分 scope，禁止旧 DOM ref 写入已退役目标。实际 Vue 父子重渲染负例先出现多次创建，修复后保留 scope；context、factory、标准值及 key 增删仍逐次释放重绑。renderer/chat 合并 1270 项与完整 Vue Client 类型通过。ChatNodeSeat 将 turnData 提取为独立 computed，再构造 hook context，恢复原 useMemo 对 turnData 而非整 Node 的依赖：相同 turnData 的流式结算保留展开态与订阅，真正 turnData/groupAction 变化仍释放重绑；真实 Slot 负例/修复用例及三套 188 项通过。模型列表恢复 visibleModels 布局依赖，索引 DOM ref 的旧 null 回调只清理自己持有的元素，不清理新占位行；排序回焦仅恢复因原节点移动落到 body 的同一连通按钮，保留外部焦点与卸载边界，两套 93 项通过。Inspector 保留原显式空格文本节点，180 项通过，不修改 golden 或归一化器；底栏真实插件注册验证修复错误 inject 调用。上述源码已通过新八门产物 27.47 秒与产物后两侧聚合 9.94 秒，实际模型设置 Chromium/WebKit 共 19 项通过；聊天/模型合计 44 项中 33 通过、7 失败、4 跳过，聊天动画/模式切换与命令 popup 黏性标题仍未关闭。后续单例浏览器 trace 证明命令 popup 在清空搜索后主动将 Quartz 滚入视野，当前 observer 正确响应，非旧 observer 回调：PopupSelectView 的共享递增索引在延后 group slot 按不同顺序执行时分配错误。现已改为渲染前从同一 filtered rows 建立不可变索引，保持点击/高亮和选择权威顺序，真实复用 Quartz DOM 的负例红绿及 commands 五套 152 项、完整 Vue Client 类型通过；该补丁已进入最新 33.90 秒八门产物，尚未取得原 observer 浏览器结论，不改 observer 或原断言。

PDF 的 immediate/post watcher 仍可能在 setup 阶段执行，观察 DOM 前须检查真实 host/canvas 元素。严格元素 observer Mock 修复前 11 项失败、修复后原 19 项通过；原虚拟化、缩放、复制和卸载断言保留。表格更换引擎不放弃原单底栏、缩放、冻结、无分隔线和只读验收；原 iframe/选择栏/引擎控件变化须以真实用户输入及等价几何证明，不能调用内部状态让夹具通过。局部测试不代替实际可用性：当前真实引擎已在 DPR 1/2、900/360/480/900 宽度证明原 31px 单底栏、原生 100→150→100 缩放及实际滚动 240px 后的冻结内容；通过 iframe 内样式重排现有控件，内部统计栏高度仍由公开选项保持零，只隐藏冻结 DROP/HANDLE，不隐藏冻结画布、修改私有 Store 或放宽只读保护。新产物 Office PDF 原用例通过，混合预览仍在 CSV 键盘选区失败，其他原断言继续复验。WebKit 精确版本已用本地库完成默认实际启动及依赖加载验证，安装没有修改系统或仓库，产品缺失覆盖仍须重跑。完整浏览器 replay 已结束：250 文件中 167 通过、79 失败、4 跳过，1100 测试中 902 通过、130 失败、68 跳过，另有两个 reasoning-preview turn/end 超时拒绝；缺少 WebKit 与真实回归分别修复，不放宽断言或将全部失败归为旧基线。

Windows 上传构建配置 TS6307 的远程根清单修复经本地移除单项再现同错、当前上传测试和 Host 聚合通过，并由用户更新后确认错误消失；没有为同一问题再造补丁，也未直接访问或修改用户的 J: 盘。

聊天 DOM 协调保留同步的取消、历史状态和布局失效记账，只在后续已打开的提交中等待后代折叠注册，再协调输入/内容跟随；微任务以存活与提交代次约束，明确回底动作使旧任务失效。模式分支读取既有 presentation policy 的 foldCompletedTurns，不复制模式枚举。初次初始化仍同步，否则 activeTurn 晚发布会破坏原转轮不多渲染的断言。完整 Chat/renderer 85 套 1276 项通过，包括五项真实后代 hook 集成；最终初始化调整已进入最新 29.23 秒八门产物，产物后 Host/Vue Client 两侧聚合 47.70 秒全部通过；最新原聊天 17 项浏览器 16 项通过，折叠、内容增长与 Verbose→Standard 原断言通过，仅大输入折叠的反向运动仍失败；不得将单测或最终位置正确当作动画合同全部通过。后续真实 writer trace 证明外层 scrollEnd 经 reading.flushSample/followTail 写入尾部 floor，ResizeObserver 在同一 fold 实例内始终正确受限。新增边界仅在 outer、foldActive 且纯 readScroll 明确非 reader 时跳过 reader flush，历史检查仍执行；nested、真实 reader 与 fold 外行为保持。真实后代 fold 负例 top600→649.73，修复后原 80 项与四个新归属控制共 84 项、完整 Chat 1039 项及根类型通过，此补丁尚未刷新产物/原大输入浏览器。

工作区列表的行键和节点应在同次渲染、进入延后 slot 前共同派生。缓存 computed 行键在 slot 执行时 push，会让 AnimatedRows 的 beforeUpdate 看到空键，错误克隆仍保留的 Ungrouped；再次计算还会累积重复键。已用相同 Vue renderer 证明并局部修复 WorkspaceBrowser；545 项工作区（含原 544 项）、原 AnimatedRows 15 项及完整 Vue Client 类型通过，保留原唯一行断言，不改全局动画算法。最新工作区原浏览器 17 项中 11 通过，剩余六项另行定位，不能将保留行修复视为全部交互通过。四项焦点断言实际发生在 Host 状态成功之后：父 InputBar post watcher 在子 ComposerContentEditable 绑定 Lexical 根之前聚焦，之后无依赖再触发；改用已有公开 registerRootListener，保留已绑定根立即处理、晚根一次意图、editor/session/锁定与卸载清理、期间显式新焦点不抢回。真实 resident/root 负例及四套 189 项、根 Vue 类型通过，仍待原浏览器确认。Hover 复制夹具需先真实命名，因为原版和新实现都禁止复制空标题的 Untitled 显示回退；仅补公开 rename 准备和真实行标题等待，不放宽原 dwell/可达/剪贴板/反馈几何/关闭断言。新空会话缺少 Chat 入口仍待实际选择/phase/blank/view roster 证明，不提前改协议。通知原同步点击后立即读取动画的夹具改为等待真实提交和动画，原浏览器单例的同节点、起点、中点、终点几何及确认断言全部通过；同轮模型 observer 四项通过、四项既有跳过。

表格复制恢复只归属于受保护的既有隐藏编辑器，只有当前 realm 存活、页面仍聚焦、临时复制输入已移除且焦点为空闲时才恢复；原生选择栏复制不抢焦点。F2 纳入既有编辑阻断，箭头/Home/End 等导航仍由引擎处理。像素滚轮限定网格/标签范围，向真实水平与垂直端口转发，保留 ctrl/meta、其他 deltaMode 和外部控件行为并清理监听。真实 DPR 1/2 复制后选区/原文、编辑拒绝、双轴渲染与冻结内容通过，十项单测通过；父任务原九项组合实际完成，OPC 与安全产物回归及 Office/Markdown 通过；另外五项仍有布局差 2px/15.125px 与 Plain text 切换菜单节点脱离失败，不能以局部证明关闭整页。后续命名几何证明窄屏 24px 箭头加 inline 空白超出固定预留，改为 iframe 内既有控件 flex 自动分配；原生箭头量化 152px 与原 150px 交互合同不同，实例内捕获原按钮仅按真实 tabs DOM 精确滚动 150px，普通标签及其他点击不改并清理监听。引擎根尺寸 Hc−2 与按 Hc 计算的 canvas 不一致，使用同 iframe 根 border0/width100%/height100% 对齐，不裁切 bitmap 或改坐标。引擎公开 fullscreenmode 默认 true，其 Fm 50ms 抢焦被实际 stack 证明；仅显式设 false，保留自有复制恢复。真实 DPR1/2×四宽度全部原几何项最大差0、六控件中心命中、31px 底栏、双向150/zoom、缓存值及冻结/选择/复制/只读/外部焦点120ms通过；十一项局部与根类型通过。最新八门产物31.32秒、产物后两侧聚合9.45秒通过，原七项5通过2失败，OPC/安全原用例通过；几何/DPR冻结/混合文件与Plain text菜单均关闭，两语言进一步走到旧不存在的导航控件焦点 selector 超时。等价映射为原生非聚焦箭头及实际键盘编辑器，保留原焦点false/true、左右选区及公式断言，待定向复验。最新五套43项共39通过4失败，不用局部证明声称全量完成；所有阈值与原交互断言保留。

## 实施中的编译契约

Client 类型面采用 `vue-tsc`、声明输出和 `rewriteRelativeImportExtensions: false`；runtime 的 Client browser/Node、静态库与 shell bundle 从对应 `src` 编译。Host 类型面仍使用 `tsc` 与既有 emitted 输入。原因是 TypeScript 6 对 `.vue` 的相对导入重写报 TS2876，不能通过关闭检查解决。源输入映射保留 package-relative cwd、原有产物名、source map 来源和资源隔离边界。

SFC 由 [Vue compiler-sfc](https://github.com/vuejs/core/blob/main/packages/compiler-sfc/README.md) 编译 script setup 和内联模板；样式继续由 module metadata 和 DocumentStyles 持有，插件工厂不直接写 DOM。当前显式支持 JS/TS script setup、普通和 scoped CSS、既有 CSS Module import 与 package assets；普通 script、template-only、外部块、预处理器和 `<style module>` 尚未支持，并在构建时报诊断。

已知 [Vue language-tools](https://github.com/vuejs/language-tools/blob/master/packages/tsc/README.md) 3.3.14 边界：单行 script setup 紧贴 `</script>` 且没有分号/换行时，虚拟代码可能拼成 `defineProps<__VLS_Props>()type __VLS_PublicProps`，导致 props 声明变成 any。当前严格类型样例使用正常换行/分号，并验证未导入 SFC 的 template 错误；这些结果不能证明该上游边界已修复。产品 SFC 应保留标准多行排版，最终类型验收需复核声明输出。

Vite+ 1.3.0 依 [官方本地 CLI 配置](https://viteplus.dev/guide/local-cli) 统一 `vite@*` → `@voidzero-dev/vite-plus-core@1.3.0` 和 `vitest@*` → 5.0.5；inline test projects 明确 `extends: false` 保留独立 roster，避免 Vitest 5 默认继承合并数组造成重复执行。父代理统一 runner 复跑编译、资源、隔离和 watcher 四组测试通过，共 143 个独立用例；这不替代真实 Host/Boot 或产品验收。
