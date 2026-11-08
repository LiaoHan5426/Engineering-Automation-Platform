# SQL Agent 浏览器视觉回归

`expert-agent-visual.mjs` 使用本机已有 Playwright Core/Chromium，打开真实 Vite 应用及 Monaco。先读取真实后端页面，再拦截 Agent API 为明确标注“模拟”的审批夹具；所有未声明的修改请求被阻断。不会调用真实模型或修改候选文件，不代表真实模型生成/落盘整链验收。

在 `frontend` 目录、前后端服务已运行时执行（路径换成当前机器已安装位置，不自动安装软件）：

```powershell
$env:EAP_PLAYWRIGHT_MODULE='E:/ai/Hermes/hermes-agent/node_modules/playwright-core'
$env:EAP_CHROMIUM='C:/Users/admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
node apps/web/__tests__/browser/expert-agent-visual.mjs
```

可通过 `EAP_VISUAL_URL` 替换默认 `http://127.0.0.1:5173`，`EAP_VISUAL_OUTPUT` 指定截图目录。默认输出 `artifacts/agent`，含截图及 `result.json`。该脚本单独运行，不伪装成 happy-dom 测试。

2026-11-08 实测通过：1440/900/640/390px 宽度、390×360px 低高度确认框、浅色/深色；真实 Monaco Diff；长路径/摘要不撑破面板；确认框默认焦点/Tab 陷阱/Escape 返回焦点；批准、拒绝、过期、UNKNOWN、审批失败、取消、提交费用确认及离页返回。8组检查、5次受控模拟修改、0个 pageerror。截图已人工查看；未覆盖原生桌面缩放、多浏览器或真实供应商。

修复：专家列表错误空态、首次加载误报不可用、侧栏下布局未按容器宽度切换、任务卡片与时间排版、窄屏长路径和共享 ConfirmBox 溢出、Monaco 文本模型先于 Diff 解绑销毁。失败过程保留在模块组合决定的视觉验收接续记录。

## 原生系统缩放验收

设置以下变量后运行同一脚本：

```powershell
$env:EAP_VISUAL_NATIVE='true'
$env:EAP_VISUAL_OUTPUT='apps/web/__tests__/browser/artifacts/agent-native-100'
node apps/web/__tests__/browser/expert-agent-visual.mjs
```

原生模式启动有界面 Chromium 并最大化，`viewport:null`，不设置 deviceScaleFactor、不修改页面缩放、不执行窄视口模拟。当前 Windows DPI 通过只读 GetDpiForSystem 查询为96（100%），1920×1080主屏；真实浏览器DPR=1、inner=1920×945、outer=1920×1032、visualScale=1。2026-11-08该档位5组回归通过、5次模拟修改、0个pageerror，证据在`artifacts/agent-native-100`。其他档位必须先实际切换Windows缩放后重跑并另存结果；当前桌面控制通道不可用，125%/150%等未验，不能用模拟DPR代替。

## 真实供应商历史阻塞（2026-11-08，已由下方接续解除）

当前唯一默认连接GPT API / gpt-6.1-sol使用Responses。一次真实无工具请求成功，5.45秒返回`EAP_PROVIDER_ACCEPTANCE_OK`，见`artifacts/agent-provider/connectivity.json`。这仅证明本次鉴权/文本响应，不证明工具支持。

随后从真实浏览器创建最小SQL专家并提交`SELECT 1 AS acceptance_value;`，目标仅为本测试目录下`artifacts/agent-provider/provider-candidate.sql`。持久运行`bb290185-d953-4625-8242-d45d608d9158`返回`AGENT_MODEL_TOOLS_UNSUPPORTED`，模型调用0、无候选、目标文件不存在。根因是EAP现有SQL Agent显式拒绝非chat-completions协议，而当前Responses适配器仅支持文本。连接协议和默认模型未改变。待决定补齐Responses工具协议，或提供已配置的chat-completions连接后，才继续供应商生成→审批→写入→读回整链。

本次创建的专家`sql-agent-0c1a7b33-f6da-4417-a422-d6e4124f4250`已停用，保留任务审计与失败证据。真实生成/写入整链尚未完成；没有把文本请求或模拟审批计为成功。

## Responses真实整链接续（2026-11-08）

已按用户授权补齐普通API Responses函数工具。真实任务`791dedff-f3c3-4002-afed-8d798c9750c4`沿用原连接和gpt-6.1-sol，2次模型调用完成EXPLAIN取证与SQL候选生成；真实页面审阅/确认后写入`artifacts/agent-provider/provider-candidate.sql`。审批前文件不存在，独立读回与候选一致；相同审批重复请求及IDEA完整重启后均不重写，modelCalls仍2、attempts1。SQL未执行；代理测试审批不等于用户最终接受。验收专家已重新停用，服务保持运行。

`artifacts/agent-provider/responses-result.json`记录脱敏结果、SHA256和不重放断言，`responses-awaiting-approval.json`/`responses-applied.json`保留业务快照；三张`responses-*-native-100.png`记录实际审批/应用/重启页面，未拦截或模拟API，0pageerror。原生100%仍是本轮唯一实际系统缩放。真实页面发现并修复写入后残留等待审批摘要；11项组件回归、typecheck/architecture/build通过。完整范围、失败与修复历史见[模块组合记录](../../../../../docs/decisions/backend-module-composition.md#responses-tools-acceptance)。
