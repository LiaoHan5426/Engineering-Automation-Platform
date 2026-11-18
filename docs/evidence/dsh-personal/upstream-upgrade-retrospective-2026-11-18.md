# 2026-11-18 上游升级成本复盘与增量维护改进

本记录核对实际 Git 范围、执行成本和已实现的自动化；不以整段会话墙钟时间推算执行成本，模型调用中断不纳入成本。产品候选验收与本轮过程工具交付分别记录。

## 1. 首要成本来自升级范围扩大

[官方发布比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.3...dsh-v0.2.2-rc.4)与此前采用的发布分支同步回 master 的合并提交具有不同文件树。完整本地 Git 比较结果如下；差异条目与重命名前后路径分别计数。

| 范围 | 提交数 | 差异条目 | 行变化 |
| --- | ---: | ---: | --- |
| 官方 rc.3 → rc.4 标签 | 8 | 395 | +579 / -429 |
| 原候选采用的 master B → U | 807 | 3104（3149 个旧新路径） | +88070 / -31776 |

原候选差异条目约为标签范围的 7.86 倍，行变化总量约为 118.9 倍。这解释了大量客户端迁移、构建协调与浏览器排错为何超出一次小版本发布差异；这些倍数衡量代码范围，不代表时间节约比例。两端树均与相应标签不同，现有大候选保留为 master 候选，不作为仅标签升级的交付结果。

[发布范围报告](upstream-release-scope-2026-11-18.json)为 scope-match；[master 对照报告](upstream-master-scope-2026-11-18.json)为 scope-mismatch。报告完整保留 B/U 和发布区间，未替换接受基线。

标签范围由 380 个 package.json、3 个生产源码、4 个测试、6 个文档和 2 个快照组成，没有 React/Vue 客户端源码变化。生产行为是模型内容拒答时保留最终 usage 并抛出结构化错误，以及 liveshare worker 继承 ELECTRON_RUN_AS_NODE。依赖顺序为 llm/error → provider/translate → provider 测试与快照；liveshare 可独立处理。380 个清单变化涉及的包中，376 个包只有发布元数据变化，其余包同时含源码、测试或根目录变化。

## 2. 五项改进的实际落地

| 用户关注点 | 本轮实现 | 适用限制 |
| --- | --- | --- |
| 只处理实际增量 | 规划器固定 B/U，核对发布标签两端树，保留重命名/删除归属，列出 metadataOnlyPackages 与 executionChangedPackages | 差异外的 Personal 定制沿用已有实现；重叠项逐条评审 |
| 固定转换规则 | Vue AST 转换器将已确认 Ref selector 从 render/computed getter 提升到 setup，保留 live props 读取；默认 dry-run，apply 需逐文件原始 hash 并保存原件 | 31 个行为用例覆盖有限模式；React hooks/effects、复杂闭包、条件执行、slots/事件语义仍进入 manual-review，并未实现整份 React 自动转译 |
| 依赖优先与分级验证 | 从 B/U Git 清单建立 runtime/optional/peer 依赖图，SCC 同批、被依赖方先行，dev 测试消费者单列；纯元数据不作为执行种子 | 真实 llm 依赖影响闭包仍有 225 个包，19 批；依赖影响不等同于重迁移每个包的所有源码 |
| Windows 提前处理 | 有限预检区分磁盘路径、协议路径、JSON/ARIA 编码与 shell fixture；结构化 argv/Node 优先，Bash 测试保留其执行语义 | findings 是问题或评审线索，空报告不替代运行测试；只检查显式指定的增量文件 |
| 降低验证重复成本 | 双语指南取消默认全量 Web 回放，按 Host、Client、构建与文档变化选检查；源码变化后先构建再验证产物；匹配版本浏览器仅在缺失或升级时安装 | 产品候选完成前仍需最新官方 build:artifacts 与其后的 build:check；脚本文档交付使用对应定向检查 |

实现分别见[规划器](../../../dsh-personal/scripts/upstream-sync.ts)、[Vue 转换器](../../../dsh-personal/scripts/upstream-vue-codemod.ts)、[平台预检](../../../dsh-personal/scripts/upstream-platform-preflight.ts)与[双语操作指南](../../../dsh-personal/docs/cookbook/sync-dsh-upstream.zh.md)。工具只规划或显式转换，不推进接受状态。

## 3. 可核实的执行成本

| 执行 | 已记录耗时与结果 | 成本归属 |
| --- | --- | --- |
| 旧产物的大范围 Web replay | 112.8 分钟后停止，部分日志保留；并未完成 | master 大候选历史排查，既不覆盖后续 selector 修复，也不是标签升级必要成本 |
| 先前官方产物构建 | 86.11 秒，9/9 阶段通过 | 对其对应源码有效；后续源码修改仍需新构建 |
| 先前 Host aggregate | 344.16 秒，通过 | 对其对应源码有效；未变化范围沿用证据 |
| Windows reference 两个失败用例 | 修复后 18.64 秒，2 通过、5 筛选跳过 | 修复 JSON/ARIA 转义和协议分隔符，不修改产品 normalizer、golden 或超时 |
| 最新候选官方产物构建 | 76.57 秒，9/9 阶段通过；记录 397 个 Client 产物与 3 个公开值 | 覆盖五处 selector 修复后的实际产物 |
| 最新候选官方聚合检查 | 首轮 Host 136.58 秒通过，Client 发现新增测试的两项泛型类型错误；仅修测试后官方复验 2/2 通过，23.77 秒 | 不重复构建未变化的生产产物；保留首轮失败，真实订阅生命周期独立复验 1 通过/61 筛选跳过 |
| 最新产物上的设置原规则复验 | 51.17 秒，4 通过、16 筛选跳过 | 四个陈旧版本相关失败关闭，源码、golden、normalizer 和预算保持原规则 |
| 本轮三个工具组合回归 | 39.78 秒，3 文件、66 测试通过 | 过程工具定向验证 |
| 本轮六个工具文件 lint | 2.8 秒，0 warning、0 error | 过程工具定向验证 |
| 正式目录整合后维护回归 | 38.56 秒，4 文件、118 通过、1 原有跳过 | 三个工具与受保护引用验证器的实际组合 |
| 正式目录整合后完整产物 | 311.23 秒，9/9；401 Client 产物、3 公开值 | 独立于候选的 76.57 秒，包含正式目录的 Host 105.38 秒及 Client 137.34 秒编译 |
| 正式目录构建后官方聚合 | 178.57 秒，2/2 | 紧随本次正式目录产物执行 |

现有日志没有为全部任务提供一致的独占耗时，以上不相加为总工时，也不将并行运行时间重复计费。最有价值的优化顺序是先校验范围，再排依赖，最后按受影响行为验证；增加更多全量运行并不能补救错误的目标范围。

## 4. 本轮独立验证与剩余验收

根 agent 独立执行三个工具组合 spec（66/66）、六文件 lint（0/0）、三个实现 strict tsc（exit 0）、真实标签及 master 规划（均 exit 0，范围结论分别匹配/不匹配）和指南定向双语配对（1/1）。[真实 Windows 预检](upstream-windows-preflight-2026-11-18.json)检查 reference-composer 与 focus-rings 两份夹具，0 finding；这只是有限静态检查。

独立 Git 检出缺少 32 个清单 blob 时，规划器按设计停止，没有回退到当前 checkout。对象显式补齐并逐个核对 Git blob hash 后才成功生成报告。一次直接 node 启动文档 aggregate 因缺失 npm_execpath 在检查开始前退出，随后使用官方 pnpm run test:docs 入口重跑；最终状态在升级记录中单列。

以下为候选阶段历史证据；正式目录最新结果见第3节与升级记录。本轮历史候选五处账号 selector 的真实适配器回归已完成：原形可复现，修复后 81/81，所属两包 28 文件、384 测试通过。当前产品候选的最新产物构建通过 9/9，聚合检查首轮新增测试类型问题修复后，官方组合复验 2/2 通过（23.77 秒）；根 agent 独立复验该真实订阅生命周期用例 1 通过、61 筛选跳过。新产物上的 settings 四例按原规则全部通过（51.17 秒，16 筛选跳过），关闭陈旧版本导致的四项失败。导航与文档预览等剩余证据继续保留在[升级记录](upstream-sync-2026-11-18.md)，产品候选尚未验收。

官方 quick-doc 首轮 19/21（39.30 秒）。操作状态 SHA 误报已修复为四条精确 JSON 路径的完整 SHA 元数据例外；根 agent 独立复验其 52 通过/1 原有跳过、两文件 lint 0/0、实现与 spec strict tsc，以及真实仓库引用 gate 均通过。其余字段、同值 note、短 SHA、畸形 JSON 与 organization URL 仍执行原检查。另一失败 gate 涉及 inspector 与 typert/generator 两份 HEAD 既有 README 配对记录；六个对应文件均经 git diff --exit-code 确认本轮未改，保留失败，不重录无关配对。指南自身配对 1/1 通过。上述属于首轮 aggregate 与后续定向修复的组合证据，未声称完整 quick-doc 重跑全绿。该验证阶段接受基线、提交与推送均未推进；后续提交复核见升级记录。
