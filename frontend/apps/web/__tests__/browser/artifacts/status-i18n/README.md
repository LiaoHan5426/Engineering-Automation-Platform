# 分域状态与中英文错误合同证据

2026-11-10，当前工作区实现。用户已批准集中迁移；技术验证不代表用户产品接受。未提交，未新增外部模型调用。

| 文件 | 实际证据与边界 |
|---|---|
| `source-contract-check.json` | 16组Java/TS wire值逐值一致，23个错误目录516码、11组配对资源，当前业务detail读取与UTF-8检查；静态检查不代替运行 |
| `http-result.json` | 完整EapApplication装配、真实HTTP/JDBC、自有schema/工作区；12组检查含基线冲突、UNKNOWN阻塞、存储故障、撤权/过期、非法UUID/JSON、Filter、SSE重读及人工关闭去重 |
| `browser-result.json` | 当前实际Vue能力页面及Axios/SSE客户端；中英2组，故障后保留原执行身份、人工关闭语义和恢复提示；页面错误0、外部请求0 |
| `tool-store-zh-CN.png` / `tool-store-en-US.png` | Chromium截图，已人工查看；完整管理页中不属于本轮的历史静态中文仍保留，不声称全站英文化 |
| `database-result.json` | 开发库及独立schema V35、列注释、两条FAILED候选、CLOSED_UNKNOWN人工核对身份/原未知原因；数据库状态CHECK与领域枚举一致 |
| `host-observation.json` | 8080已有IDE full与恢复后的独立jar full，真实中英404合同一致；PID/端口是临时观测，不能当永久配置 |
| `quality-baseline.json` | 全量stylelint的1693项逐文件对照，所属样式块与本轮前备份或HEAD一致；没有重跑旧基线检查 |
| `validation.json` | 本轮普通/定向/数据库检查汇总、命令、未通过的完整格式/stylelint范围及未执行事项 |
| `browser-failure.png` | 保留首轮测试定位错误：当前记录已经自动选中，历史按钮禁用；已调整测试等待生产记录，不是通过证据 |

`StatusI18nLiveFixture`只位于后端test源：原生产Controller、服务、事务和JDBC均保留，只替换受控时钟、确定性失败provider和指定tool_execution SQL故障。provider按真实流式接口失败两次，外部模型请求0次。QA控制入口仅在测试夹具装配，未进入生产jar组件扫描。

SSE事件和快照的code/status/text一致，message随当前语言变化，journal SHA-256不变。人工关闭是进程停止的人工声明，保留UNKNOWN原因；不会伪造执行成功、取消证明或自动重跑。两次源码冲突候选均进入真实持久认领/失败路径，目标文件仍是冲突后的内容。

可重复静态关口：在仓库根运行 `rtk proxy python scripts/verify-domain-contracts.py`。后端与前端的精确回归命令、环境门控和原有页面交付证据保留规则见[交付记录](../../../../../../../docs/records/delivery-history.md#domain-status-i18n)。完整HTTP脚本为 `frontend/apps/web/__tests__/browser/status-i18n-http.py`；浏览器脚本为 `status-i18n-live.mjs`，使用明确的自有host manifest及5174测试origin，不连接Mock或外部模型。

验证结束后已按进程身份停止临时QA宿主；自有schema和工作区保留用于证据核对。IDE full及独立页面交付jar入口保留运行，均确认生产QA端点为404。
