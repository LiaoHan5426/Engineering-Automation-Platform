# 生成前 Task 绑定与交付归因最小切片

状态：最小生成前绑定切片实现、父任务回归、实库协议、内置预览交互与独立复核通过。承接 `544b8f9` POST_HOC，不新增调度器或把只读 Git Run 改成代码执行者。真实供应商与用户产品最终验收仍未完成。

## 合同

- `TaskContext.taskRef` 仅 code 接受，字段为 `projectId/taskId/revision`。省略保留普通 Chat；显式 null、非法身份或额外字段拒绝。不接受客户端目标/验收正文作为权威任务快照。
- 生成前在独立事务中依次锁 Task、workspace，验证 ready/完整准备/精确 revision/无活跃执行、原型选择一致；同一次提交保存原始任务、版本、原型内容与完整有界源码。提交后读回才进入模型，模型调用不持锁。
- apply 的 Task 校验与 APPLYING 领取同事务、同锁序。任务更新/换原型/Run 启动识别绑定的 APPLYING/UNKNOWN 意图；PROPOSED 不阻止编辑，但旧 revision 不能应用。完成后的只读重放不要求 Task 仍为 ready。
- delivery 请求不变，仍只收可选 applicationRef。服务端从原始 generation 判定 PREBOUND/POST_HOC，绑定错误不可降级。接受使用交付/Run 原 revision，不误拿提交后 r+1 比较；拒绝保留证据且不重采源码。
- 已有 generation 禁止追补任务身份；迁移只能追加，不改已应用 V13–V15 或此阶段已生效新迁移的 checksum。

## 前端最小交互

看板已保存 ready 任务携带精确任务及原型身份；规划任务仅带讨论草稿。未保存/陈旧任务不带入。Chat 先显示待采用，不自动消费、替换或发送；公共 ConfirmBox 明示采用影响，取消保留原稿。确认后整体采用文本、身份、原型，清理上一 scratch 的场景/资源/交付信息，不继承旧工具开关，目标文件为空由用户明确填写。显示原任务 revision，允许显式移除绑定；冲突不自动更新 revision。Mock 拒绝产生持久任务绑定证据。

已搜索并复用公共 ConfirmBox/Button/Input；DTO 在 runtime-client，交接状态复用 shell/workbench，纯转换与展示留 Chat/Board L4，无新增共享包或并行 UI 壳。

## 验证与边界

- 前端 `rtk proxy pnpm --dir frontend test run`：82文件/396项通过；typecheck、check:boundaries、build通过。
- 回归覆盖精确任务身份、草稿采用/取消、旧场景/资源不混入、错误保稿且不误判模型切换/会话过期、mock拒绝、PREBOUND与POST_HOC展示。
- 本地浏览器 5173/真实API：复用明确测试任务 `4d95a36d-1afa-47b1-a0bf-23a96942e045`，看板→Chat先显示待采用；取消不改草稿；确认后出现精确 task/revision、目标为空、无消息或模型调用。1440×900及708×640无页面横溢，输入区域在视口内。自动Chromium检查不等于完整内置预览或用户产品验收。
- 后端A+B已实现；V16/V17已在开发环境加载并经实库使用，后续不得改写checksum。父任务全量首次180秒超时未完成，重新以600秒限额执行成功：`EAP_RUN_BOARD_PERSISTENCE=true EAP_RUN_MISSION_GIT_ACCEPTANCE=true rtk proxy mvn -f backend/pom.xml test` 569项、0失败/错误、6条件跳过。Fake模型+真实临时文件+实库覆盖绑定/应用/双向竞态/UNKNOWN/原型/交付接受及跨任务拒绝，不是实际供应商或用户产品验收。
- 最终前端82文件/397项通过，类型/边界/构建通过（保留现有大包警告）。应用任务版本409拒绝原先被GET(PROPOSED)刷新清空，已新增RED→GREEN回归并保留拒绝原因；GET仍优先核对实际结果，不重复写入。
- drive_preview桥无响应后，使用computer_use操作实际Hermes内置预览：看板测试卡→准备任务草稿→确认采用。截图复核绑定显示local-eap/原任务ID/r1、目标为空、任务正文仍在输入框、发送因无模型禁用；未调用模型。最终画面证据 `E:/ai/Hermes/profiles/eap/cache/images/computer_use_4dd213acbb774f7dac43455a0116815e.png`（本机不提交）。仅确认该交互，不代表用户产品验收。
- 独立审查发现CODE_WORKSPACE_BUSY误显示模型变更，已按RED→GREEN补任务阻塞映射；最终前端82文件/398项及类型/边界/构建通过，最终独立复核通过。后端569项仍为上述父任务执行记录，6跳过；真实供应商生成→应用→验证→人工接受仍未验收。
