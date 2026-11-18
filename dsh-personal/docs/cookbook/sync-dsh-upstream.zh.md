# 操作手册：将 DSH Personal 与上游同步

[English](sync-dsh-upstream.md) | 中文

## 概述

本贡献者教程为仓库副本准备上游更新，并保留原生 Vue 行为。开始前需已有 Personal 检出目录、已安装的工作区工具及独立上游 Git 检出目录。产出是可评审的候选与证据；[迁移计划](../../migration-plan.md)维护验收状态。已安装的 DSH 应用属于独立部署。

## 目录

- [准备](#prepare)
- [比较](#compare)
- [集成](#integrate)
- [验证与验收](#validate)
- [记录模板](#record)

<a id="prepare"></a>

## 1. 固定三个输入

先确定升级轨道：发布升级使用明确的起止标签；跟随 master 使用固定的默认分支提交。版本标签与“将发布分支同步回 master”的合并提交可能具有不同文件树，不能互换。发布任务使用 `--mode release --release-base TAG_B --release-target TAG_U` 校验发布范围；master 任务使用 `--mode master`。报告出现 `scope-mismatch` 时先处理范围偏差，不将额外 master 变化计为发布升级必需工作。远程 HEAD 发现操作选择 master 轨道，并不选择发布标签。

使用 B = 最近完整验收的上游提交、U = 拟升级上游提交、P = Personal 检查点。[状态文件](../../upstream-sync-state.json)维护已接受基线：schemaVersion 为 1，acceptedUpstreamCommit 为 B；acceptedPersonalCommit 与 acceptedRecord 标识验收证据，历史导入阶段保持 null。pending 中的 targetUpstreamCommit、personalBaseCommit 与 record 记录尚未验收的候选。待验收或部分集成的候选均不推进 B。

以下 Bash 命令均从 Personal 根目录执行。先检查状态并保存 P，再创建候选。EAP 的 origin 远程并非 DSH 上游远程；目录导入没有建立共享 Git 祖先。P 含未提交修改时，应保存二进制差异、暂存修改和未跟踪源码：仅从 HEAD 创建的 worktree 会遗漏这些内容。

```sh
set -eu
git status --short --branch
git rev-parse HEAD
pnpm exec tsx scripts/upstream-sync.ts --help
UPSTREAM_URL=https://github.com/deepseek-ai/deepseek-harness.git
pnpm exec tsx scripts/upstream-sync.ts --discover "$UPSTREAM_URL"
```

发现操作只执行一次 git ls-remote --symref，返回符号引用与完整提交。保存该次输出，并将 U 固定为返回的提交；不要再次查询 HEAD 填充其他字段。查询失败、空响应、远程 HEAD 游离或含糊均会停止操作。发现结果既不是无更新结论，也不是验收。已有 pending 目标必须与 U 一致；选取其他目标前应先处理当前候选。

准备独立且互不嵌套的上游检出目录，其根目录应包含 B 与 U 两个提交。在运行本地计划器前，显式补齐缺失对象。保留[原始清单](../../source-inventory.json)与 blob 标识；后续升级读取已接受状态，不重写历史输入。另行备份候选使用的配置与持久数据，并与已安装应用的数据隔离。

<a id="compare"></a>

## 2. 生成完整只读计划

将 UPSTREAM_DIR 设为上游检出根目录，将 TARGET_COMMIT 设为固定的 U 完整哈希。状态路径相对命令工作目录解析，且必须已存在于 Personal 内。计划器校验完整提交对象及 B 是 U 的祖先，然后输出包含 B/U/P、commitCount、summary 与全部差异条目的 JSON。它只读取状态与 Git；没有 merge、安装、源码更新或验收写入操作。

```sh
UPSTREAM_DIR=/path/to/upstream-checkout
TARGET_COMMIT=FULL_UPSTREAM_COMMIT
pnpm exec tsx scripts/upstream-sync.ts --personal . --upstream "$UPSTREAM_DIR" --target "$TARGET_COMMIT" --state upstream-sync-state.json
```

需要留档时，将 stdout 保存到按日期命名的证据文件。仅首次导入时，可将 --state upstream-sync-state.json 替换为 --initial，读取 source-inventory.sourceCommit；也可显式传入 --baseline FULL_ACCEPTED_COMMIT。三种输入必须且只能选一种；状态缺失或格式错误不会回退到清单。已检入的 pending 条目记录待验收目标，acceptedPersonalCommit 与 acceptedRecord 仍为 null。

no-change 表示 B 等于 U：保存发现结果与 Personal 证据，随后跳过候选创建、安装和产品构建。update-available 表示提交不同，即使文件树相同也成立。底层比较对完整 B/U 区间执行 git diff --name-status -z --find-renames，未添加路径过滤；重命名应统计前后两个路径。最多返回 300 个文件的 API compare 响应、打印节选或丢失重命名关系的路径列表均不代表完整比较。

计划器禁用隐式 lazy fetch。对象缺失、非法 UTF-8、输出截断、基线非祖先、Git 失败、单命令超过 30 秒或输出超过 64 MiB 均会中止计划。修复检出目录或记录失败后再重试；失败的比较不应解释成 no-change。

计划中的 `upgradeScope` 核对提交与发布标签的两端文件树，并分别报告提交数、文件数与行数。`incremental` 从 B/U 的工作区清单读取模块归属，给出直接变化、下游影响、依赖批次与验证建议；不读取恰好检出的其他版本清单。运行时、optional 与 peer 依赖按被依赖方优先排列，循环依赖作为同批 SCC 处理，dev 依赖消费者另列为测试影响。

按批次先协调 API、类型与被依赖模块，再处理使用方；独立批次内可并行，调用方在依赖接口明确后开始。未进入 B/U 差异的 Personal 定制沿用已有实现与证据；版本清单变化不等同于该模块全部源码需要重新迁移。给重命名和删除项保留两端归属。

在昂贵构建前对计划涉及的夹具执行[平台预检](../../scripts/upstream-platform-preflight.ts)：

```sh
node --import tsx/esm scripts/upstream-platform-preflight.ts --root . --platform win32 --plan PLAN_JSON
```

预检区分磁盘路径、mention/clipboard 协议路径、JSON/ARIA 序列化字符串与 shell argv。输出的 `problem` 与 `review` 分别表示已确定问题和需核对项，不是测试通过证明。Bash 示例在 Bash 执行；PowerShell 不直接复用 Bash 的环境变量、引号与重定向。优先用 Node 及结构化 argv 执行可移植步骤，保留确有执行器语义的 shell 测试。

<a id="integrate"></a>

## 3. 在隔离候选中协调行为

从保存的 P 创建候选，包含已保存的本地修改，并分别保留 B/U/P 快照。格式差异占主要部分时，使用相同格式化器与选项生成 B/U/P 派生副本，再比较派生副本。原始 Git 输出、原始 blob 与原始快照均保持不变；认定仅格式变化时，应同时保留原始与规范化证据。不要为了方便比较而重写实际历史检出目录或清单。

为每个变更条目建立映射行；在当前文件树确认路径，并使用[契约审计](../../contract-audit.md)理解本地决策。上游 TSX 路径可能映射到不同目录下的 Vue 组件、组合式函数、选择器或插槽。映射每次重命名的两端，并追踪每个删除项的替代或移除结果。同步闭环处理导入、注册、导出、测试、样式与文档；完整差异中的每个条目均应有已应用、延期或不适用结论及其证据。

| 变更类别 | 集成规则 |
| --- | --- |
| Host/core 与共享 API | 协调 B/U/P 及所有调用方；目录归属不能证明行为未变。 |
| React 组件与 hooks | 将行为迁移至映射的 Vue 职责位置，不恢复已替换的 React 运行时。 |
| 构建与依赖 | 使用 Vite+ Pack 和现有构建脚本，不恢复 tsdown 或独立 vitest 依赖；先协调清单，再更新锁文件。 |
| Session schema 与线协议 API | 同步更新调用方、迁移与必要的持久化确认。 |
| 新增、删除与重命名模块 | 对新旧路径闭环核对职责、引用、注册与替代证据。 |

[Vue 转换脚本](../../scripts/upstream-vue-codemod.ts)只处理已知 Ref 选择器在 setup 返回的 render 或 computed getter 中创建订阅的固定形态。默认 dry-run，显式列出 hook 和文件；`--apply` 另需该文件的 `--expect SHA256`，保留独占 .bak 原件，并在内容/哈希校验后写入。它不处理整份 React 文件、任意 hooks、插槽与事件语义；复杂闭包及 render 局部依赖报告 manual-review。先查看报告及对应差异，再应用受支持规则：

```sh
pnpm exec tsx scripts/upstream-vue-codemod.ts --hook useAccount --hook useConnectorAccounts --file SOURCE_FILE
```

先处理共享 Host/API 行为，再处理 Vue 调用方，随后结合调用方协调构建配置。保留同步状态变化、取消、过期结果保护、作用域释放、焦点、草稿与会话隔离。适配上游测试时使用 vite-plus/test 验证行为。文本合并或类型检查通过并不证明 Vue 交互等价；任何延期的适用变更都会使候选保持部分集成状态。

<a id="validate"></a>

## 4. 验证、验收或恢复

在候选 Personal 目录执行定向行为测试及正反类型检查。在冻结安装前有意协调锁文件，并按[测试规范](../testing.zh.md)选择补充检查。以下命令描述验收准备步骤；应记录实际结果，不预设通过。

```sh
pnpm install --frozen-lockfile
pnpm run build:artifacts
pnpm run build:check
pnpm run test:docs
pnpm run doc-sync
pnpm run lint
git diff --check
```

按变化及依赖影响选择验证；上面的构建命令用于产品候选，不表示每次脚本文档修改都要重建产品。

| 变化 | 必要检查 | 扩大范围的条件 |
| --- | --- | --- |
| Host/共享 API | 所属模块与直接消费者测试、类型、受影响快照 | 公共类型跨构建面或定向失败揭示更广影响 |
| Vue 组件/订阅 | 真实选择器适配器测试、响应更新与卸载释放、受影响浏览器路径 | 共享渲染或状态基础设施变化 |
| 构建/依赖/代码生成 | 对应脚本测试、最新官方产物构建及 build:check、原生 Node 产物加载 | 全局构建配置、工作区依赖或发布布局变化 |
| 测试/文档 | 对应测试、lint 或文档配对检查 | 被测执行路径也有变化 |

仅在 Playwright 版本变化或所需二进制缺失时安装匹配浏览器。浏览器验证先启动一个受影响用例，确认 [Web scaffold](../../apps/web/tests/scaffold.ts) 可用，再运行依赖影响范围内的用例。将 WEB_SPEC 与 WEB_CASE 设为本次受影响路径及用例后执行：

```sh
DSH_SNAPSHOT=replay pnpm run test:web:built "$WEB_SPEC" -t "$WEB_CASE"
```

全量 Web 回放用于明确要求的全仓验证、全局 Client 基础设施变化，或定向检查已证明的扩散问题；不作为每次升级的默认步骤。最新源码修改后，旧构建与旧浏览器结果只作历史证据，先重建再复验，避免同一问题多轮等待。

验收始终保持 replay 模式，不刷新快照。scaffold 启动错误应记为检查失败，不算平台跳过。

使用隔离配置与数据启动已构建候选。验证每条受影响 Vue 路径的浏览器或桌面行为，包括空态、错误态、取消、草稿与清理；保存源码版本与证据。分别列出通过、失败、跳过和未验证检查，并区分已有迁移失败与新增回归。仅静态检查或产品构建成功时，运行时验收仍保持开放。

全部适用变更完成协调且必要验收已记录后，才显式将 acceptedUpstreamCommit 推进至 U，将 acceptedPersonalCommit 设为验收时的 Personal 检查点，关联 acceptedRecord 并清空 pending。这是经评审的状态修改，不是计划器命令。同步更新迁移计划及验收行。在此之前保留 B 与 pending；部分集成或仅构建成功的候选不算已验收升级。真实包含此次升级的 Personal 提交尚不存在时，继续保留 pending。

恢复时还原已保存的候选源码、配置与数据检查点，或丢弃隔离候选。保留失败证据，已接受基线保持不变。任何恢复操作前先检查未提交修改，避免对共享工作区整体重置。提交、推送、发布与部署属于独立操作。

<a id="record"></a>

## 参考：升级记录模板

工作尚未完成时，由 pending 链接按日期命名的记录；仅验收后才由 acceptedRecord 关联。此模板不代表任何执行或验收结果。

```text
Date / owner:
Status: no-change | proposed | partial | validated | accepted | rolled-back
Original inventory and raw evidence (unchanged):
B / U / P and accepted baseline source:
Discovery output / complete diff JSON / commit and path counts:
Candidate checkout / profile / data / recovery checkpoint:
Derived B/U/P formatter and options / original snapshot locations:
Upstream old/new path | Personal path | local reason | disposition | evidence
Applied / deferred / not-applicable changes and reasons:
Commands / source revision / environment / evidence paths:
Passed / failed / skipped / unverified:
Pre-existing migration failures / new regressions:
Acceptance decision / state change / rollback result:
```

## 开发说明

只读[计划器](../../scripts/upstream-sync.ts)及其[测试](../../scripts/upstream-sync.spec.ts)维护发现与计划校验实现。本指南维护贡献者操作顺序，按日期命名的记录保存执行证据。待验收目标与文档检查成功均不代表 Personal 升级已验收。
