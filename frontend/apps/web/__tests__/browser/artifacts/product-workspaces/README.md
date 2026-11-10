# 全站工作面、独立 Mock 与请求客户端验证

2026-11-11，用户目标4～8。最终结果见 [result.json](result.json) 和 [validation.json](validation.json)。真实 Chromium 在 1440×1000 和 390×844 下走查16个入口，共32份截图；8组页面交互验证全部通过，页面异常及 i18n 缺键警告均为0。

## 逐页处理

| 入口 | 处理或保留依据 | 默认状态证据 |
|---|---|---|
| chat | 保留会话/摘要/变更/源文件工作面，删除模式分支与失效模拟提示；正常请求使用统一传输 | [桌面](chat-1440.png) / [窄屏](chat-390.png) |
| scenes | 保留列表→详情→工作流；删除前端模拟保存断连操作与模式说明 | [桌面](scenes-1440.png) / [窄屏](scenes-390.png) |
| expert-catalog | 保留角色卡片与筛选；角色是指导文本，移除demo版本/演示标签 | [桌面](expert-catalog-1440.png) / [窄屏](expert-catalog-390.png) |
| experts | 已有独立专家概览/编辑/任务子页，保留；实际打开编辑器验证 | [桌面](experts-1440.png) / [窄屏](experts-390.png) |
| model-settings | 已有连接/模型管理弹窗，保留；实际打开连接编辑器 | [桌面](model-settings-1440.png) / [窄屏](model-settings-390.png) |
| appearance | 已有主题/布局分组及预览，保留 | [桌面](appearance-1440.png) / [窄屏](appearance-390.png) |
| skills | 版本列表，导入及全文独立弹窗，格式限制按需查看；文件选择不触发发布 | [桌面](skills-1440.png) / [窄屏](skills-390.png) |
| plugins | 启停/运行状态卡片；依赖和运行观测按需进入详情 | [桌面](plugins-1440.png) / [窄屏](plugins-390.png) |
| rules | 默认只列规则包；选择后进入摘要列表/单条弹窗，试算/词表分面 | [桌面](rules-1440.png) / [窄屏](rules-390.png) |
| knowledge | 保留知识库导航/文档列表；创建、改名、录入、阅读弹窗 | [桌面](knowledge-1440.png) / [窄屏](knowledge-390.png) |
| databases | 资料列表；编辑弹窗中按基本信息/表结构/索引分面 | [桌面](databases-1440.png) / [窄屏](databases-390.png) |
| capabilities | 可用性总览；数据/绑定诊断弹窗与Git检查独立页；CLI/MCP登记弹窗 | [桌面](capabilities-1440.png) / [窄屏](capabilities-390.png) |
| board | 已有列与任务详情弹窗、Run/验证/交付分面，保留 | [桌面](board-1440.png) / [窄屏](board-390.png) |
| sql | 已有任务列表/分析工作面及输入详情分组；清理默认开发备注 | [桌面](sql-1440.png) / [窄屏](sql-390.png) |
| builder-alpha | 保留设计/版本分面与响应式资源/属性面板，等待GrapesJS真正挂载后取证 | [桌面](builder-alpha-1440.png) / [窄屏](builder-alpha-390.png) |
| builder-beta | 同一设计器合同的独立实例，逐页加载验证 | [桌面](builder-beta-1440.png) / [窄屏](builder-beta-390.png) |

## 真实交互

1. **规则**：列表进入包详情→读取单条规则→真实SQL试算→词表→复制完整22条规则→编辑/关闭→取消放弃→真正放弃恢复→保存及HTTP读回→删除。
2. **数据库资料**：弹窗创建→表/字段编辑→保存→改名后放弃真正恢复→关闭脏草稿并取消放弃→删除及HTTP读回。
3. **知识库**：创建→录入文档→独立阅读→取消未保存文档并保留→明确放弃→删除及HTTP读回。
4. **能力**：总览不加载完整诊断DOM→打开存储/绑定诊断→Git检查页→CLI/MCP表单打开与关闭；保留原执行/UNKNOWN合同。
5. **插件**：默认不出现观测表单→打开详情并显式查询真实Task/Run状态→关闭→确认停用看板→重新启用。
6. **模型/专家**：模型新增连接弹窗打开与关闭，专家进入实际编辑子页。未保存凭据、未调用模型。
7. **独立Mock**：真实HTTP/SSE服务驱动同一技能页面，选择本地文件→预览→可信来源确认→保存→全文读回→显式启用。仅此项使用模拟后端，不声称Java/数据库持久化。
8. **窄屏**：单条规则弹窗保持视口内，Tab焦点留在弹窗，Esc关闭；数据库Esc触发未保存确认、取消后保留原值；技能关闭/重开保留草稿。

真实写入仅为本脚本生成的规则包、资料、知识库，按精确ID删除；最终三类目录无本轮QA残留。测试使用自有独立full `:52025` 和独立Mock `:53200`；未停止IDE管理的 `:8080`。本轮浏览器Vite与Chromium均由脚本清理。

代表交互截图：[单条规则](rule-detail.png)、[试算](rule-trial.png)、[资料编辑](database-editor.png)、[文档阅读](knowledge-document.png)、[能力诊断](capability-diagnostics.png)、[Git检查](git-checks.png)、[插件观测](plugin-runtime.png)、[窄屏规则](rule-dialog-390.png)、[窄屏未保存确认](database-unsaved-390.png)、[窄屏技能导入](skill-import-390.png)。

## 命令与边界

```powershell
rtk proxy pnpm --dir frontend test run --reporter=json --outputFile=../backend/target/frontend-product-consolidation/final-tests-current.json
rtk proxy pnpm --dir frontend typecheck
rtk proxy pnpm --dir frontend build
rtk proxy pnpm --dir frontend check:architecture
rtk proxy pnpm --dir frontend dev:mock-server
```

从 `frontend` 运行浏览器脚本：

```powershell
rtk proxy node apps/web/__tests__/browser/product-workspaces-live.mjs
```

可用 `EAP_PLAYWRIGHT_MODULE`、`EAP_CHROMIUM`、`EAP_LIVE_API`、`EAP_MOCK_API` 指定本地工具/测试服务。浏览器脚本测试配置拥有独立Vite缓存，避免同时打开两个代理服务时争用缓存目录。`--interactions --only=<名称片段>` 为失败定向复核，单独写partial结果，不覆盖最终全量结果。

前端最终149文件921项通过，0失败/跳过。首轮全量发现9项过期夹具/文案断言，已迁移；其中7个浅层SSR页面存在性用例整文件删除，实际默认状态和CRUD由上述真实浏览器覆盖。另删除旧演示/模式相关5个文件及部分无效分支用例，共6个测试文件删除。授权、UNKNOWN、取消、去重、恢复和迟到响应保护保留。测试网络守卫拒绝非测试自有端口；其拒绝开发端口的测试可以输出预期 `EAP_TEST_NETWORK_BLOCKED`，没有接通开发服务。

typecheck/build/architecture、受影响文件格式/lint与新增样式stylelint均通过。构建保留既有大chunk提示，没有放宽限额；102个产物JS未检出旧Mock开关、故障参数或专用完成状态。未宣称全仓历史stylelint/所有系统缩放和辅助技术矩阵通过。

执行中修复了ref对象布尔判断导致复制错误、资料放弃只清脏标记、父子重复刷新重置确认框、Vite缓存争用和格式化后多语句模板处理器解析错误。当前处理器采用有名函数；保留首次失败日志于 `backend/target/frontend-product-consolidation`，最终结果不沿用失败状态。

本轮没有Java/数据库结构变动，289个既有后端文件与本轮开始备份逐字节一致。旧后端及真实模型交付证据沿用，未重复外部模型调用。技术验证不能替代用户产品接受。
