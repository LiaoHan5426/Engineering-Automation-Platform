# 阶段计划与完成跟踪

更新：2026-11-16。独立 `dsh-personal` 分支及同名目录使用 Vite+；用户已授权全部 P0～P4，包括实验 UI 与桌面欢迎入口。暂不适配 EAP 后端。当前实现仍在验证，PR 为未完成草稿；定向通过不代表全产品交付或用户接受。

| 阶段 | 入口与替换路径 | 退出证据 | 实际状态 |
| --- | --- | --- | --- |
| 固定源与契约审计 | 固定 upstream commit，保留原版独立基线 | 包清单、接口及消费者影响 | 固定源审计完成；清单计数是历史源码数量，不是迁移完成率 |
| P0 真实链路 | Vite+、原生 Vue renderer、SFC、既有 Host/Boot/Loader、共享平台表 | 类型、closure factory、HMR、启停、样式和失效 disposer 回归 | 真实 Host/SFC 生命周期、刷新后的八项产物门禁和两侧聚合检查通过；修正 file-upload 的 Host phase 后实际服务启动无模块导入/服务等待错误。完整交互及视觉差异尚待关闭 |
| P1 基础组件与布局 | primitives、内容、菜单/弹层、主题、dockkit、layout，复用原模型 | 完整 slot/factory/HOC、焦点、几何、隔离及窄屏 | 原生实现、构造器 props 正负类型合同与真实 Loader 卸载重载通过；框架输入/调用方属性分离已有原 223 项及新增 9 项回归，lazy terminal 显式五参数外层保留异步加载。窄屏转场重挂载已由稳定同级 key 修正，136 项含 DOM/草稿/关闭态跨视口保留用例通过；实际浏览器对照仍在复验 |
| P2 核心会话 | workspace、会话、输入、消息、流式输出、工具、审批/问答 | 原合同交互、取消、草稿和会话隔离、视觉对照 | conversation、workspace、chat、tool 等多批回归及 12 模块合并 166 文件 3430 项通过。上传就绪后提交/图片原断言通过，确认仅夹具竞态。目录编辑 null-blur 修复有 94 项及实际包类型检查；无会话 agent preset 可见性修复有 220 项及完整 Vue Client 聚合检查。真实产物装配焦点 13 项通过，完整 Web replay 仍在执行 |
| P3 其余产品 | 文件/预览/终端、设置、插件、子代理、调度、Forge、时间线、实验 UI、桌面欢迎入口 | 每项原行为、异步资源与权限边界保持 | 预览 616 项、安全负向/config 9 项及真实产物攻击/复制/只读/双实例验证通过；时间线/轨迹 688 项、桌面欢迎 30 项及实际产物挂载通过。Forge 三份 Host 重跑 147/167 通过，余 20 项五秒超时；一个同例原版也超时，不能推广为全部原版问题。完整 Web replay 正在基于刷新产物执行；Excel OPC 已到达真实预览 URL 边界，尚有失败在定位 |
| P4 清理与交付 | 删除被替代 React 实现/依赖，原生平台表、构建/测试工具与文档同步 | 全局类型、产物、完整相关回归、实际 Before/After、自查及 PR/CI | 进行中：直接 React 依赖、平台表和实际产物闭包已清理；完整安装、刷新后的八门构建与两侧聚合检查通过。焦点/可见性/布局修复已刷新八门产物并通过两侧聚合检查，文档 43 门以全跑 42 项及唯一失败修正后定向通过完成核验；最终视觉证据发布、自查和 PR/CI 未完成。VitePress/DocSearch 间接依赖仍在，不声称工作区安装图无 React |

## 当前完成项与边界

- 隔离工作树中保留固定原版源码及模型、store、Cordis/Loader、权限和 Host 领域权威；现有 EAP 前后端未修改。
- 只读 selector 在 setup 绑定，Vue render 解包；工厂局部源、contextual 生命周期和可写 DOM ref 分别保留原职责，不增加 React facade 或 Pinia 状态副本。
- 共享平台表统一 Vue 与 Vue Virtual 身份；第三方 React 表格 UI 替换为本地加载的框架无关 Luckysheet。双实例真实浏览器验证保留缓存公式值、格式、合并、分页、复制及只读隔离，未触发重算。
- 对原生样式进行长度单位审计，修正头像、退出图标与轨迹面板等非零长度的 px；保留 opacity、索引、自定义缩放变量等合法无单位值。
- 2026-11-16 作用域结果包含：session log export 131 项；预览 616 项及产物 smoke/安全浏览器验证；剩余小型夹具 67 文件 960 项；Forge 三份核心夹具 179 项。数字不能相加成全量结果，各批可能共享依赖或重复执行。

## 当前未完成项

2026-11-16 最新完整产物八门通过（27.48 秒、395 个 Client 产物及三个 public value），包含表格安全、框架参数边界、目录焦点、agent preset 和布局修复。Host 聚合检查 9.45 秒通过；Client 聚合最初发现新增测试四处 locale/品牌 ID 类型错误，使用实际双语字典和规范品牌 ID 修正后，完整 `vue-tsc -p tsconfig.client.json` 空输出通过。文档全跑 42/43 通过，唯一历史提交引用错误修正后对应门禁通过；不冒充单次全绿运行。早期诊断保留为历史记录。真实 Loader 首次加载、卸载、重载的 DOM/服务及 console.error 清洁断言通过；应用产物输入审计未发现 React runtime。

已关闭的实际装配问题包括 file-upload Host phase、WorkspacePicker 运行时 props、框架 kit 与调用方属性分离、lazy terminal 五参数透传。表格采用固定版本/哈希/替换计数的 sink 前构建变换及实例内只读/复制保护，真实产物受控脚本执行计数由 7 降至 0，系统剪贴板双 MIME 与原生选中文本复制均通过；iframe 本身不作为安全证明。提交与图片提示两项仅修正夹具等待公开上传就绪，无生产语义修改。

目录编辑焦点、无会话 agent preset 可见性和响应式布局子树身份修复均已有局部回归与刷新产物。装配焦点 13 项、实际跨视口五列及 sidebar 身份/已关闭 onboarding 保留通过，零页面错误；桌面 Standard mode 与窄屏标签恢复。完整 Web replay 正在执行，Excel OPC 预览 URL 边界失败仍在定位；这些状态不等于整产品通过。Forge 余下 Host Git 超时单列为未验证风险，不放宽五秒断言。

按用户阶段性保存与推送要求，完整导入/原生迁移检查点已推送至草稿 PR #8；后续本地修复尚未包含在该检查点。阶段提交不是里程碑完成，不发布未验证运行产物，不将草稿标为 ready。后续提交前同步本表、契约记录与根台账。

原版实际桌面/窄屏基线已捕获；本地修复后的同场景 After 已捕获并读取检查，桌面 Standard mode、窄屏标签和转场身份保留通过。对照尚待对应提交版本及发布，侧栏条目累计间距差异仍在只读核查，不宣称 Before/After 验收通过。原版基线服务已停止，不能把旧服务记录当作当前可用。最终证据发布、PR 自查及 CI 尚未完成。

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
