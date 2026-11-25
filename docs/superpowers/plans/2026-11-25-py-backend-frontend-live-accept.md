# py-backend 前端 live accept 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在非 mock Vue 控制台对运行中的 py-backend 完成 shell boot + 真模型 Chat SSE 一轮验收，并回写 thin-mvp 验收状态。

**Architecture:** 不新增第二条后端。沿用 `frontend/apps/web` 默认代理 `/api`、`/sidebar` → `127.0.0.1:8080`，以及 `@eap/runtime-client` 既有合同。本计划以实机观测为主；仅当 boot/Chat 路径出现 404 或非法形状时，才在 py-backend（或违规客户端）做最小修复并补定向测试。

**Tech Stack:** FastAPI py-backend、Vue Vite+、`@eap/runtime-client`、浏览器验收、pytest。

**Spec:** [`docs/superpowers/specs/2026-11-25-py-backend-frontend-live-accept-design.md`](../specs/2026-11-25-py-backend-frontend-live-accept-design.md)

## Global Constraints

- 一条生产路径：非 mock 前端 → py-backend；禁止为本切片启用离线假流或 Java Chat 双跑。
- 真模型：`toolMode=none`；凭证来自 UI 连接或 `py-backend/.env` 的 `EAP_MODEL_*`；`not_configured` 时不得伪装就绪。
- 只修阻挡 boot（六键）或 Chat SSE 的合同缺口；board / SQL / edit / regenerate / MCP 协议仍延期。
- 证据可记会话 id、执行状态、UI 状态文案；禁止把 API Key 或完整模型原文写入仓库。
- 提交：仅在用户明确要求时 `git commit`；计划中的 Commit 步骤在未授权时跳过并口头报告。
- 验证命令在 Windows PowerShell 下用 `;` 连接，不用 `&&`。

---

## 文件地图

| 文件 | 职责 |
|---|---|
| `frontend/apps/web/vite.config.ts` | 默认代理目标 `127.0.0.1:8080`（只读确认，非 mock） |
| `frontend/packages/runtime-client/src/index.ts` | `health` / catalogs / `aiStatus` / SSE Chat 客户端 |
| `py-backend/app/main.py` | 宿主装配与 `/api/health` |
| `py-backend/app/api/catalog.py` | shell boot 目录路由 |
| `py-backend/app/api/conversations.py` | `/ai/status`、开会话、SSE messages、graph |
| `py-backend/app/services/chat_service.py` | 状态、会话、真模型流 |
| `py-backend/app/persistence/connections.py` | 连接存储 + `EAP_MODEL_*` 回退 |
| `docs/decisions/py-backend-thin-mvp.md` | 将 live accept 标为 verified |
| `py-backend/README.md` | 对齐验收表述 |
| `docs/superpowers/specs/2026-11-25-py-backend-frontend-live-accept-design.md` | 状态改为已接受 |
| `py-backend/tests/*.py` | 仅在出现非琐碎修复时增补 |

---

### Task 1: 预检进程与模型凭证

**Files:**
- Read: `py-backend/.env`（存在性；勿把密钥写入任何输出）
- Read: `py-backend/.eap/config/model-connections.json`（若存在；确认有启用连接且 `secret` 非空，勿打印 secret）
- Read: `frontend/apps/web/vite.config.ts`
- Touch: 无，除非进程未起需要启动命令

**Interfaces:**
- Consumes: 无
- Produces: 确认 `8080` 健康、前端非 mock、`GET /api/ai/status` 的 `state` 不是 `not_configured`

- [ ] **Step 1: 检查 py-backend 健康**

Run:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8080/api/health
```

Expected: `status` 为 `ok`，且含 `service`=`py-backend`。

若失败：在 `py-backend` 启动：

```powershell
cd j:\Code\Engineering-Automation-Platform\py-backend
.\.venv\Scripts\python.exe main.py
```

再重复本步。

- [ ] **Step 2: 确认前端为非 mock 开发服务**

检查 `C:\Users\LH\.cursor\projects\j-Code-Engineering-Automation-Platform\terminals\` 中前端终端：命令应为 `vp`/`vpr` `dev`，**不得**含 `--mode mock`。

若未运行：

```powershell
cd j:\Code\Engineering-Automation-Platform\frontend
vp run -C apps/web dev
```

（仓库惯用若为 `vpr`/`vp` 根脚本，与当前终端一致即可；关键是不要 mock。）

Expected: Vite 在 `127.0.0.1:5173`（或既有端口）就绪，代理目标为 `8080`。

- [ ] **Step 3: 确认模型凭证可用（不打印密钥）**

Run:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8080/api/ai/status
```

Expected: `state` 为 `configured_unverified` 或 `error` 以外、且不是 `not_configured`；`model` 非空；`workspacePath` 非空。

若 `state`=`not_configured`：**停止本计划后续 Chat 任务**，请操作者在 UI「模型设置」写入连接，或在 `py-backend/.env` 设置 `EAP_MODEL_API_KEY` / `EAP_MODEL_BASE_URL` / `EAP_MODEL_DEFAULT` 后重启宿主，再重跑本 Step。不得改代码伪装就绪。

- [ ] **Step 4: 将设计文档状态标为已接受**

Modify `docs/superpowers/specs/2026-11-25-py-backend-frontend-live-accept-design.md` 头部：

```markdown
**状态：** 已接受
```

- [ ] **Step 5: Commit（仅当用户明确要求）**

```powershell
git add docs/superpowers/specs/2026-11-25-py-backend-frontend-live-accept-design.md
git commit -m "$(cat <<'EOF'
docs: accept py-backend frontend live-accept design

EOF
)"
```

（Windows 若无 HEREDOC，用用户规则允许的等价多行 `-m`；未授权则跳过。）

---

### Task 2: Shell boot 浏览器验收（修 blockers）

**Files:**
- Modify only if needed: `py-backend/app/api/catalog.py`, `py-backend/app/catalog/service.py`, `py-backend/app/main.py`, 以及对应 `py-backend/tests/test_catalog_turn.py`
- Browser: `http://127.0.0.1:5173/`（或前端实际端口）

**Interfaces:**
- Consumes: Task 1 的健康宿主与非 mock 前端
- Produces: 六键 boot 无错误的实机证据（笔记：时间、端口、UI「已连接」或等价）

六键对应 `App.vue` `refresh()`：`health`、`capabilities`、`databases`、`experts`、`tasks`、`stats`。

- [ ] **Step 1: 用 curl/IRM 先打通代理与直连对照**

Run（直连后端）:

```powershell
@(
  '/api/health',
  '/api/capabilities',
  '/api/databases',
  '/api/experts',
  '/api/tasks',
  '/api/stats'
) | ForEach-Object {
  $r = Invoke-WebRequest -Uri ("http://127.0.0.1:8080" + $_) -UseBasicParsing
  "$_ -> $($r.StatusCode)"
}
```

Expected: 六条均为 `200`。

若前端端口已知（例 `5173`），再对同源代理抽查：

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:5173/api/health -UseBasicParsing | Select-Object StatusCode
```

Expected: `200`。

- [ ] **Step 2: 浏览器打开控制台并刷新**

使用 cursor-ide-browser：打开前端 URL → 等待壳加载 → 触发刷新（若有刷新按钮则点；否则依赖首屏 `refresh`）。

Expected: 运行时状态为已连接；六键无错误横幅。用 `browser_snapshot` / 网络观察记下证据。

- [ ] **Step 3: 若出现 404 或形状错误 — 先写失败测试**

仅当 Step 1/2 失败且失败发生在六键之一。示例（按真实失败路由改名与断言）：

在 `py-backend/tests/test_catalog_turn.py` 增加：

```python
def test_shell_boot_stats_shape(client: TestClient) -> None:
    body = client.get("/api/stats").json()
    assert "model" in body
    assert body["model"]["share"] is None or isinstance(body["model"]["share"], (int, float))
```

Run:

```powershell
cd j:\Code\Engineering-Automation-Platform\py-backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_catalog_turn.py::test_shell_boot_stats_shape -v
```

Expected: 先 FAIL（若行为已正确则不要硬造失败；改为断言当前合同并跳到 Step 5）。

- [ ] **Step 4: 最小修复使测试与实机通过**

只改失败路由的返回形状或缺失注册；不引入 MCP/board。再跑定向 pytest 与 Step 1。

- [ ] **Step 5: 记录 shell boot 证据**

在实现对话中写明：六键均 200、UI 已连接、时间戳。不要把响应全文（若含敏感）入库。

- [ ] **Step 6: Commit（仅当用户明确要求）**

若有代码修复：

```powershell
git add py-backend docs/superpowers
git commit -m "$(cat <<'EOF'
fix(py-backend): close shell boot blockers for live accept

EOF
)"
```

---

### Task 3: Chat SSE 真模型验收（修 blockers）

**Files:**
- Modify only if needed: `py-backend/app/api/conversations.py`, `py-backend/app/services/chat_service.py`, `py-backend/app/services/sse.py`, `py-backend/app/services/llm_openai.py`, 以及 `py-backend/tests/test_open_send_graph.py`（或新建定向测试；真模型调用不要写进默认 CI 单测）
- Browser: Chat 工作面

**Interfaces:**
- Consumes: Task 1 `ai/status` 非 `not_configured`；Task 2 shell 已通
- Produces: 一轮真模型 SSE 完成证据（conversation id、execution 终态、可见助手正文；无密钥）

- [ ] **Step 1: API 级开会话**

Run:

```powershell
$conv = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8080/api/ai/conversations -ContentType 'application/json' -Body '{}'
$conv.id
```

Expected: 返回含非空 `id` 的会话对象。记下 `id`（下文称 `CONV_ID`）。

- [ ] **Step 2: API 级发送一轮 SSE（真模型）**

Run（PowerShell 消费 SSE；勿把 Authorization/密钥打出）：

```powershell
$CONV_ID = '<paste-id>'
$body = '{"message":"请只回复：EAP_PY_BACKEND_LIVE_ACCEPT_OK","toolMode":"none"}'
$resp = Invoke-WebRequest -Method Post -Uri "http://127.0.0.1:8080/api/ai/conversations/$CONV_ID/messages" -ContentType 'application/json' -Body $body -TimeoutSec 120
$resp.StatusCode
$resp.Content.Substring(0, [Math]::Min(800, $resp.Content.Length))
```

Expected: HTTP 200；正文为 SSE 事件流；出现最终答案事件（含助手文本）。若供应商鉴权失败：记「模型腿失败」，**不要**改成 offline_reply；可停并报告。

- [ ] **Step 3: 读 graph 确认助手节点**

Run:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/api/ai/conversations/$CONV_ID/graph"
```

Expected: `path`（或合同中的等价字段）含 user 与 assistant 节点；assistant 文本非空。

- [ ] **Step 4: 浏览器走同一路径**

打开 Chat → 新会话（或刷新已开会话）→ 发送短消息（可用同一验收标记句）→ 等待流式完成。

Expected: 发送按钮在配置就绪时可点；流式结束后可见助手回复；无因 Chat 启动路由 404 卡住。

- [ ] **Step 5: 若 Chat 路径 blocker — 测试后修复**

规则：默认 CI 测试继续用 `offline_reply` fixture，**不要**在 pytest 里打真模型。

对合同缺口（例：缺字段导致前端拒收），在 `py-backend/tests/` 用 TestClient + `offline_reply` 复现形状，再修实现。

示例断言最终 SSE envelope（按现有 `test_sse_contract.py` / `test_open_send_graph.py` 风格扩展，勿复制密钥）：

```python
def test_send_completes_with_final_answer(client: TestClient) -> None:
    opened = client.post("/api/ai/conversations").json()
    with client.stream(
        "POST",
        f"/api/ai/conversations/{opened['id']}/messages",
        json={"message": "ping", "toolMode": "none"},
    ) as response:
        assert response.status_code == 200
        text = "".join(response.iter_text())
    assert "offline-mvp-reply" in text or "answer" in text
```

Run:

```powershell
cd j:\Code\Engineering-Automation-Platform\py-backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_open_send_graph.py -v
```

Expected: PASS。然后再重跑 Step 2–4 的真模型/浏览器路径。

- [ ] **Step 6: 记录 Chat 证据**

记下：`CONV_ID`、执行终态（如 `SUCCEEDED`）、浏览器可见验收标记或摘要。禁止粘贴完整模型长文与密钥。

- [ ] **Step 7: Commit（仅当用户明确要求）**

```powershell
git add py-backend
git commit -m "$(cat <<'EOF'
fix(py-backend): close chat SSE blockers for live accept

EOF
)"
```

---

### Task 4: 回写决策与回归

**Files:**
- Modify: `docs/decisions/py-backend-thin-mvp.md`
- Modify: `py-backend/README.md`
- Test: `py-backend` 全量 pytest

**Interfaces:**
- Consumes: Task 2–3 的通过证据（或明确的失败边界说明）
- Produces: 文档中 live accept = verified（或诚实的部分失败说明）

- [ ] **Step 1: 更新 thin-mvp 验收句**

在 `docs/decisions/py-backend-thin-mvp.md` 的 Acceptance 中，将类似：

```markdown
- Frontend live accept against this port remains **unverified** until explicitly wired.
```

替换为（按实际结果改日期与边界；若模型腿失败则不得写 verified）：

```markdown
- Frontend live accept（2026-11-25）：非 mock Vue → `127.0.0.1:8080`；shell boot 六键通过；Chat `toolMode=none` 真模型一轮 SSE 通过。不覆盖 MCP 协议、edit/regenerate、board/SQL。
```

- [ ] **Step 2: 对齐 README**

在 `py-backend/README.md` 合同小节，将仍写 unverified 的 live wiring 句改为与 Step 1 一致的中文/英文简述。

- [ ] **Step 3: 全量回归**

Run:

```powershell
cd j:\Code\Engineering-Automation-Platform\py-backend
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: 全部 passed（当前基线 35；若本计划新增测试则计数上浮）。不得为变绿削弱断言。

- [ ] **Step 4: 交付报告**

在对话中输出：

- passed / failed / skipped / **unverified** 分项（shell、Chat、pytest、文档）
- 若有延期域碰到的 404，列 follow-up 一句，不扩 scope

- [ ] **Step 5: Commit（仅当用户明确要求）**

```powershell
git add docs/decisions/py-backend-thin-mvp.md py-backend/README.md py-backend
git commit -m "$(cat <<'EOF'
docs(py-backend): mark frontend live accept verified

EOF
)"
```

---

## Spec coverage（自检）

| Spec 要求 | 对应任务 |
|---|---|
| 非 mock → py-backend | Task 1 |
| shell 六键无错 | Task 2 |
| Chat 真模型 SSE 一轮 | Task 3 |
| 不伪装 `not_configured` | Task 1 Step 3；Task 3 禁止 offline |
| 只修 blockers | Task 2–3 条件分支 |
| 更新 thin-mvp + README | Task 4 |
| pytest 保持绿 | Task 4 Step 3 |
| 不提交密钥 | Global Constraints |

## Placeholder scan

无 TBD/TODO；Commit 步骤受用户授权约束已写明。
