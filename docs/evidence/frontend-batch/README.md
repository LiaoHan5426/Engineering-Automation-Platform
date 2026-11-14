# 前端交互系统走查与集中修复（2026-11-14）

本轮承接用户要求按全部入口集中排查和交付，避免单次只调整一个点。实现基线`938ab68`，包含已合并的共享焦点修复与模型连接表单关闭保护。采用实际Vue应用、独立HTTP Mock及明确标注的浏览器HTTP故障夹具；未填写真实凭据、调用真实模型、修改日常数据库或运行源码应用动作。全站入口和局部异步状态分别检查，不能将浏览器模拟等同真实后端业务接受。

## 全部入口与处理理由

页面清单由App固定入口/插件注册推导，不按单张截图猜测范围。基线已逐页加载17入口×1440/390两视口，34组均无pageerror或横向溢出。截图和页面标题/结果位于[Before清单](before/inventory.json)。Code/Work分别检查；两个Builder实例分别检查。已存在的正常交互保持，不另选视觉样式或替换技术栈。

| 入口 | 保留理由与本轮处理 |
|---|---|
| Code聊天 `#chat` | 保留显式发送、授权/审批/UNKNOWN、上下文与工具分面；修正未发送草稿、异步创建会话和文件读取的归属/晚到结果，选择器关闭回到输入区 |
| Work办公 `#work` | 与Code共用会话/编辑器路径，保留文档显式保存与未保存确认；同受会话/附件归属修复覆盖，不引入自动发出内容 |
| 场景 `#scenes` | 保留列表→详情/工具/技能/MCP→设计/准备分面；技能列表ticket和准备动作去重、共享场景选择状态已具备，无证据支持改动 |
| 对话角色 `#expert-catalog` | 只读角色卡和返回来源会话符合目标，保留；不将角色当动态专家授权 |
| 专家 `#experts` | 保留列表/搜索→概览/配置/任务/运行/审批；补配置初始化加载/错误重试、保存时禁止变更字段并固定提交身份，原审批及UNKNOWN联锁保留 |
| 模型设置 `#model-settings` | 保留既有连接草稿保护；补模型目录全部关闭路径保护、跨入口离开保护、已接受保存与概览刷新失败分开处理 |
| 外观 `#appearance` | 即时应用并有存储失败反馈，无待提交草稿，保留即时选择而不增加无需求确认 |
| 技能 `#skills` | 导入有独立选择/信任/提交，保留草稿及在途日志，禁用/关闭策略已有回归；不把文件选择自动合并上传或发布 |
| 插件 `#plugins` | 保留只读详情、明确停用及拒绝原因；不实现新的插件SDK或任意JS安装 |
| 规则 `#rules` | 保留规则列表→结构化详情/独立JSON/试算；修正保存与读回覆盖新编辑、详情选择竞态、未应用JSON丢失和旧试算结果污染 |
| 知识库 `#knowledge` | 保留文档/检索Tabs、独立正文编辑及哈希读回；补新建关闭保护、失败列表重试、已接受创建/录入后的读失败恢复，重试只读不重复写入；现有选库在读回后原子切换，不新增兼容分支 |
| 数据库资料 `#databases` | 保留目录→元信息/表/索引Dialog和保存字段锁/脏稿确认；补初次加载、失败显示与原位重试，避免把加载失败当空列表 |
| 能力目录 `#capabilities` | 保留总览/Git核对/诊断/MCP/CLI分面；补MCP草稿/保存中关闭/去重和弹窗内错误，CLI二进制草稿刷新/切Tab保留及操作保存锁 |
| 任务看板 `#board` | 保留列表→任务详情/原型/执行审阅；补普通创建跨入口离开、原型选择/在途请求保护、详情内部失败提示、交付草稿保护及候选状态归属 |
| SQL `#sql` | 保留确定性分析、证据/重试/结果和显式模型增强边界，不把HTTP成功视为业务成功；无新增流程或自动执行 |
| Builder A `#builder-alpha` | 保留设计/版本/历史和发布恢复日志；修正跨版本/交付重试残留错误；存储构造SSR安全但实际不可用时仍拒绝，禁止内存假保存 |
| Builder B `#builder-beta` | 实例独立，按同样场景检查；复用同一Builder修复，不合并两个实例或修改设计数据语义 |

共享问题：KeepAlive管理页面中的Teleport弹窗曾在离开后继续遮挡其他页面；公共Dialog/ConfirmBox在停用时隐藏、恢复时保留同一子树草稿并重新聚焦。无新增平行组件或共享包。保留已有响应式结构；图片复查实际发现CLI卡片390px操作文字逐字竖排，已局部调整为标题/状态首行、操作下一行换行，并通过按钮尺寸断言。本轮针对状态、草稿和动作，不进行风格重设计。

## 验证与证据索引

最终集成：**177文件1089项前端测试通过**；类型、架构/边界/循环、受影响源码与测试fmt/lint、Web生产构建通过。构建仍有既有大chunk警告。受影响Vue文件整体stylelint仍失败，基线和变更均308项，按文件/规则/消息归一行号后无新增，见[对照](stylelint-comparison.json)；未放宽规则或改动无关样式来掩盖历史债。

| 浏览器证据 | 核对范围 |
|---|---|
| [Before全入口](before/inventory.json) / [After全入口](after/inventory.json) | 17入口×1440/390；两阶段各34组，无pageerror/横向溢出，截图在同级目录 |
| [规则Before](rules/before/results.json) / [After](rules/after/results.json) | JSON草稿、保存/选择/读回竞态、试算归属；受控GET/PUT延迟 |
| [设置/能力](settings/results.json) | 16组基线/变更×两视口；目录/离开保护、MCP失败、CLI草稿/窄屏、连接保存中字段锁与已保存后读失败；34张截图 |
| [管理页](managers/result.json) / [知识恢复](managers/knowledge-recovery-result.json) | 数据库失败重试、知识草稿、专家初始化/保存；追加12组初次失败及已接受创建/录入后读失败对照，重试只GET |
| [看板](workspaces/results.json) / [聊天](workspaces/chat-results.json) | 两阶段×两视口：弹窗内错误、原型/交付/导航确认、取消保留输入、临时草稿恢复。选择器回焦Chromium基线已正常，未冒充新浏览器缺陷 |
| [任务列表多实例](task-list-instances/results.json) | 合法双列表保存版本预览；基线焦点/ARIA串实例，变更后定位当前列表。无生成/发布/模型调用，不关闭历史PB-01生成候选关口 |

精确命令（`vp`为本机Vite+1.6.0；浏览器通过既有`playwright-runtime.mjs`加载全局安装）：

```sh
vp -C frontend test run
vp -C frontend run typecheck
vp -C frontend run check:architecture
vp -C frontend/apps/web build
# 对git diff及未跟踪的前端ts/vue/mjs路径逐项执行，不改变全仓忽略配置
vp -C frontend fmt <changed-paths>
vp -C frontend lint <changed-paths>
vp -C frontend exec stylelint <changed-vue-paths> # 基线/变更均308，详见说明
EAP_BATCH_PHASE=before node frontend/apps/web/__tests__/browser/frontend-batch-live.mjs
EAP_BATCH_PHASE=after node frontend/apps/web/__tests__/browser/frontend-batch-live.mjs
# 同目录：rule-manager-interactions.mjs、settings-batch-live.mjs、manager-interactions-batch.mjs、
# knowledge-recovery-batch.mjs、frontend-batch-workspaces.mjs、frontend-batch-chat.mjs、task-list-instance-batch.mjs
```

原始终端结果：[测试](tests.log)、[类型](typecheck.log)、[架构](architecture.log)、[构建](build.log)、[受影响格式/lint](quality.log)。所有写入/故障场景使用明确的HTTP拦截，无真实后端写入；Before的成功表示确认了旧行为/缺陷，不表示旧行为已符合新要求。

基线服务来自独立只读代码工作树，精确`938ab68`，端口5187；变更服务5186。二者都连接本票独立Mock53200。不得把新画的模拟页面称为Before。HTTP夹具仅故障/数据模拟，不替换生产前端组件。

## 保留边界

完整辅助技术矩阵、多浏览器、原生系统缩放、用户产品接受及真实供应商仍独立。历史PB-01生成候选源码整链及技术ACCEPT缺口不能由当前公共UI回归自动关闭。后端Windows Junction平台测试不在前端任务内，不绕过其门控或削弱断言。没有全库重写，也不承诺穷尽未来一切前端问题。
