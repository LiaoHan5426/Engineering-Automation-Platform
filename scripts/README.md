# Scripts

Optional Python utilities belong here.

## Roles

1. **Repository maintenance** — fixtures, analysis, one-off helpers. These must not become the primary application runtime (Agent loop, model calls, or repository command host).
2. **Product installer / bootstrap (MVP)** — per [running-context.md](../docs/running-context.md), Python may package and guide local install of the UI and the **local Java service** (database init, ports, start/stop). That installer is ops packaging, not a substitute for Capability / ProcessExecutor or Spring AI.

### Local bootstrap (2026-10-28)

```bash
python scripts/eap_bootstrap.py
python scripts/eap_bootstrap.py --check
python scripts/eap_bootstrap.py --write-config
```

Writes `.eap/local-bootstrap.json` (gitignored) with tool paths and suggested start/health URLs.
Does **not** start Agent loops, store model API keys as a cloud vault, or invent multi-tenant deploy.

Do not commit a product `.venv` as a runtime dependency. Tool virtualenvs used by an installer stay local and gitignored unless a future slice explicitly decides otherwise.

### Related scaffolds

- GrapesJS page-editor scaffold: `frontend/apps/web` → `GrapesEditorScaffold` (Schema + optional grapesjs mount)
- Electron shell scaffold: `frontend/apps/desktop` (`window.eap` preload; not a signed installer)
# DeepSeek 只读连通性验证

`python scripts/check_deepseek_readonly.py` 使用本机后端和配置中的 `eap.deepseek-key`，通过现有模型连接/目录/聊天接口验证。仅发送固定的连通性文本，关闭工具，使用聊天目标与只读审批，不带仓库内容，不请求代码生成，也不调用候选应用。脚本只输出经过筛选的检查布尔值，不输出密钥或原始模型响应；测试连接完成后停用。调用前后比较仓库代码摘要，模型调用不得改变仓库代码。此脚本会创建一个已标明用途的本地测试连接记录。
