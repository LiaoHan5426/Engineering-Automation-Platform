# DSH Personal — Vue 迁移工作区（未完成草稿）

本目录与 `frontend/` 同级，位于 `dsh-personal` 分支。目前仅完成固定源码清单和跨模块契约审计，**没有可运行的 Vue 应用，React → Vue 迁移尚未实现**。本草稿不能作为可用前端、P0 通过或功能验收证据。

目标：使用 Vite+ CLI 构建原生 Vue 3 前端；本阶段不适配 EAP Java 后端。现有 `frontend/`、`backend/` 保持原状。DSH 的既有 Host/Boot/插件协议与 EAP 后端适配是两个不同工作范围。

- [源码契约审计及替换边界](./contract-audit.md)
- [阶段计划及完成跟踪](./migration-plan.md)
- [固定版本清单](./source-inventory.json)

## 固定源版本

[deepseek-ai/deepseek-harness @ 39163dd30f703a79079e2d2446545cff3c453738](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738)。没有使用本机正在运行的 DSH 安装目录作为迁移输入，也没有改动该安装。

2026-11-15 通过 GitHub API 获取完整 Git tree（`truncated=false`），复核：74 个客户端包、客户端 src 内 1,236 个 TS/TSX 文件，其中 373 个 TSX；全仓库各 src 下 469 个 TSX。它们是文件统计，不能推导功能覆盖率或迁移完成率。

复核源清单的只读入口：

```sh
gh api 'repos/deepseek-ai/deepseek-harness/git/trees/39163dd30f703a79079e2d2446545cff3c453738?recursive=1'
gh api 'repos/deepseek-ai/deepseek-harness/contents/packages/client/ui-slots/src/renderer.ts?ref=39163dd30f703a79079e2d2446545cff3c453738' -H 'Accept: application/vnd.github.raw+json'
```

尚未安装目标依赖、运行原版基线、建立 Vite+ 项目、编译或执行浏览器验证。当前没有 Before/After 应用截图；未来 UI 变更必须在相同场景和视口捕获固定基线与目标版本，才能交付为 ready。不能用占位页或 React 包装器代替真实迁移。
