# 前后端模块边界与 CLI 实现

本次实现覆盖浏览器控制台、运行时 CLI 程序/操作管理，以及已有管理模块的后端分层。桌面外壳与 MCP 协议客户端仍按各自路线图推进。

## 前端工作区

| 包 | 职责 | 公开入口 |
|---|---|---|
| `@eap/web` | Vue 页面、交互与页面内状态 | 应用入口 |
| `@eap/runtime-client` | HTTP 客户端、请求/响应 TypeScript 类型 | `@eap/runtime-client` |
| `@eap/style` | 设计令牌、可切换主题（light/dark）与文档底座 | `@eap/style` / `@eap/style/index.css` |
| `@eap/ui` | 通用展示组件与组件样式（依赖 `@eap/style` 变量） | `@eap/ui` / `@eap/ui/styles.css` |
| `@eap/expert-sdk` | 专家清单编写与 id 校验（控制台保存前复用 `assertExpertId`） | `@eap/expert-sdk` |
| `@eap/tsconfig` | 工作区 TypeScript 基础配置 | `@eap/tsconfig/base.json` |

`@eap/web` 通过包名导入 `@eap/style`、`@eap/ui` 与 `@eap/runtime-client`，不再在页面内复制确认框或指标卡。`apps/web/src/style.css` 先导入 `@eap/style` 的 light/dark 主题与 `base.css`，再写控制台布局与功能区样式；组件视觉规则由 `@eap/ui/styles.css` 提供。

主题用法：加载主题 CSS 后调用 `applyTheme("light" | "dark")`（写入 `data-eap-theme`）。也可在子树上设置 `data-eap-theme`；无 Tailwind 的应用可直接用 `@eap/style/index.css`。

`@eap/ui` 按组件分目录：每个组件目录含 `.vue` 与同名样式；`src/styles.css` 仅汇总组件样式（不内嵌主题）；`src/index.ts` 再导出全部组件。类名统一 `eap-<block>` / `__` 元素 / `--` 修饰（如 `eap-button--primary`、`eap-confirm__dialog`）；`@eap/stylelint-config` 对 `packages/ui` 强制该 BEM 约定。

每个工作区目录都有 `package.json`；依赖写入包自身的 `dependencies` / `devDependencies`，本地包使用 `workspace:*`。页面从公开包名导入客户端，不使用跨包相对路径或其他包的 `src` 私有路径。TypeScript 项目引用用于类型构建，不替代包依赖声明。

`@eap/web` 的 `src` 按目录拆分，避免单目录堆平：

```text
apps/web/src
  App.vue / main.ts     壳层入口
  components/           应用内专用组件（流程图等；确认框已下沉到 @eap/ui）
  features/<area>/      能力、专家、知识库、数据库、规则等页面与局部逻辑
  lib/                  展示、脱敏、改写、工作流图、i18n 等共享工具
  tests/                跨页面契约测试（console / management / destructive）
```

工作区使用 Vite+；工具目录里的 `vite` 统一指向 `npm:@voidzero-dev/vite-plus-core` 别名。子包通过同一 catalog 声明构建依赖，避免独立 Vite 与 Vite+ 的命令分发冲突。

`pnpm run check:boundaries` 检查缺失清单、未声明的包依赖，以及越过包根目录的相对导入。构建工具和测试依赖同样在使用它们的包中声明，共享 Stylelint 配置通过 peer dependency 声明宿主的 `stylelint`。`pnpm run typecheck` 构建 Vue 与公共子包的类型，声明产物写入各包的 `node_modules/.types`。

## 后端层次

```text
com.lh.eap
  web.controller       HTTP 路由与状态码
  web.dto              API 请求对象
  application.service  管理校验、生命周期、任务与专家编排
  persistence.mapper   JDBC 查询、写入和持久化映射
  domain.model         能力、专家、CLI 程序/操作和节点结果
  domain.expert        专家图校验与排序
  runtime.handler      确定性能力执行与处理器查找
  runtime.sql          SQL 事实提取与快照解释
  runtime.mcp          单次执行中的 MCP 会话范围
  common               脱敏等共享基础功能
  config               Spring 装配与内置资源播种
```

原 `web` 包中的控制器、模型、服务、仓储和处理器已经按职责迁移。专家、知识库、数据库资料和规则包的管理控制器通过服务调用对应 mapper；事务放在管理服务上，HTTP 请求 DTO 独立于控制器。任务创建的规划、执行与保存移入 `TaskService`，并检查能力启用状态。

## CLI 使用与持久化

`eap.cli_program` 保存程序，`eap.cli_operation` 保存可被专家引用的固定参数操作。Git 预置一次程序登记，以及 `git-status`、`git-diff` 两个操作。用户直接选择预置操作；增加新操作时才打开表单。新程序可以先登记，再按需配置操作。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET / POST | `/api/cli-programs` | 列出或登记程序 |
| PUT / DELETE | `/api/cli-programs/{id}` | 覆盖二进制位置 / 删除手动程序 |
| POST | `/api/cli-programs/{id}/probe` | 对程序执行一次受限的 `--version` 探测 |
| POST / PUT / DELETE | `/api/cli-programs/{id}/operations/{capabilityId}` | 新增、编辑或删除固定参数操作 |
| PUT | `/api/capabilities/{name}/activation` | 单独启停某个操作 |

操作参数以 JSON 字符串数组提交，例如 `{"capabilityId":"git-log","title":"查看提交","args":["log","--oneline","-10"],"description":"查看最近十条提交"}`。数组边界在保存和执行时保持一致，参数不会经 shell 拼接。手动操作只记录脱敏 stdout、stderr 和退出码，不发布供规则判断的结构化事实，也不宣称操作必然只读。

手动操作被已启用专家引用时不能编辑或删除。删除手动程序会先检查其所有操作的引用；删除最后一个手动操作时同时移除所属手动程序。预置程序与预置操作不能删除。程序位置调整影响其下所有操作，登记、编辑和删除无需重启。

开发期迁移已合并为 `V1__initial_schema.sql`，直接写入 Git/ripgrep 程序及操作的预置登记。旧能力级覆盖值搬运语句已删除；旧能力级 CLI 接口仍保留，并转到所属程序配置。已有开发库需按确认范围重新初始化。

## 验证

```powershell
# 在仓库根目录执行后端回归
rtk mvn -f backend/pom.xml clean test

# 在 frontend 目录执行
rtk pnpm run check:boundaries
rtk pnpm run typecheck
rtk pnpm exec vp test
rtk pnpm exec vp build

# 在 frontend/apps/web 目录启动隔离的浏览器 QA 页面
rtk pnpm exec vp dev --config test/preview.config.ts
```

浏览器 QA 地址为 `http://127.0.0.1:5187/`，使用独立的内存 API 样本，适合确认 CLI 分组、新增操作、MCP 表单和响应式详情抽屉。它不执行真实命令、不持久化数据，不能替代 PostgreSQL/Flyway 集成验证。正常开发继续使用应用的默认 Vite 配置和实际后端地址。

`CliProgramIntegrationTest` 通过 `EAP_RUN_CLI_INTEGRATION=true` 显式开启，读取本机数据库连接配置并创建独立临时测试库。测试使用当前 V1 初始化并写入程序级覆盖值，再启动 Spring Boot，验证覆盖值保留、HTTP 登记、专家授权、真实 `java --version` 执行、引用保护与清理；不再测试已删除的 V9→V12 升级。结束后关闭应用并删除该临时测试库，不修改原业务库。`EAP_CHECK_SCHEMA=true` 开启现有库只读结构检查。

包名迁移后的首次构建需要 `clean`，以清掉旧包名对应的 `.class`；否则 Spring 可能同时扫描旧、新两份 Bean。
