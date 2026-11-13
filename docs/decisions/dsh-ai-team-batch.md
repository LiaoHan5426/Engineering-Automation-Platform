# dsh-ai-team 安装验证与首批任务

日期：2026-11-13。状态：原版包安装后激活失败，先停用，随后按用户指示卸载，管理器返回移除已应用。首批任务通过现有内建 subagent 执行，结果单独验收；插件适配任务已停止，未跑通其派发、审查合并或恢复流程。

## 安装与兼容边界

用户要求安装插件并跑通一批 2–3 个任务。插件管理器安装 `dsh-ai-team@1.7.0` 的包操作退出码为 0，但插件应用返回：

```text
autopilot (dsh-ai-team): failed to import: SyntaxError: The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'installSettingsSection'
```

当前 DSH 为 `0.2.2-rc.2`。[npm latest](https://registry.npmjs.org/dsh-ai-team/latest) 当时为 `1.7.0`；[同版本 settings 包](https://registry.npmjs.org/@deepseek-ai%2Fdsh-settings/0.2.2-rc.2) 已移除该导出。未添加空 shim、版本豁免或修改宿主。当时通过 `set_bundle enabled=false` 停用；其后用户明确要求卸载，`remove_bundle dsh-ai-team` 返回 changed=true、application=applied，包已移除。

静态核对还发现：设置页固定 namespace 与新版 Loader entry id 不一致；会话投影注册现在异步；旧 snapshot 事件失去 ignorable 契约；自动预置路径仍读取旧 session.events。旧 config_set 会持久化 runtimeConfig 并覆盖 profile 基线，迁移时需明确唯一权威和恢复策略。当前设置、浏览器客户端与投影持久恢复尚未动态验证。

插件初始化、合同状态更新和审查完成会自动创建提交或合并，部分配置还可能推送。[上游设计](https://github.com/yunqiangwu/dsh-ai-team) 与本仓库当前脏工作区、无显式提交/推送的约束需要专门适配。仅修导入错误并不代表首批流程可用。

[完整兼容调查](../../backend/target/dsh-ai-team-compat-20261113/PATCH-REPORT.md) 与同目录补丁草稿仅供审查，未应用、未形成可用分发包；其中静态推断和动态验证分别标注。宿主 asar 路径读取受限后，调查使用公开同版本包，未将其当作运行宿主的完整快照。

## 首批任务合同与当前结果

采用两个互不覆盖的任务；父 agent 独立审查差异与检查结果。并行执行由内建 subagent 提供，不能计入插件派发成功。

| 任务 | 独立业务结果 | 修改范围与验收 |
| --- | --- | --- |
| 源码脱敏误改根因 | 合法源码候选保持原文；敏感或含糊候选整体失败，不静默改写成坏代码 | SensitiveData、EngineeringChatService 及定向回归；验证合法 token 赋值/比较、JSON 转义凭据、非源码字段、原通用脱敏与候选红标准入 |
| 规划文档精简 | 消除 PB-01 重复长段与先后矛盾，保留唯一进度台账 | 主方案、规划台账、roadmap 与[切片索引](../records/design-delivery-index.md)；本地链接/锚点、UTF-8/LF、差异检查；历史失败与用户接受边界保留 |

两个内建任务已完成父复核；插件端到端未跑通，用户卸载指示已终止插件适配，后续批次继续使用内建任务能力。

- 源码任务：6文件，任务自身166行新增/7行删除。代码答案先严格检查解码JSON，仅 `files[*].content` 使用源码识别，合法答案原样返回；其他字段继续通用检测，敏感或无效答案整体失败。相邻源码快照入口同步采用同一判断，覆盖候选保存→明确应用→下一轮 prepare/inspectReferences 原文闭环；原日志脱敏和残片准入保留。仅豁免有终止符的局部 `token` 标识符引用，复杂或含糊表达式仍保守失败，不宣称通用语言解析。
- 父独立命令：`powershell.exe -NoProfile -File backend/target/dsh-ai-team-batch-20261113/run-review.ps1`。隔离副本离线编译与5组111项通过：SensitiveData 28、EngineeringChatService 33、CodeProposalBoundary 22、CodeGenerationBoundary 12、TaskDescriptionOptimizer 16，均0失败/错误/跳过；[脚本及日志](../../backend/target/dsh-ai-team-batch-20261113/run-review.ps1)可复核，同目录 `review-tests.log` 保留。子任务4组95项为同一范围的独立先验证据，不与111叠加计数。真实模型、数据库和运行中服务未在本批复验。
- 文档任务：主方案保留合同、planning-status保留进度权威、roadmap保留顺序；8切片的合同和证据导航汇入索引。3份原文删减4844字符，新增索引2166字符，净减2678字符；历史失败和技术/用户接受边界保留。
- 文档检查：`PYTHONUTF8=1 /h/developerTools/Python/python.exe backend/target/dsh-ai-team-batch-20261113/check-docs.py`，以及 `git diff --check`；最终统计见[批次验证记录](../records/validation-history.md#dsh-ai-team-first-batch)。

现有未提交修改保留；未执行主仓库提交、推送、日常数据库重置或常驻服务重启。兼容调查和草稿作为历史保留；插件未恢复安装，未继续适配或动态验证。若未来重新启动该工作，需先解决新版设置、投影恢复和受控Git生命周期；当前报告与草稿均不代替该验收。
