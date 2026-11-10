# SQL Agent 浏览器视觉回归

## PREBOUND 真实页面交付

`prebound-page-delivery-prepare.py` 与 `prebound-page-delivery-live.mjs` 使用已配置真实模型、正式 full-application、实际开发库和生产 App。它们会生成/应用一个明确目标文件并保存技术交付决定，不属于 mock 或普通无副作用测试。完整前置、数据身份、隔离边界及失败过程见[主题记录](../../../../../docs/records/delivery-history.md#prebound-page-delivery)。

前置：在仓库内 `backend/target/prebound-page-workspace` 建立隔离的本仓库工作树，纳入本批产品入口与独立验收测试作为本地验证基线；离线安装依赖，主工作区改动保留。真正 full jar绑定该工作树及授权根，使用原连接配置/开发库且已迁移V32；在 `backend/target/prebound-live/process.json` 记录 `{pid,base,workspace}`。不得使用测试Host、替身模型或对main做未经授权的提交。

从仓库根明确开启一次真实请求，准备工具将task/prototype/conversation/request身份及SSE结果持久保存至忽略的 `backend/target/prebound-live`；已有proposal时复用，不自动再次调用模型：

```powershell
$env:EAP_RUN_PREBOUND_REAL_MODEL='approved'
rtk proxy python -X utf8 frontend/apps/web/__tests__/browser/prebound-page-delivery-prepare.py
```

随后在frontend目录运行（EAP_PLAYWRIGHT_MODULE、EAP_CHROMIUM指向已有本机安装）：

```powershell
rtk proxy node apps/web/__tests__/browser/prebound-page-delivery-live.mjs
```

脚本自启Vite 5173代理上述正式服务，使用实际生产Chat确认应用、Board选择持久应用证据、提交交付及明确技术ACCEPT；复用持久APPLIED/Run/已完成独立检查，不为脚本定位修复重复模型、应用或typecheck/test/build。实际结果4组/0pageerror，后端模型1次；正式独立检查145文件/897项通过，类型/构建与源码前后快照通过。结果、真实模型候选、diff、JDBC回读及截图在 `artifacts/prebound-page-delivery`。

ACCEPT说明明确为自动化技术核验，不是用户产品接受。脚本最后关闭自有浏览器/Vite，保留正式隔离宿主与工作树供核对；不要将当前本机PID/端口当成永久配置。尚未覆盖多文件、复杂页面、源码UNKNOWN人工恢复或用户最终交互接受。

## 正式 full-application 当前契约与发布恢复

两份脚本均连接开发库及真正的 `com.lh.eap.EapApplication`，会留下明确的验证版本/任务记录。先打包并启动正式 full-application（8080、授权根为本仓库），确认应用库当前 V31 和健康检查；不使用 mock 模式或测试 Host。脚本自行启动生产 App 的 Vite 5173 代理，独立浏览器存储，结束关闭自有浏览器及 Vite，保留正式后端。

在 frontend 目录运行，EAP_PLAYWRIGHT_MODULE / EAP_CHROMIUM 指向已有本机安装（不自动下载）：

```powershell
rtk proxy node apps/web/__tests__/browser/full-current-contract-live.mjs
rtk proxy node apps/web/__tests__/browser/prototype-publication-recovery-live.mjs
```

`full-current-contract-live.mjs` 的保留结果是正式 V30 下5组：设计发布/交互预览、停用重建恢复草稿、场景依赖、真实 Git status/diff、确定性 SQL 专家。当前脚本使用 runtime-client 的 V31 发布身份并要求V31，已保留结果中的 schema=30记录当时实测版本，不能据它推断当前库。按本轮要求没有为新数字重跑这5组。

`prototype-publication-recovery-live.mjs` 的正式 V31 下3组结果覆盖：真实 POST 提交后丢响应、刷新无重发与显式查询；发送前中断与404后原内容/身份重试并保留新编辑；12并发同身份同版本及409/400拒绝、GET不写。首次已提交请求写入本主题 committed-checkpoint.json，脚本修正后复用并恢复该意图，不重复创建丢响应版本。失败过程单独保留。结果、数据库独立回读、截图及实际新请求在 `artifacts/full-current-contract/` 和 `artifacts/prototype-publication-recovery/`，原始旧数据全行备份留忽略的backend/target而不提交。

0pageerror/0外呼；截图已查看。网络异常由浏览器控制，数据库为真实正式服务提交，不代表物理数据库断连或真实模型源码交付、用户人工接受。当前合同、迁移与过程见[主题记录](../../../../../docs/records/architecture-history.md#publication-recovery)。

## Git 程序与持久调用首片

`tool-execution-visual.mjs` 使用真实 Chromium 与明确标记的 mock 服务，验证 Git 程序下的两个操作、共享版本探测、KeepAlive 返回、取消确认、刷新读回、1440/900/390px 视口和 UNKNOWN 阻塞。真实 Git/进程树/PostgreSQL 证据由后端测试独立提供。

先启动一个**新的 mock 服务进程**（例如仓库根执行 `rtk proxy pnpm --dir frontend dev:mock --port 5186 --strictPort`），再在 frontend 目录执行：

```powershell
rtk proxy node apps/web/__tests__/browser/tool-execution-visual.mjs --playwright <本机playwright-core路径> --chromium <本机chrome.exe路径> --url http://127.0.0.1:5186
```

脚本最终保留模拟 UNKNOWN，符合服务端互锁合同；重跑前需新建 mock 服务进程，不添加清除 UNKNOWN 的产品后门。截图及结果在 `artifacts/tool-execution/`。本轮 7 组通过、0 pageerror，截图已查看；不是原生系统缩放或用户接受。

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

## 复杂SQL与知识检索接续

2026-11-08基线c76cded后新增artifacts/agent-complex：cases.json、修复前后确定性响应、四次真实模型任务（含首次CTE超时）、知识本地权限/删除检查、NULL安全候选及截图。仓库根运行`python frontend/apps/web/__tests__/browser/sql_semantic_fixture.py`在只读候选限制下对合成内存SQLite独立验证CTE结果和4组反连接数据；不连接业务数据库，不证明PostgreSQL性能。

用户检查入口为5173专家定义页：“复杂SQL验收Agent”的partial/needs-input/applied/timed-out与来源/Diff。验收专家已停用，历史可读。实际125%/150%需用户切换Windows后继续，当前native pipe不可用；用户接受尚未收到。完整清单和失败记录见[接续](../../../../../docs/decisions/backend-module-composition.md#complex-sql-acceptance)。

## 原生125%（2026-11-08）

用户手动切换Windows125%后，原生脚本输出artifacts/agent-native-125。DPR1.25、1536×730视口、visualScale1；5组断言、5次模拟修改、0pageerror。确认框和深色Diff截图已查看。另以无mock浏览器读取三条真实partial/needs-input/applied任务，均无横向溢出，Monaco加载成功；结果见live-result.json。未调用模型或真实审批。125%技术验收通过，150%及用户体验接受仍待。

## 专家父子页面与配置分类（2026-11-08）

`expert-agent-visual.mjs`已迁到专家列表→概览→任务记录→任务详情→文件审阅，新默认输出`artifacts/expert-hierarchy`。8组检查通过，5次写请求全由夹具接管；无真实模型/文件写入。`artifacts/expert-hierarchy-native-125`保存实际125%下的列表、固定流程/Agent分类配置与真实终态任务；终态观察窗口无后续任务请求，详情位置/尺寸一致。未保存配置跨区域拦截、放弃恢复原值亦已检查。150%和用户接受待定。原`agent-native-*`目录保留为旧界面证据。详细合同见[专家界面分层](../../../../../docs/decisions/expert-workspace-navigation.md)。

任务详情侧面板接续：expert-agent-visual.mjs现含完整输入/执行记录/运行信息的Drawer焦点与关闭断言，共9组检查；原生125%及390视口的真实历史任务只读截图见artifacts/task-detail-inspector。引用摘录也通过实际页面打开/关闭检查；不代表新的模型调用或业务审批。


## 独立专家/原型编辑工作台（2026-11-08～09）

先在frontend执行`vp i`与`vpr dev`。使用本文件既有EAP_PLAYWRIGHT_MODULE/EAP_CHROMIUM环境变量：

```powershell
node apps/web/__tests__/browser/editor-workbench-visual.mjs
node apps/web/__tests__/browser/editor-display-visual.mjs
```

editor-workbench-visual为真实Chromium与GrapesJS，专家GET/保存仅fixture接管，其余写入默认拒绝；原型Schema/工程只保存到隔离浏览器localStorage。7组检查通过（2次模拟保存、0pageerror），涵盖节点添加/拖动/连线/循环拒绝/选择/删除、草稿退出保护、保存重开、Agent合同、Vue预览按钮状态、原型恢复、未知映射阻止、四档宽度/焦点及浅深主题。artifacts/editor-workbench保存截图与result.json。样式验收发现Drawer拉伸Tab，修复后新增高度<60px断言。

editor-display-visual只读真实内置SQL专家：当前原生DPR1、1920×945；Chromium --force-device-scale-factor=1.25/1.5分别1535×738/1276×597，visualScale1，无横溢。覆盖结果写入display子目录，明确不等于Windows系统125%/150%验收。早期原生125%截图保持历史身份；用户最终接受未由自动化替代。
