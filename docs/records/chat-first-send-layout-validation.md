# 首次发送期间的宿主提示布局修复

日期：2026-11-15。状态：已修复并通过相关技术检查，最终证据及宿主同步正在归档。本轮是发送状态切换时的宿主布局缺陷，不改变聊天请求、取消或任务生命周期合同。

## 问题与原因

首次发送进入pending状态后，App在topbar与body之间新增 `send-in-flight` 提示。原宿主仅定义顶部与剩余工作区两行，条件提示成为新的grid子项并占据剩余空间，body被推入隐式行，黄色背景因此占据顶部大部分区域。此问题必须修正宿主区域分配，不能通过隐藏发送提示、固定聊天高度或把提示覆盖在输入区来掩盖。

基线为 `53954f99d6746d06f5a5115dbbae040c1f1d53a1`。私人反馈图仅用于本地调查，不作为公开证据；公开证据应使用实际应用与受控首次发送夹具。

## 边界与验证计划

顶栏、通知、正文及SQL页脚分别占稳定区域；发送提示和工作空间提示位于通知区域，正常换行且有界滚动，内容保留。没有提示时不占空白高度。正文始终使用剩余空间；桌面与窄屏保留各自顶栏/页脚尺寸。

已在真实应用中验证首次发送、流式增量、成功终态、后续失败及显式取消、发送中切到外观再返回。HTTP/SSE及状态由有界本地夹具提供，不调用真实供应商。1918×914下原提示约339px，修复后34px，正文恢复832px；390×1000下原提示914px、正文30px，修复后提示52px、正文892px。成功/失败/取消终态清除提示，正文恢复866/944px。提示正文保留，用户仍能在输入区请求取消。

App状态/导航/多提示共存的两个回归在原实现上出现预期失败（11原有通过），修复后相关三套宿主测试33项全部通过。父任务从仓库根独立执行：

- `/home/superagent/.local/share/vite-plus/bin/vp -C frontend test run`：199文件、1202项通过，包含新增宿主回归，日志 `/tmp/eap-first-send-tests.log`。
- `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run build`：退出0，日志 `/tmp/eap-first-send-build.log`。
- `/home/superagent/.local/share/vite-plus/bin/vp -C frontend run check:architecture`：退出0，日志 `/tmp/eap-first-send-architecture.log`。

负责人执行根typecheck、check:boundaries、三文件format检查及App/测试lint均通过；CSS stylelint保留历史问题，同配置比较HEAD632项、本轮628项，不能声称全文件stylelint通过。落点为L5宿主区域组合，已复用现有呈现与布局，不新增通用组件/共享包。

浏览器两视口18个实际状态检查全部通过；所有聊天状态的消息区、输入框、模型及发送/取消控件在视口内，body没有越界，页面错误和非预期拦截均为空。父任务已亲看窄屏/桌面pending图像，警告完整可读而不挤占正文。详细配对图像、流式夹具范围、状态及精确命令见[证据索引](../evidence/chat-first-send-layout/README.md)。最终CSS只调整声明顺序与空白后再次生产构建退出0，日志 `/tmp/eap-first-send-build-final.log`。After实现提交为 `a7bd75b4850bd50a110be2d5754d83a5bf738b94`，两个生产源码摘要已独立用git show核对与捕获完全一致；后续仅关联证据版本。Windows本机同步属于交付操作，另核对本地修改、原服务编译输出，不以远程提交指针代替。真实供应商调用及数据库不属于本次验证。
