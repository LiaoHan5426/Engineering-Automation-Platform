# 聊天服务配置与语音：证据索引

日期：2026-11-14。配置、语音操作与双视口浏览器技术检查已通过，用户验收另行确认。实现范围、命令与限制见[验证记录](../../records/chat-service-config-validation.md)。本目录保留前轮聊天核心与0f7defa的历史结果。

BEFORE来自真实应用 `dfa9612c25cd12be1822bd16fc14fcd07dc5b133`；AFTER实现提交由验证记录关联。两侧使用同一canonical会话、回答、草稿及保持禁用/不信任的web-review服务器，浅色主题，视口1440×1000与390×1000。页面使用真实应用代码与受控HTTP响应；请求守卫阻止真实模型、MCP和其他非预期写操作。

| 场景 | Before 1440 | After 1440 | Before 390 | After 390 |
|---|---|---|---|---|
| 聊天正文 | [Before](before-chat-1440.png) | [After](after-chat-1440.png) | [Before](before-chat-390.png) | [After](after-chat-390.png) |
| 聊天选项 | [Before](before-chat-options-1440.png) | [After](after-chat-options-1440.png) | [Before](before-chat-options-390.png) | [After](after-chat-options-390.png) |
| MCP列表 | [Before](before-mcp-1440.png) | [After](after-mcp-1440.png) | [Before](before-mcp-390.png) | [After](after-mcp-390.png) |
| MCP编辑 | [Before](before-mcp-editor-1440.png) | [After](after-mcp-editor-1440.png) | [Before](before-mcp-editor-390.png) | [After](after-mcp-editor-390.png) |

新增界面的补充证据：[聊天配置选择器1440](after-chat-config-dialog-1440.png)、[390](after-chat-config-dialog-390.png)，[四操作映射1440](after-config-dialog-1440.png)、[390](after-config-dialog-390.png)，[录音预览1440](after-recording-preview-1440.png)、[390](after-recording-preview-390.png)。这些新增界面没有独立旧实现，前后比较使用上表相同入口。

[主场景结果](after-browser-results.json)、[配置与语音行为](after-behavior-results.json)、[窄屏局部滚动可达性](after-composer-accessibility.json)、[逐文件源码清单](after-source-manifest.json)及[浏览器记录](after-browser.md)保存实际断言、来源和复现命令。配置行为覆盖四操作保存/重开、CAS冲突、响应丢失后的GET核对、未保存关闭与草稿保护；语音行为覆盖显式录音/停止/预览/转录、迟到草稿保护、生成后显式播放、取消失败后的核对。窄屏通过真实wheel滚动输入区到达模型选择和发送区，保持外层工作台与快捷键位置不变；配对主图仍保留相同初始滚动状态。

浏览器使用明确命名的模拟语音服务、模拟麦克风及静音WAV；无真实模型、麦克风、供应商识别或声音硬件调用。协议/交互通过不代表真实识别质量、声音效果、PostgreSQL部署或用户验收通过。
