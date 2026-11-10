# 会话结构与产品展示优化证据

2026-11-10，当前未提交工作区。保留此前多文件交付及状态/i18n改动；本次不提交推送，自动化验证不替代用户接受。

| 证据 | 覆盖与边界 |
|---|---|
| `source-audit.json` | 118个生产Java文件变化，其中113个通过移除import、规范类型引用后的代码token及原始字面量／注释等价检查；5个领域逻辑文件单独测试。当前目标修改UTF-8无BOM |
| `http-result.json` | 完整EapApplication＋独立PostgreSQL schema／Git工作区；6组检查：严格合同、双语拒绝前不恢复、同ID恢复绑定、工作记忆恢复、零模型调用／空模型窗口、停用拒绝后恢复 |
| `browser-result.json` | 实际Vue页面及runtime-client；中英各1次恢复＋用户明确重试后1次发送，额外绑定请求0；真实刷新保留正文；3种宽度无页面横溢；pageerror及外部请求0 |
| `chat-*-1440.png` | 默认折叠上下文／附件，变更面板只显示真实检查状态、单个预览入口及待人工验收；已对照用户原截图人工查看 |
| `chat-*-900.png`／`chat-*-390.png` | 响应式截图；源码诊断详情可展开；窄屏沿用既有抽屉与公共控件 |
| `package-result.json`／`host-restoration.json` | 独立命名Boot包通过、临时finalName修改逐字节恢复、测试夹具不入包；默认名首次打包因在用jar无法重命名失败，随后恢复默认可启动jar并按原52025端口／工作区重启自有独立进程。IDE8080未停，两入口健康；正式包QA路由404 |

定向命令与结果：

- 后端：`rtk proxy mvn -f backend/pom.xml -pl :eap-full-application -am test '-Dtest=AiChatApplicationTest,AiConversationReconnectTest,AiConversationRegistryTest,TaskWorkingMemoryTest,WorkingMemoryPersistenceTest,WorkingMemoryAdversarialTest,WorkingMemoryApiTest,ConversationContextEfficiencyTest,ModelConnectionsTest,ChatGptLoginTest,ChatGptPlanChatModelTest,PlatformProblemContractTest' '-Dsurefire.failIfNoSpecifiedTests=false' -q`：12类55项，失败／错误／跳过均0；reactor生产及测试编译通过。
- 前端：`rtk proxy pnpm --dir frontend exec vp test run apps/web/__tests__/features/chat apps/web/__tests__/features/shell apps/web/__tests__/mock/chatBackend.test.ts apps/web/__tests__/mock/reconnectHttp.test.ts packages/runtime-client/__tests__/languageAndWire.test.ts`：74文件461项。最后的异步结果保护定向sessionPersistence／chatSession／reconnectSession／ChatWorkspace.reconnect：4文件78项；不是可累加的独立总数。
- 新性能回归：100个连续delta在150ms内不写历史、检查点仅写1次；最终结果立即写入，定时器不再补写，草稿及时保留；启动快照只读1次。重复敏感清理仍执行2次模型窗口清空，但相同工作记忆仅保存1次。
- `typecheck`、`build`、`check:architecture`通过；目标格式/lint通过；新任务摘要组件stylelint通过。沿用公共Button/Input/Feedback/Collapse，无新增基础控件、空包或边界豁免。
- 最终Boot打包使用临时独立finalName执行原reactor `package -DskipTests`，POM逐字节恢复，未重复测试；默认名首次打包失败及在用产物恢复单独记录，不能把它记成默认命令一次成功。恢复后的默认jar与已验证独立jar一致，IDE管理的服务未重启，不据其健康响应声称已加载本轮代码。临时QA宿主按身份停止，独立证据schema和工作区保留。
- `rtk proxy python frontend/apps/web/__tests__/browser/conversation-recovery-http.py`：6组；启动测试源`ConversationRecoveryLiveFixture`，元数据位于`backend/target/session-optimization/current-live.json`。浏览器从frontend运行`rtk proxy node apps/web/__tests__/browser/conversation-optimization-live.mjs`，需设置既有`EAP_PLAYWRIGHT_MODULE/EAP_CHROMIUM`。

失败与修正保留口径：初次定向前端3项因产品文案变更失败，已同步断言并保留“无明细不通过”的行为检查；测试fixture初次javac未保留参数名，观测接口400，已使用显式@RequestParam名称并重新验证。临时启动核对发现宿主工作区由EAP_WORKSPACE控制，已改为显式隔离环境并增加启动断言；不把错误工作区的启动当验证。批量import脚本曾误扫描target备份，已停止，恢复原备份、删除本次生成的递归副本，改用rg生产源清单；113文件等价检查通过。

单元测试网络守卫仍报告被阻止的8080访问尝试，不当成真实HTTP通过。全仓格式／stylelint存量问题没有在本轮重新清理或宣称全绿；上一轮基线见status-i18n证据。此前真实外部模型交付未重跑。本轮恢复HTTP模型调用0次，浏览器明确重试共2次确定性provider调用；外部模型0次。数据库只迁移独立QA schema至已有V35，没有新增生产迁移。
