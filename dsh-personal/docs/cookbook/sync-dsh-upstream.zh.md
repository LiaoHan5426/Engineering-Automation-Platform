# 上游同步维护指南

[English](sync-dsh-upstream.md) | 中文

## 摘要

本指南面向维护者，用于更新导入的 DSH 源码并保留原生 Vue 实现。操作对象是仓库副本，不是本机安装的 DSH 应用。[迁移计划](../../migration-plan.md)负责记录完成状态；指南编写完成不代表已成功升级。

## 目录

- [准备](#prepare)
- [比较](#compare)
- [集成](#integrate)
- [验证与恢复](#validate)
- [记录模板](#record)

<a id="prepare"></a>

## 1. 准备隔离升级环境

在 EAP 根目录使用 Bash 执行以下预检。首次同步使用原始清单的基线；已有完整接受记录时，将 BASE_COMMIT 替换为该记录的提交。先解析远端 HEAD，不假定默认分支叫 main。

```sh
set -eu
UPSTREAM_URL=https://github.com/deepseek-ai/deepseek-harness.git
git status --short --branch
git rev-parse HEAD
git ls-remote --symref "$UPSTREAM_URL" HEAD
BASE_COMMIT=$(node -p "JSON.parse(require('node:fs').readFileSync('dsh-personal/source-inventory.json','utf8')).sourceCommit")
TARGET_COMMIT=$(git ls-remote "$UPSTREAM_URL" HEAD | cut -f1)
test "${#TARGET_COMMIT}" -eq 40
if [ "$BASE_COMMIT" = "$TARGET_COMMIT" ]; then
  printf "NO_UPSTREAM_CHANGE %s\n" "$TARGET_COMMIT"
else
  printf "UPDATE_AVAILABLE %s -> %s\n" "$BASE_COMMIT" "$TARGET_COMMIT"
fi
```

远端查询失败或空结果须停止，不能解释为没有更新。NO_UPSTREAM_CHANGE 表示 B 与 U 相同：保存查询输出和当前 Personal 状态，记录为 no-change；不创建候选、不重新安装依赖或重跑产品构建，也不推进基线。此结果只验证版本发现流程，不证明冲突解决或 Vue 行为移植已经演练。UPDATE_AVAILABLE 才继续下列隔离步骤。

读取[固定源清单](../../source-inventory.json)、[契约审计](../../contract-audit.md)和[迁移计划](../../migration-plan.md)。保留原始清单及其 blob ID 作为历史证据。后续已接受的上游版本写入带日期的升级记录，并从计划链接；不覆盖原始清单来暗示新版本是最初迁移输入。

采用三份输入：B 为最近一次完整接受的上游提交，U 为本次目标上游提交，P 为当前 Personal 检查点。首次同步完成前，B 取清单中的 sourceCommit。部分集成的候选版本不推进 B；逐项记录已应用和暂缓的变化。

在 EAP 仓库根目录检查 git status、分支、HEAD 和远端。保留已有修改，在隔离工作树内集成。origin 属于 EAP；目录导入不代表与 DSH 共享 Git 祖先，不在 EAP 分支直接执行无条件的上游 merge 或 rebase。

准备包含 B 与 U 的独立上游检出，并保留 P 的源码与产物检查点。运行验证前备份测试 profile 和持久数据；使用隔离数据，不使用已安装应用的数据。同步维护包含读取上游和准备隔离候选；提交、推送、发布和部署单独确认。工作树只包含已提交状态，脏目录须另存二进制 diff 及未跟踪源码，并在候选中核对后恢复；不要把 HEAD 当成完整的 P。

<a id="compare"></a>

## 2. 比较上游变化与本地改造

在 Bash 中将 UPSTREAM_DIR 指向该检出，将 BASE_COMMIT/TARGET_COMMIT 设置为已核实的完整提交。以下是未来升级使用的参数化命令，不代表本次已演练升级。

```sh
git -C "$UPSTREAM_DIR" rev-parse --verify "${BASE_COMMIT}^{commit}"
git -C "$UPSTREAM_DIR" rev-parse --verify "${TARGET_COMMIT}^{commit}"
git -C "$UPSTREAM_DIR" diff --name-status --find-renames "$BASE_COMMIT" "$TARGET_COMMIT"
git -C "$UPSTREAM_DIR" diff --stat "$BASE_COMMIT" "$TARGET_COMMIT"
git -C "$UPSTREAM_DIR" diff "$BASE_COMMIT" "$TARGET_COMMIT" -- packages/core packages/api packages/client apps scripts
```

完整 name-status 报告决定覆盖范围；最后一条命令仅辅助查看常见目录。其他变更路径、锁文件、vendor 源码和持久化变化也要纳入。另以源码比较 B 与 P，排除 lib、dist、node_modules 等生成目录。显式记录重命名与删除。

| 变化类别 | 集成规则 |
| --- | --- |
| 未改造的 Host/核心逻辑 | 检查消费者和测试后应用上游变化；仅凭目录归属不足以判断未改造。 |
| 本地改造的共享逻辑 | 对照 B/U/P，协调行为与生命周期要求。 |
| React 组件/hook/渲染 | 将行为移植至对应 Vue 组件、selector、scope 或 slot；不恢复已替换的 React 运行时。 |
| 构建、依赖及平台表 | 保留 Vite+ 入口与共享 Vue 身份；协调 manifest 后再生成锁文件。 |
| Session 格式、schema 与网络 API | 审查迁移要求，更新所有消费者及适用的持久化变更确认。 |
| 新增/删除/重命名模块 | 明确产品范围、归属和替换关系；一起检查注册、导入、测试及文档。 |

<a id="integrate"></a>

## 3. 按行为集成

按下方模板为受影响模块建立映射行，并在工作树中核实当前路径；契约审计解释迁移决定，但不是完整文件映射。先处理共享 Host/API 变化，再处理 Vue 消费者；构建与配置变化随其消费者一起处理。文本合并无冲突不代表行为等价。

保留同步业务状态变化、取消、过期结果保护、作用域释放、焦点、草稿和会话隔离。上游测试依赖 React 内部机制时，调整测试装配并保留用户可见断言。暂缓上游变化须记录原因；存在暂缓的适用变化时，候选仍为部分集成状态。

<a id="validate"></a>

## 4. 验证、接受或恢复

协调依赖后，在候选 dsh-personal 目录运行命令。[测试规范](../testing.zh.md)负责测试选择。先运行定向行为及正负类型检查，再按顺序构建产物和执行聚合检查。

```sh
vp install --frozen-lockfile
vp run build:artifacts
vp run build:check
vp run test:docs
vp run doc-sync
vp run lint
git diff --check
```

通过受支持的 dsh profile 入口启动候选，使用独立 Host 和数据。验证受影响的真实浏览器流程、桌面与窄屏、插件卸载/重载、草稿保留和取消。审计应用产物是否重新引入 React 运行时；文档工具间接依赖单独判断。在 B 与 P 上对照相同失败用例，区分现有迁移失败与新增回归。

记录精确命令、源码版本、环境、结果和证据位置，分别标记通过、失败、跳过与未验证。所有适用上游变化均已处理且约定验收通过后，才推进 B，并更新计划、链接已接受记录。原有迁移验收仍独立跟踪。

失败时停止候选 Host，保留日志和差异。继续使用已接受版本，或恢复已保存的源码/产物检查点。先停止写入者，再从匹配的升级前备份恢复数据；不假定旧代码能读取新 Session 格式或数据库 schema。避免对共享工作树执行破坏性重置。

<a id="record"></a>

## 参考：升级记录模板

每次实际升级在迁移证据旁保存带日期的记录，并从计划链接。以下模板不代表已有成功升级记录。

```text
Date / owner:
Status: no-change | proposed | partial | validated | accepted | rolled-back
Original inventory: source-inventory.json (unchanged)
B / U / P: full upstream commits / Personal checkpoint
Upstream checkout / candidate worktree / isolated data:
Backup and recovery checkpoint:
Upstream path | Personal path | local change reason | action | evidence
Applied / deferred / not-applicable changes and reasons:
Commands / source revision / environment / evidence paths:
Passed / failed / skipped / unverified:
Pre-existing migration failures / new regressions:
Acceptance decision / accepted upstream commit / rollback result:
```

## 开发说明

本指南定义维护流程，不是自动同步工具；本页未选择目标上游提交。实际升级、构建和运行结果由带日期记录承载；文档检查不代表产品验收。
