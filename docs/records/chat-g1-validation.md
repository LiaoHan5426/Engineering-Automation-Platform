# CT-02 G1：聊天内连接配置与真实执行摘要

日期：2026-11-14。状态：**局部实现已技术验证；完整CT-02及DSH适配未完成，用户接受待确认。** 基线为`34fb18fbde034df4dfb7c8b07caa24c53a25e306`。本记录不把已完成的G1局部改动升级为完整交付。

## 实现与保留边界

- [TaskComposer](../../frontend/apps/web/src/features/chat/TaskComposer.vue)的模型设置动作在原聊天打开共享[连接编辑器](../../frontend/apps/web/src/components/ModelConnectionEditor.vue)，[设置页](../../frontend/apps/web/src/features/settings/ModelSettings.vue)复用同一编辑器；[模型目录编辑器](../../frontend/apps/web/src/components/ModelCatalogEditor.vue)从settings迁到应用共享组合层，删除原重复表单/旧路径。已搜索既有ConnectionDialog、Dialog、ConfirmBox、Input等原语，判定为L3业务组合，在[边界表](../decisions/frontend-ui-shared-module-boundaries.md)登记，无新增公共包或平行基础控件。
- 共享编辑器只执行原模型域API；连接/目录/发现的成功与读回分开，读回失败保留反馈且只重试GET，在途读回锁定子目录操作。已读回的目录完整传入现有会话目录，不再重复GET，也不自动选择草稿模型；旧读请求的迟到成功/失败不能覆盖新快照。
- 现有离开保护链从编辑器经TaskComposer、ChatWorkspace、PluginSlot到App，并保护侧栏的完整动作：普通关闭、路由/哈希变化、会话选择/新建、Work/Code切换及相关当前会话删除/归档均不绕过dirty/busy。放弃后只恢复原动作一次。保留原看板、模型设置、专家、插件和待写入保护。
- [摘要面板](../../frontend/apps/web/src/components/SessionPanel.vue)由ChatTurn经现有binding投影最近执行，替换五个固定假步骤。未收到执行身份、真实状态、本地历史、UNKNOWN及取消中分开呈现；详情只显示已有执行/工具/错误记录。没有新增todo状态库、原生计划协议或执行器，执行成功不等于应用/验证/验收。

## 已执行验证

环境没有PATH中的vp或rtk，因此实际使用`/home/superagent/.local/share/vite-plus/1.6.0/bin/vp`（下文以`$EAP_VP`表示该绝对路径）；工作区Vite+按锁定依赖执行。只安装本工作树的既有前端依赖，包管理器产生的锁文件元数据差异已恢复，没有依赖变更。

组合定向回归：**15文件189项全部通过**，命令如下（从仓库根执行）：

```sh
$EAP_VP -C frontend test run \
  apps/web/__tests__/features/shell/SessionPanel.test.ts \
  apps/web/__tests__/features/chat/ChatWorkspace.answerState.test.ts \
  apps/web/__tests__/features/chat/chatSession.test.ts \
  apps/web/__tests__/features/settings/ModelSettings.test.ts \
  apps/web/__tests__/features/settings/ModelCatalogEditor.test.ts \
  apps/web/__tests__/features/chat/TaskComposer.test.ts \
  apps/web/__tests__/features/chat/TaskComposer.layout.test.ts \
  apps/web/__tests__/features/chat/TaskComposer.modelSetup.test.ts \
  apps/web/__tests__/features/DesktopNavigation.test.ts \
  apps/web/__tests__/features/DesktopNavigation.return.test.ts \
  apps/web/__tests__/features/WorkspaceLeave.test.ts \
  apps/web/__tests__/features/plugins/PluginSlot.lifecycle.test.ts \
  apps/web/__tests__/features/chat/ChatWorkspace.leaveGuard.test.ts \
  apps/web/__tests__/features/chat/ChatWorkspace.toolbar.test.ts \
  apps/web/__tests__/features/expert/ExpertNavigation.test.ts
$EAP_VP -C frontend run typecheck
$EAP_VP -C frontend run check:architecture
$EAP_VP -C frontend/apps/web build
```

类型、架构（含边界/循环）、Web生产构建全部通过。构建保留既有大chunk提示，未扩大忽略项。23份受影响前端文件的`vp fmt --check`通过，`vp lint`初轮只有两处浏览器输出console警告，改用stdout后对应两脚本复检零警告/错误，其余21份零错误；`git diff --check`通过。

实际浏览器：使用项目[Playwright加载器](../../frontend/apps/web/__tests__/browser/playwright-runtime.mjs)，显式指定该用户Vite+管理的Playwright及Chromium。在隔离开发URL`http://127.0.0.1:5197`验证；浏览器缺失的三项共享库下载并解包到`/tmp/eap-browser-libs`，仅通过该浏览器进程的LD_LIBRARY_PATH引用，未改系统库。

```sh
node frontend/apps/web/__tests__/browser/chat-execution-summary-live.mjs after
node frontend/apps/web/__tests__/browser/chat-model-context-live.mjs after
```

两个脚本在1440×1000和390×1000均通过。详情及匹配Before/After见[执行摘要](../evidence/chat-execution-summary/README.md)与[聊天内连接设置](../evidence/chat-model-context/README.md)：历史执行/新草稿隔离、无pageerror；表单保持#chat和草稿，Escape保留/放弃、失败反馈留在弹窗、失败后键盘焦点恢复、关闭回到模型选择器；哈希离开时保留原路由并确认，取消保持编辑、放弃后进入全局管理，返回来源恢复原草稿。所有HTTP均为明确夹具/拒绝写入，不调用真实服务。

独立源码复核发现并修复了上下文离开保护缺失、目录读回错误未接管、父读回期间子控件仍可写、二次GET造成目录陈旧等问题；真实浏览器发现并修复了提交按钮禁用后焦点落到BODY而使Escape失效。未删除或削弱业务断言、网络保护或架构规则换取通过。

## 未执行与剩余范围

后端未修改，未运行Java/数据库回归；未调用真实供应商、MCP、DSH SDK或安装插件；状态词表/错误目录未变。模型真实目录/调用质量、用户接受、全站交互重做、原生todo、消息图/分支、多模态与MCP、DSH原生插件宿主均不能据此记为完成。`eventProjector`未接入生产发送路径的事实已在相关决策中纠正，本切片不声称在线事件去重/断线回放/跨重启接管。

后续原生计划、DSH执行目标和消息图需要明确领域归属及协调合同，详见[后续前置](../decisions/chat-context-plugins-and-progress.md#5-g1实现边界与后续架构前置)。
