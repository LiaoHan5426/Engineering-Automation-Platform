# 阶段计划与完成跟踪

更新：2026-11-16。独立 `dsh-personal` 分支及同名目录使用 Vite+；用户已授权全部 P0～P4，包括实验 UI 与桌面欢迎入口。暂不适配 EAP 后端。当前实现仍在验证，PR 为未完成草稿；定向通过不代表全产品交付或用户接受。

| 阶段 | 入口与替换路径 | 退出证据 | 实际状态 |
| --- | --- | --- | --- |
| 固定源与契约审计 | 固定 upstream commit，保留原版独立基线 | 包清单、接口及消费者影响 | 固定源审计完成；清单计数是历史源码数量，不是迁移完成率 |
| P0 真实链路 | Vite+、原生 Vue renderer、SFC、既有 Host/Boot/Loader、共享平台表 | 类型、closure factory、HMR、启停、样式和失效 disposer 回归 | 真实 Host/SFC 生命周期通过，生产 renderer 已切换 Vue；八项产物门禁及 Host/Client 聚合检查通过。隔离完整 Host 启动仍发现模块导入错误，匹配 After 尚缺，不能关闭阶段 |
| P1 基础组件与布局 | primitives、内容、菜单/弹层、主题、dockkit、layout，复用原模型 | 完整 slot/factory/HOC、焦点、几何、隔离及窄屏 | 原生实现、构造器 props 正负类型合同与真实 Loader 卸载重载通过；实际装配暴露的工厂参数 DOM 透传、运行时 props 声明和窄屏走查仍在收尾 |
| P2 核心会话 | workspace、会话、输入、消息、流式输出、工具、审批/问答 | 原合同交互、取消、草稿和会话隔离、视觉对照 | conversation、workspace、chat、tool 等多批回归通过；12 模块合并 166 文件 3430 项通过。完整 Client 类型聚合与 Loader DOM/服务/console 清洁回归通过；实际装配仍发现提交等待可编辑状态与图片拒绝提示问题，尚不能关闭 |
| P3 其余产品 | 文件/预览/终端、设置、插件、子代理、调度、Forge、时间线、实验 UI、桌面欢迎入口 | 每项原行为、异步资源与权限边界保持 | 预览 608 项及真实 lazy bundle/licence smoke、时间线/轨迹 688 项、桌面欢迎 30 项及实际产物挂载通过；Forge Client/Host 类型通过，Host Git 超时回归仍需核实。Web 源与产物多项通过，完整交互、预览安全行为和最终产物刷新待验证 |
| P4 清理与交付 | 删除被替代 React 实现/依赖，原生平台表、构建/测试工具与文档同步 | 全局类型、产物、完整相关回归、实际 Before/After、自查及 PR/CI | 进行中：直接 React 依赖已清理，完整安装通过；仍须核对最后桌面/Web/脚本消费者、最终锁文件、产物与完整门禁。VitePress 文档工具的间接 DocSearch React 依赖不属于 DSH 应用运行时清零证据，不能声称整个工作区安装图没有 React |

## 当前完成项与边界

- 隔离工作树中保留固定原版源码及模型、store、Cordis/Loader、权限和 Host 领域权威；现有 EAP 前后端未修改。
- 只读 selector 在 setup 绑定，Vue render 解包；工厂局部源、contextual 生命周期和可写 DOM ref 分别保留原职责，不增加 React facade 或 Pinia 状态副本。
- 共享平台表统一 Vue 与 Vue Virtual 身份；第三方 React 表格 UI 替换为本地加载的框架无关 Luckysheet。双实例真实浏览器验证保留缓存公式值、格式、合并、分页、复制及只读隔离，未触发重算。
- 对原生样式进行长度单位审计，修正头像、退出图标与轨迹面板等非零长度的 px；保留 opacity、索引、自定义缩放变量等合法无单位值。
- 2026-11-16 作用域结果包含：session log export 131 项；预览 608 项及产物 smoke；剩余小型夹具 67 文件 960 项；Forge 三份核心夹具 179 项。数字不能相加成全量结果，各批可能共享依赖或重复执行。

## 当前未完成项

完整产物构建八门已通过，随后 Host 与 Client 两侧聚合检查均通过（2026-11-16，分别 53.60 秒与 51.16 秒）；早期 712 项诊断是历史记录。真实 Loader 消费者首次加载、卸载、重载的 DOM/服务及 console.error 清洁断言已通过。实际 Web、桌面欢迎与客户端产物输入审计未发现 React runtime，文档工具间接依赖另行说明。

真实应用验证仍有必须关闭的问题：隔离 Host 的 file-upload 模块导入语法错误、WorkspacePicker 工厂遗漏运行时 props，以及原生表格对文本/公式 HTML sink、复制 HTML 和只读栏的回归；受控探针证明同源脚本执行风险，必须修复并验证真实产物后才能交付。工厂参数向 DOM 透传的边界也在审计。会话提交与图片拒绝提示两项已确认是装配夹具的上传就绪竞态，等待公开发送按钮可用后原断言全部通过，无生产源码修改。

用户于 2026-11-16 要求适时阶段性提交。先保存已通过类型、构建与多批回归的完整导入/原生迁移检查点，明确保留上述未完成项；后续按有证据的修复继续提交。检查点不是里程碑完成，不发布未验证的运行产物，也不将草稿 PR 标为 ready。最终修复后须刷新相关产物，再完成浏览器、文档与交付门禁。

原版真实应用已经捕获相同主题、桌面与窄屏空工作区场景；匹配目标 After 尚缺失，不能宣称 Before/After 完整。原版基线服务已停止，需要对照时重新以独立配置启动；不能把旧服务记录当成当前可用服务。尚未完成最终自查、CI 和可交付 PR 更新。

## 已执行验证与历史证据

以下早期记录保留为历史切片，不代表当前源码全量结果：

- 原版 `vp install --frozen-lockfile` 成功；原版 `vp run build` 10 门通过，379 个客户端产物。
- 目标最小 renderer/core/styles/store/layout：14 文件 229 项通过；dockkit 325、theme/locale/Modal 207、session/provider/projection 52 项分别通过。
- 编译、资源、隔离、watcher 四组早期门禁 143 项通过；真实 Host/SFC 浏览器生命周期用例通过，覆盖 HMR、effect/样式清理及停启，不替代完整产品验收。
- 当前 `vp test run scripts/client-bundle-css.spec.ts scripts/client-build-environment.client.spec.ts packages/test-support/client-runtime/tests/context-menu.client.spec.tsx` 对应 46 项通过；更新平台与 Vite+ 解析夹具后，purity 与 browser externals 两组重跑 74 项通过。脚本门禁尚须在最终源码上统一复核。

## 交付关闭条件

1. 所有剩余原生消费者、声明与测试夹具迁移完成，保持现有正负类型断言及业务风险回归。
2. Vite+ 完整类型、构建、架构/包依赖和相关回归通过；记录失败、跳过与未验证项，不以作用域结果替代全局结果。
3. 实际应用完成同场景 Before/After、桌面与窄屏交互验证；产物与运行时不再加载 DSH 被替代的 React 实现。
4. 同步本表、根工作项台账与契约决策，自查后提交并更新 PR，由人工评审合并；不自动合并。
