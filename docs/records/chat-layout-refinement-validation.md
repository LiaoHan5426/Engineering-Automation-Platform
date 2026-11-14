# 聊天空间分配与按需工具：验证记录

日期：2026-11-15。状态：**已完成空间优化、三视口实际浏览器行为和独立技术验证，可供代码审阅；用户验收另行确认。** 本记录对应现有聊天界面的增量优化，不改变消息图、模型、MCP配置或执行授权合同。

## 原问题与基线

此前交互测试覆盖了控件可达和状态保护，不能据此推断顶部与消息区空间分配合理。实际旧应用在1918×900、1440×1000及390×1000、浅色主题、同一公开测试会话下捕获，基线为 `36b9e7a8b5e367a66b7b63bd7c8263c4af4c0581`。原始图像与几何数据位于[本轮证据目录](../evidence/chat-layout-refinement/)。这些是实际应用捕获，不包含私人反馈截图。

常驻快捷键说明卡、整行模型历史及任务摘要叠加占用顶部；项目、网页、语音及待发送内容选项在输入区逐行排列，闲置输入区也很高。基线消息区高度分别约192、281及209px；输入区约332.5、343.4及343px。需要同时改善阅读和写入空间，不能通过隐藏发送/模型控件或扩大不可见祖先滚动区换取表面高度。

## 修改范围与边界

复用公共Button、Dialog、Collapse及现有工具动作，把非必需常驻信息改为按需打开。DSH原client继续由现有适配器挂载，固定上游及摘要清单不变；若增加紧凑入口，必须调用原快捷键操作而非重写编辑器。输入区合并可选设置布局，同时保留显式网页/语音授权、草稿、录音和播放生命周期。

这属于聊天feature的L4装配，以及现有适配器的有界宿主端口；不新增通用包、私有弹窗壳、第二注册表、后台宿主或模型循环。必需错误、撤权、UNKNOWN和无效摘要提示不得因收起说明而隐藏。

## 验证结果

实际BEFORE/AFTER三视口已捕获，父任务已亲看1918与390图像。顶部含原快捷键卡的完整占用由约239.5px压到69px（桌面）、282.3px压到143.8px（窄屏）；消息滚动区分别由约192→472.6px、281.1→572.6px、208.7→362.3px，增幅约146%、104%、74%。桌面输入区332.5→222.4px，窄屏343→327.9px；三行文本框保持约71px，模型和发送控件均在输入区及视口内。精确初始状态、祖先滚动和边界数据以证据JSON为准，不将短回答正文高度误当消息滚动区高度。

从仓库根执行的独立检查：

- `/home/superagent/.local/share/vite-plus/bin/vp -C frontend test run`：199个文件、1200项通过，日志 `/tmp/eap-chat-layout-tests.log`；日志确认包含适配器4项及composer布局25项，定向重跑不累加。
- `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run build`：退出0，日志 `/tmp/eap-chat-layout-build.log`。
- `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run check:architecture`：退出0，日志 `/tmp/eap-chat-layout-architecture.log`。
- 源码负责人执行根typecheck、check:boundaries及八个修改文件lint，均通过；定向覆盖原快捷键编辑器打开/Escape/Ctrl+/dispose、输入区可选详情展开收起不丢slot内输入及草稿。

既有测试中的8080请求被network guard拒绝，未扩大允许名单。stylelint存在历史诊断：同一配置比较HEAD与本轮ChatWorkspace为102→102、TaskComposer为70→70，本轮新增诊断为0；没有把全量stylelint记为通过。

三视口实际交互全部通过：按钮及Ctrl+/打开原快捷键编辑器并Escape关闭；历史读取后关闭；不可用摘要诚实禁用、提供摘要的补充GET夹具验证嵌套编辑草稿关闭确认及取消保留；草稿输入、Shift+Enter、IME和无模型时发送禁用；网页/语音空服务及共享配置关闭后保留详情状态/草稿；待发送正文和附件、模型入口可达。真实wheel使消息区滚动203/103/314px，窗口和所有祖先scrollTop保持0；没有通过隐藏祖先滚动挤出控件。所有页面errors和非预期blocked为空，未执行任何写请求、真实模型、MCP或语音服务。没有验证生成历史摘要的供应商效果。完整结果与命令见[浏览器证据索引](../evidence/chat-layout-refinement/README.md)。

本轮源清单摘要为 `d787330180676aad70bc8feb385f8e63d2b5b44cd45cd7750d1dad70188f410d`；实现提交为 [`67dac90dcfabdd9da5c9490ed2052375ebcc39ac`](https://github.com/LiaoHan5426/Engineering-Automation-Platform/commit/67dac90dcfabdd9da5c9490ed2052375ebcc39ac)。父任务已使用git show逐个核对清单内545个文件的SHA-256，全部与浏览器捕获来源一致；后续文档提交只关联证据版本。旧服务配置证据保留历史，不替代本轮布局验证。
