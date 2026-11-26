# EAP real Host gate (Slice C)

**Date:** 2026-11-26
**Scope:** py-backend sole authority — board list/detail + `changes.ops` contract pieces (Slice C3/C4).

## Gate matrix

| Item | Layer | Result | Evidence |
| --- | --- | --- | --- |
| `GET /api/board/tasks?projectId=` | API / pytest | **passed** | `py-backend/tests/test_board_tasks.py` |
| `GET /api/board/tasks/{id}?projectId=` | API / pytest | **passed** | `py-backend/tests/test_board_tasks.py` |
| `POST /api/board/tasks` create | API / pytest | **passed** | `py-backend/tests/test_board_tasks.py` |
| Board project isolation (404) | API / pytest | **passed** | `py-backend/tests/test_board_tasks.py` |
| Host `changes.ops` after write | Host bridge / pytest | **passed** | `py-backend/tests/test_host_bridge_fs_errors.py` |
| `changes.ops` session isolation | Host bridge / pytest | **passed** | `py-backend/tests/test_host_bridge_fs_errors.py` |
| `GET /api/plugins/contributions` enabled clients | API | **passed** (pytest elsewhere) | `test_plugin_host_l2.py`; entries include `enabled: true` |
| Composer board UI deep-link | browser | **unverified** | needs live Vite + py-backend board row; API identity **passed** |
| Cordis 本轮文件 / changes view | browser | **unverified** | Host `changes.ops` **passed**; UI projection needs better-sidebar live |
| Directory → preview / icons / Git tags / uninstall | browser | **unverified** | requires `dsh-better-sidebar@0.31.1` on Boot+Host with artifacts |
| Second plugin (different remotes) | browser | **unverified** | candidate: document-preview / settings plugin after better-sidebar |
| Fixture `__DSH_BOOT__` injection (verify app) | assembly | **passed** | `@eap/dsh-boot` tests + `dsh-boot-verify` |
| Production AppWebEntry cutover | code / browser | **unverified** | `DshBootHost` still uses the transitional client assembly; Boot fixture stays in the verification app |

## Gate decision for Slice D

Contract gates required for cutover (chat authority, plugin enablement API, fs/git Host, board list/detail, `changes.ops`, boot injection) are **passed** at API/pytest/assembly layers. Full better-sidebar visual browser replay remains **unverified** and must be completed against live `0.31.1` before claiming roadmap phase 0/1 interaction acceptance closed.

## Verification command

```bash
rtk proxy py-backend\.venv\Scripts\python.exe -m pytest py-backend/tests/test_board_tasks.py py-backend/tests/test_host_bridge_fs_errors.py -q
rtk proxy vp -C frontend test run packages/dsh-boot apps/web/__tests__/features/plugins/DshPluginHost.l2.test.ts
```

Record: 19 pytest passed (2026-11-26); 8 frontend tests passed (dsh-boot + L2 + overview).

## 分离 Host 的 Chromium 验收

`dsh-boot-verify --mode reference-react` 通过真实 dsh-personal AppWebEntry 启动，由参考 Host 提供会话与启动图。验证入口把 Better Sidebar 的 `/sidebar` 请求单独转发给 py-backend。两个 Host 使用隔离目录，参考会话绑定到 py-backend 授权的同一个临时 Git 仓库。

- **passed**　Better Sidebar 0.31.1 的文件导览可访问名称为「文件」。目录原地展开，点击实际文件新开标签并展示磁盘内容，关闭后回到展开的文件树。py-backend 的 `fs.trees`、`fs.read`、`changes.ops` 和编辑器资源请求返回 HTTP 200。
- **passed**　Git 标签显示临时仓库的修改文件和真实提交图，选择修改文件后调用 py-backend `git.diff` 展开差异文件后显示真实新增行。
- **failed**　`agent-opens` 和 `fs-watch` 尚未接入 py-backend WebSocket，握手返回 403。直接使用当前 dsh-personal 的插件 Host 也会返回 400，0.31.1 调用的旧 `connection.requestRejection` 在参考版本中已移除。
- **unverified**　EAP 自有启动图和会话 RPC、工作台至任务深链接联合回放、插件页内卸载、资源释放和正式入口切换。

### 侧栏 WebSocket

- **passed**　真实 Uvicorn + Chromium 在隔离本机 Host 上完成 `fs-watch` 和 `agent-opens` 握手。目录监听返回 DSH 确认帧，创建临时文件后返回目录失效通知。
- **passed**　后端集成测试覆盖越界订阅拒绝、目录变化和服务端打开意图按会话隔离。常规 Chat 的 toolMode 合同未暴露 `sidebar_open`，仅有服务端能力入口验证。
- **unverified**　通过真实 AppWebEntry 验证插件显示期间的自动刷新、Agent UI 打开意图、停用后的完整卸载和联合切换。

## EAP 自有启动图验证

在独立验证应用中运行 `vp dev --mode eap-artifacts`，将 `EAP_API_PROXY` 指向真实 py-backend。该模式读取 dsh-personal 构建产物及 base/web-app 包声明，由 EAP 注入启动图，直接从 py-backend 读取已启用插件。测试启动独立 SQLite 数据目录，未启动 Reference Host。

- Chromium 加载 75 个核心客户端条目并挂载 AppWebEntry。通过 py-backend 安装并启用 `dsh-better-sidebar@0.31.1` 后，条目数变为 76，插件脚本返回 HTTP 200，ModuleLoader 进入 live 模式，插件发起的 `/sidebar/api/settings.get` 返回 HTTP 200。
- `POST /api/session/create` 的协议测试验证了配置工作区目录下创建的 Session ID 对应同一 EAP 会话记录。工作区 ID 注册、显式会话 ID、Agent 预设尚未接入。
- Chromium 端到端验收仍有缺口。`/api/remote.mux` 返回 403，`session/modelCatalog` 等启动接口返回 404，浏览器没有进入可用会话。文件、Git 和真实 Agent 本轮文件须在该入口重新验收，正式入口切换及过渡宿主退役仍待完成。

## 工作区订阅与会话创建验证

- Chromium 通过 EAP 验证入口接通 py-backend 的 `/api/remote.mux`，接收 `workspace/follow` 初始状态，显示并选择配置的本地工作区。点击后观察到 `POST /api/session/create` 返回 HTTP 200。会话创建的结果与持久化由后端测试单独验证，浏览器尚未验证完整会话流程。
- 后端测试验证工作区订阅在创建会话后能发布包含该会话的更新，并验证模型目录的空配置响应。模型目录补齐后尚未重跑浏览器，其他 DSH 流仍待接入。

## Chromium 消息往返验证

EAP 独立启动入口连接真实 py-backend，模型输出使用本地固定回复。Chromium 选中配置工作区后，观察到 `session/create` 和 `session/prompt` 都返回成功，`session/follow` 按序收到提交的事件，且页面显示了与 EAP 会话图一致的助手回复。启用真实 `dsh-better-sidebar@0.31.1` 的运行同样到达回复页面，插件脚本、`settings.get` 和 `session.phase` 返回 HTTP 200。另一次重复运行在等待回复时超时。右侧栏功能验收和正式入口切换仍待完成。

## EAP 独立入口的真实插件交互验收

使用 Chromium、EAP 自有启动图和真实 py-backend。通过 py-backend 安装并启用 `dsh-better-sidebar@0.31.1`，工作区使用有一个提交和一处未暂存修改的隔离 Git 仓库。

- **passed**　通过会话入口打开右侧边栏，在「文件」中展开目录，点击真实文件并看到磁盘内容。树读取、文件读取和编辑器资源请求均返回 HTTP 200。
- **passed**　打开 Git，看到实际提交与未暂存文件。进入「差异」并展开文件后，页面显示磁盘修改对应的新增行。
- **unverified**　实际 Agent 产生的「本轮文件」、生产入口及过渡宿主退役。

## 本轮文件读取验收

Chromium 在 EAP 独立入口创建工作区会话，通过该入口的 `session/prompt` 提交文本。真实 py-backend 在组装本轮上下文时读取隔离工作区的 `AGENTS.md`，随后 Better Sidebar 0.31.1 的「Git → 本轮文件」显示该文件。模型输出使用离线回复。测试还覆盖文件读取事件仅归属执行该轮的会话。模型自主发起的文件工具调用和跨重启记录仍未验收。

## 插件停用与重新挂载

在 EAP 独立入口打开右侧栏，使用真实 py-backend 插件启停 API。Chromium 观察到启动图删除 Better Sidebar 后，「侧边对话」入口消失。重新启用时，启动图恢复插件，入口在同一页面重新出现。过程没有刷新页面，使用 DSH 的原生模块同步接口。验收覆盖可见贡献卸载和恢复，未独立断言所有后台资源都已释放。

## 实际启动图应用 EAP 账号覆盖层

EAP composer 在 dsh-personal 的 base 和 web-app 后应用仓库的账号覆盖层。独立入口的实际图不再包含官方账号设置与通知两个客户端包，Chromium 仍能打开真实 Better Sidebar。模型选择独立回归仍有缺口，本次浏览器曾停在「正在加载模型」。工作台与插件中心仍需在同一宿主入口完成验收。

## 构建产物预览验收

独立验证应用使用 `vp build --mode eap-artifacts` 产出客户端模块、版本化核心图和 Web 工件。随后使用 `EAP_API_PROXY=http://127.0.0.1:5280 vp preview --mode eap-artifacts --port 5282`，预览服务从构建目录读取核心图并合入 py-backend 当前启用的插件。Chromium 选择工作区，打开真实 Better Sidebar 的文件树并显示隔离仓库的文件内容。浏览器复用空白会话时提交已有 sessionId 的路径已接通，后端覆盖会话复用与列表不重复。正式部署入口和 EAP 产品入口联合验收仍待完成。

## py-backend 直接托管构建产物

配置 `EAP_DSH_WEB_DIST` 后，Chromium 直连真实 py-backend，在同源环境选择工作区并打开 Better Sidebar 的文件树，展开目录后成功显示隔离仓库文件。构建 HTML 包含核心启动图，页面从同源插件贡献接口取得当前启用项。此次无需运行 Vite 或 Reference Host。正式默认入口与 EAP 产品入口联合验收仍待完成。

## EAP 产品入口联合验收

在 py-backend 同源托管的构建产物中，Chromium 通过原生 DSH 左栏打开「工作台」与「插件中心」。插件中心显示真实安装的 Better Sidebar。新建隔离任务后直接打开 `#board?projectId=…&taskId=…`，任务标题渲染成功，并在刷新后仍由后端读取。当前深链接提供任务详情读取，完整任务板操作与正式默认入口切换仍待续。

## 同源入口联合回归

Chromium 在同一页面上下文使用 py-backend 托管的构建产物，打开工作台，在任务板创建并移动任务到「就绪」，确认插件中心显示 Better Sidebar。随后从同源入口打开工作区，使用浏览器编辑器提交纯文本并收到离线模型回复，再进入真实插件的文件树，展开目录并显示磁盘文件内容。该回归通过。任务执行及验收流转、设置弹窗期间的布局稳定性和正式入口切换未在该轮验证。

## 设置期间的右栏回归

Chromium 在 py-backend 托管的候选构建中打开真实 Better Sidebar 文件预览，再打开和关闭 EAP 设置。打开前后的收起按钮坐标差不超过 1 像素，关闭后原文件内容仍可见。该项通过。


## 同路径插件更新

2026-11-27，在启用真实 Better Sidebar 0.31.1 的候选宿主中重新安装同一版本。Chromium 无需刷新即请求新的工件 URL，响应为 HTTP 200，侧边对话入口仍可见。此项通过。验收使用隔离数据目录和本地插件包。


## 侧栏停用时的连接释放

2026-11-27，在候选宿主中用 Chromium 打开真实 Better Sidebar 的文件树与预览。停用插件前捕获 agent-opens 和 fs-watch 两条 WebSocket，停用后两条连接均关闭。通过正式停用 API 触发，随后恢复隔离环境中的插件启用状态。


## 文件标签验收

2026-11-27，在同源候选宿主运行真实 Better Sidebar 0.31.1。Chromium 断言展开目录时标签数不变，点击文件时增加一个预览标签并显示实际内容，关闭该标签后恢复原标签数和已展开的文件树。


## 显式源文件工具验收

2026-11-27，在同源 py-backend 中由 Chromium 创建会话，向该会话提交带 targetPath 的 code_sources 请求。Better Sidebar 的 changes.ops 返回匹配的 read 调用及结果，Git → 本轮文件显示隔离仓库实际文件 roadmap-read.ts，读取计数包括该文件与 AGENTS.md。模型输出为离线回复，本记录不代表模型自主选择文件工具。


## 真实模型自主源文件读取

2026-11-27，隔离 py-backend 从 .env 读取真实模型连接配置。Chromium 通过 DSH 编辑器发送文本请求，未向后端传入 targetPath 或 code_sources。真实模型回复写入会话，Better Sidebar 的「Git → 本轮文件」显示模型选择读取的 roadmap-read.ts。验收通过，记录未包含密钥。


## 工作台刷新与键盘导航

2026-11-27，Chromium 直连 py-backend，打开 #overview 并刷新，工作台继续显示。用 Enter 从左栏进入插件中心和任务板，分别确认已安装插件与任务板标题可见。验收通过。
