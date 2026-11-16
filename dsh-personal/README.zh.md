# DSH Personal — Vue 迁移工作区

[English](README.md) | 中文

本目录与 `frontend/` 同级，位于 `dsh-personal` 分支。它导入固定版本的 DSH，使用 Vite+ CLI 将 P0～P4 完整应用迁移至原生 Vue 3。**迁移仍是未完成草稿。** 原生 renderer 和多个产品模块已通过定向检查；最终聚合检查、浏览器回归与匹配的 Before/After 证据尚未完成。

本阶段不适配 EAP Java 后端，现有 EAP `frontend/` 与 `backend/` 保持原状。既有 DSH Host/Boot/插件合同继续作为运行权威；此次 UI 迁移不增加第二套 store 或 React facade。已授权的迁移范围包括实验 UI 和桌面欢迎入口。

- [契约审计及实施决定](contract-audit.md)
- [阶段计划、完成跟踪及剩余门禁](migration-plan.md)
- [固定源清单](source-inventory.json)
- 原版上游说明：[英文](README.upstream.md)、[中文](README.upstream.zh.md)

## 固定源版本

[deepseek-ai/deepseek-harness @ 39163dd30f703a79079e2d2446545cff3c453738](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738)。本机已安装的 DSH 既不是迁移输入，也不是部署目标。

2026-11-15 的初始完整 GitHub tree 审计发现 74 个客户端包、客户端 src 内 1,236 个 TS/TSX 文件，其中 373 个 TSX；全仓库各 src 下共有 469 个 TSX。这些是历史清单数量，不能推导迁移完成百分比。

<a id="run"></a>

## 运行

<a id="run-from-source"></a>

### 从源码运行

目标使用 Vite+ 1.3.0、Vue/compiler 3.5.45 和 vue-tsc 3.3.14，并提交锁文件。在本目录使用 Vite+ CLI 安装并执行仓库命令：

```sh
vp install --frozen-lockfile
vp run build
vp run start:web
```

原版基线已通过完整构建，并由真实 Host 在 Chromium 中运行。目标已通过全部八项产物构建门禁、Host 和 Client 两侧聚合检查、真实 Host/SFC 生命周期闭环和多批模块回归。**交付仍未完成**：最终运行问题修复、产物刷新和浏览器回归仍待验证。定向通过不代表完整功能或用户接受；当前证据与限制见阶段跟踪。

应用 React 导入与直接依赖已随消费者一起清理。既有 Vue/VitePress 文档工具链仍通过 DocSearch 间接引入 React，出现在工作区安装依赖图中。已验证的 Web、桌面欢迎 bundle 输入和编译客户端注册不含 React runtime；浏览器行为仍需单独验收。不能声称整个工作区依赖图没有 React。

## 许可证

导入源码保留其 [MIT 许可证](LICENSE)。依赖声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
