# 固定源契约审计

状态：源码审计草稿；不是运行验证。以下结论来自公开固定源码，未把包名或注释视为框架无关的证明。

源链接统一固定到 `39163dd30f703a79079e2d2446545cff3c453738`。

| 契约及已见事实 | 必要替换及消费者影响 | 验证出口 |
| --- | --- | --- |
| [ui-slots/renderer.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-slots/src/renderer.ts#L97)：`SlotScopeAdapter.renderArea?(binding: StandardSourceBinding, props: SessionAreaProps): ReactNode`；`RenderOpts.fallback?: ReactNode` | 该文件首行虽称 React-free，实际仍导入 ReactNode。必须定义 Vue 渲染值和作用域/slot 语义，并同步 scope adapter、outlet 及插件组件调用方；改一个 renderer 实现不能消除类型和调用协议差异 | slot/factory 多实例、两会话隔离、缺失作用域、局部失败隔离；先穷举调用方，尚未完成 |
| [ui-renderer/bind.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-renderer/src/client/bind.ts#L20)：`bindSnapshotSelector<T>(w: HostObservable<T>): SnapshotSelectorHook<T>` 通过 `useSyncExternalStoreWithSelector` 生成 hook | 保留源的 subscribe/getSnapshot，不直接把 hook 返回值替换为 Vue ref。先定义 Vue 消费接口，再同步 selector、equality 及组件读取方式；所有现有 hook 消费者均需核查 | 订阅建立期间更新、selector 参数改变、数据源切换、卸载清理、旧回调失效 |
| [ui-renderer/renderer.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-renderer/src/client/renderer.ts#L64)：`mount(container: HTMLElement): () => void`；`if (this.current !== mounted || mounted.releasing) return` | 保留服务形状与旧 disposer 隔离；替换 hydrateRoot/createRoot、React BootHandoff、buildRenderApp。DocumentStyles 资源所有权应保留，不能简单删掉 hydration 路径 | Boot 交接、重复 mount、挂载失败回收、renderer 替换、过期 disposer、模块样式引用 |
| [web/platform.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/web/src/platform.ts#L8)：`PLATFORM_MODULES` 含 react、react/jsx-runtime、react-dom、react-dom/client、@tanstack/react-virtual | 该表由 seed、external 与 Vite alias 共同使用。须协调 shell 与动态插件的共享 Vue 身份及虚拟列表替换；不能只给 Web 添加 plugin-vue | 跨插件共享同一 Vue、产物不执行 React、异步 chunk 和资源加载 |
| [tsdown.client.ts](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/tsdown.client.ts#L148)：`clientBundle(packageDir: string, libEntry: readonly string[], options: ClientBundleOptions = {}): BuildFaceConfig`；client pass 读取 `lib/types/client/index.js`，产物通过 `window.__ModuleLoader__.load({id, factory, meta})` 注册 | 需要 SFC 到 JS/声明/source map 的编译阶段，并保持 closure-factory、CSS 元数据、assets 与 Host/Client 双面构建。普通 Vite SFC 示例不覆盖该插件通路 | 至少一个真实 SFC 插件经 Host 资源服务、Boot、loader 加载，启停/更新后资源清理正确 |

## 当前边界决定

本次先保留审计和清单，不批量改写实现。迁移包含多个独立模块共同依赖的组件类型、状态读取契约和插件产物协议，不能归为单模块局部替换。按工作范围约束，整体实现停在这里，先形成可验收的分阶段接口迁移方案。

建议第一闭环只覆盖 Vue 状态绑定、renderer、普通 slot/factory 和一个真实 SFC 插件的构建/加载/清理。后续组件与产品功能应以该闭环的实际结果排序。原 React 输入只用于独立基线对照；目标最终不保留 React 运行时包装。Vite+ 作为目标项目的安装、开发、检查和构建入口，其 CLI 和 SFC 插件构建是不同层级。

## 尚未证明

尚未穷举 `ui-slots` 的全部类型/注册消费者、全部页面和功能、实验插件、桌面 IPC、第三方 React 插件，也没有执行原版或 Vue 版运行验证。未读取的文件不能据此标为 framework-free；清单内所有包均为 NOT_STARTED。没有选定 Vue/Vite+ 兼容版本或提交锁文件，不能宣称工具链已验证。
