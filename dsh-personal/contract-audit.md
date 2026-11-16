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

阶段性提交仅保存实施检查点，仍是未完成草稿。当前隔离 Host 的 file-upload 原始 decorator 导入问题正在按既有 hostPhase 合同修复；工厂 props 声明与 DOM 属性边界仍在收尾。表格的受控实际产物探针确认原生引擎对公式/文本 HTML sink、复制 HTML 和只读栏存在回归，甚至可执行受控同源脚本；必须在 sink 前修正并通过真实产物浏览器回归后才能交付，不能把 iframe 或旧 Fortune 补丁当成安全证明。会话提交与图片拒绝提示的两份原装配用例已确认只是上传就绪竞态，等待公开发送按钮可用后原断言全部通过，未修改生产语义。最终产物刷新、匹配 Before/After、文档门禁、自查及 PR/CI 仍待关闭。

## 实施中的编译契约

Client 类型面采用 `vue-tsc`、声明输出和 `rewriteRelativeImportExtensions: false`；runtime 的 Client browser/Node、静态库与 shell bundle 从对应 `src` 编译。Host 类型面仍使用 `tsc` 与既有 emitted 输入。原因是 TypeScript 6 对 `.vue` 的相对导入重写报 TS2876，不能通过关闭检查解决。源输入映射保留 package-relative cwd、原有产物名、source map 来源和资源隔离边界。

SFC 由 [Vue compiler-sfc](https://github.com/vuejs/core/blob/main/packages/compiler-sfc/README.md) 编译 script setup 和内联模板；样式继续由 module metadata 和 DocumentStyles 持有，插件工厂不直接写 DOM。当前显式支持 JS/TS script setup、普通和 scoped CSS、既有 CSS Module import 与 package assets；普通 script、template-only、外部块、预处理器和 `<style module>` 尚未支持，并在构建时报诊断。

已知 [Vue language-tools](https://github.com/vuejs/language-tools/blob/master/packages/tsc/README.md) 3.3.14 边界：单行 script setup 紧贴 `</script>` 且没有分号/换行时，虚拟代码可能拼成 `defineProps<__VLS_Props>()type __VLS_PublicProps`，导致 props 声明变成 any。当前严格类型样例使用正常换行/分号，并验证未导入 SFC 的 template 错误；这些结果不能证明该上游边界已修复。产品 SFC 应保留标准多行排版，最终类型验收需复核声明输出。

Vite+ 1.3.0 依 [官方本地 CLI 配置](https://viteplus.dev/guide/local-cli) 统一 `vite@*` → `@voidzero-dev/vite-plus-core@1.3.0` 和 `vitest@*` → 5.0.5；inline test projects 明确 `extends: false` 保留独立 roster，避免 Vitest 5 默认继承合并数组造成重复执行。父代理统一 runner 复跑编译、资源、隔离和 watcher 四组测试通过，共 143 个独立用例；这不替代真实 Host/Boot 或产品验收。
